/**
 * WhatsApp scheduled-message bot - mobile edition.
 *
 * Runs anywhere Node runs, including Termux on Android: it talks to WhatsApp
 * over the same WebSocket protocol the phone app uses, so there is no Chrome
 * and no chromedriver to install. Log in once by scanning a QR code (or by
 * entering an 8-character pairing code), and the session is stored in
 * ./auth_state for every run after that.
 *
 * Each entry in config.json's "jobs" array is one scheduled message - a plain
 * text message or a native poll - sent to any mix of groups and individual
 * people, repeating hourly, daily, weekly, monthly, yearly, or on raw cron.
 *
 *   node bot.js                        run every enabled job on its schedule
 *   node bot.js --now                  send every enabled job once, now
 *   node bot.js --now "Lift poll"      send just that job once, now
 *   node bot.js --list-jobs            show the jobs and when they next fire
 *   node bot.js --list-groups          print the groups this account can post to
 *   node bot.js --send "hi" --to "Mom,My Group"   one-off, no config needed
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
} = require('@whiskeysockets/baileys');

const { toCronExpression, describe } = require('./schedule');
const { normalizeTargets, describeTarget } = require('./recipients');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const AUTH_DIR = path.join(__dirname, 'auth_state');
const LOG_PATH = path.join(__dirname, 'bot.log');

// Pause between recipients of one fan-out, so a burst doesn't look like spam.
const SEND_GAP_MS = 2000;

function log(message) {
    const line = `${new Date().toISOString()} - ${message}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_PATH, `${line}\n`);
    } catch (err) {
        // Logging must never take the bot down.
    }
}

/* ------------------------------- config ------------------------------- */

// The first version of this bot had a single poll at the top level of
// config.json. Older configs keep working by being folded into one job.
function migrateLegacyConfig(config) {
    if (Array.isArray(config.jobs)) return config;
    if (!config.poll_question) return { ...config, jobs: [] };

    log('config.json uses the old single-poll format; treating it as one job.');
    return {
        timezone: config.timezone,
        pairing_phone_number: config.pairing_phone_number,
        jobs: [{
            name: 'Poll',
            enabled: true,
            to: { group: config.group_name },
            message: {
                type: 'poll',
                question: config.poll_question,
                options: config.poll_options,
                allow_multiple_answers: config.allow_multiple_answers,
            },
            schedule: { every: 'weekly', day: config.schedule_day, time: config.schedule_time },
        }],
    };
}

function validateJob(job, index) {
    const label = `jobs[${index}]${job.name ? ` ("${job.name}")` : ''}`;

    // Accepts a single name/number or any mix of groups and people.
    const targets = normalizeTargets(job.to, label);

    const message = job.message;
    if (!message || typeof message !== 'object') throw new Error(`${label}: a "message" block is required`);

    const type = String(message.type ?? 'text').toLowerCase();
    if (type === 'text') {
        if (!String(message.text ?? '').trim()) throw new Error(`${label}: a text message needs "text"`);
    } else if (type === 'poll') {
        const options = message.options || [];
        if (!String(message.question ?? '').trim()) throw new Error(`${label}: a poll needs a "question"`);
        if (options.length < 2) throw new Error(`${label}: a poll needs at least 2 "options"`);
        if (options.length > 12) throw new Error(`${label}: WhatsApp allows at most 12 poll options`);
    } else {
        throw new Error(`${label}: "message.type" must be "text" or "poll", got "${message.type}"`);
    }

    // Throws if the schedule is malformed, so typos surface before we log in.
    const expression = toCronExpression(job.schedule, label);
    if (!cron.validate(expression)) throw new Error(`${label}: "${expression}" is not a valid cron expression`);

    return { ...job, name: job.name || `job ${index + 1}`, targets, cronExpression: expression, label };
}

function loadConfig() {
    let raw;
    try {
        raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    } catch (err) {
        throw new Error(`config.json not found at ${CONFIG_PATH}`);
    }

    const config = migrateLegacyConfig(JSON.parse(raw));
    if (!Array.isArray(config.jobs)) throw new Error('config.json: "jobs" must be an array');

    config.jobs = config.jobs.map(validateJob);
    return config;
}

/* ----------------------------- connection ----------------------------- */

async function connect(config) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    // --pair beats config.json, so a personal number never has to be committed.
    const pairNumber = config.pairingNumberOverride || config.pairing_phone_number;
    const usePairingCode = !state.creds.registered && Boolean(pairNumber);

    const sock = makeWASocket({
        version,
        auth: state,
        // QR is printed by hand below so the pairing-code path can suppress it.
        printQRInTerminal: false,
        // Pairing codes are rejected for some browser identities; this one is
        // the combination WhatsApp reliably accepts for a linked device.
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    // Asking for a pairing code before the socket is ready yields a code
    // WhatsApp then refuses, so this waits for the first QR event - which is
    // WhatsApp saying it is ready to link - rather than guessing with a timer.
    let pairingRequested = false;
    async function requestPairingCode() {
        if (pairingRequested) return;
        pairingRequested = true;
        try {
            const number = String(pairNumber).replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(number);
            log(`Pairing code: ${code}`);
            log('Enter it NOW in WhatsApp > Linked devices > Link with phone number.');
            log('It expires in about a minute; rerun this command for a fresh one.');
        } catch (err) {
            log(`Could not request a pairing code: ${err.message}`);
        }
    }

    // Resolves once we are logged in; rejects if the login is permanently refused.
    return new Promise((resolve, reject) => {
        let settled = false;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                if (usePairingCode) {
                    // The socket is ready to link; now the code will be accepted.
                    requestPairingCode();
                } else {
                    log('Scan this QR code with WhatsApp > Linked devices > Link a device');
                    qrcode.generate(qr, { small: true });
                }
            }

            if (connection === 'open' && !settled) {
                settled = true;
                log('Connected to WhatsApp.');
                resolve(sock);
            }

            if (connection === 'close') {
                const status = lastDisconnect?.error?.output?.statusCode;

                if (status === DisconnectReason.loggedOut) {
                    // The stored session is dead; drop it so the next run shows a fresh QR.
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    const err = new Error('Logged out on the phone. Run the bot again and link it once more.');
                    if (settled) log(err.message);
                    else { settled = true; reject(err); }
                    return;
                }

                log(`Connection closed (${status ?? 'unknown reason'}), reconnecting...`);
                if (settled) {
                    // Re-establish in the background so the scheduler keeps working.
                    connect(config)
                        .then((fresh) => { liveSocket = fresh; })
                        .catch((err) => log(`Reconnect failed: ${err.message}`));
                }
            }
        });
    });
}

// Scheduled jobs read through this so they pick up post-reconnect sockets.
let liveSocket = null;

/* ------------------------------ recipients ---------------------------- */

async function findGroups(sock) {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups);
}

async function resolveGroupId(sock, groupName) {
    const groups = await findGroups(sock);
    const wanted = groupName.trim().toLowerCase();

    // Exact name first, then a forgiving contains-match for stray spaces/emoji.
    const exact = groups.find((g) => (g.subject || '').trim().toLowerCase() === wanted);
    if (exact) return exact.id;

    const partial = groups.filter((g) => (g.subject || '').toLowerCase().includes(wanted));
    if (partial.length === 1) return partial[0].id;
    if (partial.length > 1) {
        throw new Error(`"${groupName}" matches several groups: ${partial.map((g) => g.subject).join(', ')}`);
    }

    throw new Error(
        `Group "${groupName}" not found. Your groups are:\n  ` +
        groups.map((g) => g.subject).join('\n  ')
    );
}

async function resolveNumberId(sock, number) {
    // WhatsApp wants the full international number without "+" or separators.
    const digits = String(number).replace(/[^0-9]/g, '');
    if (digits.length < 8) {
        throw new Error(`"${number}" does not look like a full international number (e.g. 27821234567)`);
    }

    const [result] = await sock.onWhatsApp(`${digits}@s.whatsapp.net`);
    if (!result?.exists) throw new Error(`${digits} is not a WhatsApp account`);

    return result.jid;
}

function resolveTarget(sock, target) {
    return target.kind === 'group'
        ? resolveGroupId(sock, target.value)
        : resolveNumberId(sock, target.value);
}

/* ------------------------------- sending ------------------------------ */

// Lets a daily message say "Good morning, it's Tuesday the 3rd" without code.
function expandPlaceholders(text, timezone) {
    const now = new Date();
    const locale = 'en-GB';
    const part = (options) => new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(now);

    return String(text)
        .replace(/\{date\}/g, part({ dateStyle: 'long' }))
        .replace(/\{time\}/g, part({ hour: '2-digit', minute: '2-digit', hour12: false }))
        .replace(/\{day\}/g, part({ weekday: 'long' }))
        .replace(/\{month\}/g, part({ month: 'long' }))
        .replace(/\{year\}/g, part({ year: 'numeric' }));
}

function buildMessage(message, timezone) {
    if (String(message.type ?? 'text').toLowerCase() === 'poll') {
        return {
            poll: {
                name: expandPlaceholders(message.question, timezone),
                values: message.options,
                selectableCount: message.allow_multiple_answers ? message.options.length : 1,
            },
        };
    }

    return { text: expandPlaceholders(message.text, timezone) };
}

async function runJob(sock, job, timezone) {
    const payload = buildMessage(job.message, timezone);
    const targets = job.targets;
    let failures = 0;

    for (const [index, target] of targets.entries()) {
        const who = describeTarget(target);
        try {
            const jid = await resolveTarget(sock, target);
            await sock.sendMessage(jid, payload);
            log(`Sent "${job.name}" to ${who}.`);
        } catch (err) {
            // One bad recipient must not stop the rest of the list.
            failures += 1;
            log(`FAILED "${job.name}" to ${who}: ${err.message}`);
        }

        // Space out a fan-out; bursts of identical messages look like spam.
        if (index < targets.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
        }
    }

    if (failures) {
        throw new Error(`"${job.name}": ${failures} of ${targets.length} recipient(s) failed`);
    }
}

/* -------------------------------- CLI --------------------------------- */

function flagValue(name) {
    const index = process.argv.indexOf(name);
    if (index === -1) return null;
    const value = process.argv[index + 1];
    return value && !value.startsWith('--') ? value : '';
}

function selectJobs(jobs, wantedName) {
    const enabled = jobs.filter((job) => job.enabled !== false);

    if (!wantedName) return enabled;

    const wanted = wantedName.trim().toLowerCase();
    // Name a job explicitly and it runs even if it is disabled in config.
    const matches = jobs.filter((job) => job.name.toLowerCase() === wanted);
    if (matches.length === 0) {
        throw new Error(`No job named "${wantedName}". Known jobs: ${jobs.map((j) => j.name).join(', ')}`);
    }
    return matches;
}

async function closeAfterFlush(sock) {
    // Give WhatsApp a moment to flush outgoing messages before closing.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await sock.end();
}

async function main() {
    const config = loadConfig();

    // Keeps a personal number out of the tracked config file.
    const pairFlag = flagValue('--pair');
    config.pairingNumberOverride = pairFlag || process.env.WA_PAIR_NUMBER || '';
    const timezone = config.timezone || undefined;

    // Half-finished logins leave state behind that makes later attempts fail.
    if (process.argv.includes('--reset')) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        log('Cleared the saved login. The next run will ask you to link again.');
        return;
    }

    const listGroups = process.argv.includes('--list-groups');
    const listJobs = process.argv.includes('--list-jobs');
    const sendNow = process.argv.includes('--now');
    const adHocText = flagValue('--send');
    const adHocTarget = flagValue('--to');

    if (listJobs) {
        console.log(`\n${config.jobs.length} job(s) in config.json:`);
        for (const job of config.jobs) {
            const state = job.enabled === false ? ' [disabled]' : '';
            console.log(`  ${job.name}${state}`);
            console.log(`      to:       ${job.targets.map(describeTarget).join(', ')}`);
            console.log(`      type:     ${job.message.type ?? 'text'}`);
            console.log(`      schedule: ${describe(job.schedule)}  (cron: ${job.cronExpression})`);
        }
        return;
    }

    if (adHocText !== null) {
        if (!adHocText) throw new Error('--send needs a message, e.g. --send "hello" --to "Mom"');
        if (!adHocTarget) throw new Error('--send also needs --to "<group name or number>"');
    }

    const sock = await connect(config);
    liveSocket = sock;

    if (listGroups) {
        const groups = await findGroups(sock);
        console.log('\nGroups this account can post to:');
        groups.forEach((g) => console.log(`  ${g.subject}`));
        await sock.end();
        return;
    }

    if (adHocText) {
        // --to takes a comma-separated mix: "My Group,27821234567,Other Group".
        const targets = normalizeTargets(adHocTarget.split(',').map((s) => s.trim()).filter(Boolean), '--to');
        await runJob(sock, {
            name: 'one-off message',
            targets,
            message: { type: 'text', text: adHocText },
        }, timezone).catch(() => { process.exitCode = 1; });
        await closeAfterFlush(sock);
        return;
    }

    if (sendNow) {
        const jobs = selectJobs(config.jobs, flagValue('--now'));
        let failures = 0;
        for (const job of jobs) {
            await runJob(sock, job, timezone).catch(() => { failures += 1; });
        }
        await closeAfterFlush(sock);
        if (failures) process.exitCode = 1;
        return;
    }

    const jobs = selectJobs(config.jobs);
    if (jobs.length === 0) throw new Error('No enabled jobs in config.json. Nothing to schedule.');

    for (const job of jobs) {
        cron.schedule(job.cronExpression, () => {
            // liveSocket, not sock: a reconnect swaps the socket underneath us.
            runJob(liveSocket, job, timezone).catch(() => { /* already logged */ });
        }, timezone ? { timezone } : undefined);

        log(`Scheduled "${job.name}" ${describe(job.schedule)}${timezone ? ` (${timezone})` : ''}.`);
    }

    log('Leave this running. Press Ctrl+C to stop.');
}

main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
});
