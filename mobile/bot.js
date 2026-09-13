/**
 * WhatsApp Poll Bot - mobile edition.
 *
 * Runs anywhere Node runs, including Termux on Android: it talks to WhatsApp
 * over the same WebSocket protocol the phone app uses, so there is no Chrome
 * and no chromedriver to install. Log in once by scanning a QR code (or by
 * entering an 8-character pairing code), and the session is stored in
 * ./auth_state for every run after that.
 *
 *   node bot.js                 start the scheduler and wait for the poll time
 *   node bot.js --now           send the poll immediately, then exit
 *   node bot.js --list-groups   print the groups this account can post to
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
} = require('@whiskeysockets/baileys');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const AUTH_DIR = path.join(__dirname, 'auth_state');
const LOG_PATH = path.join(__dirname, 'poll_bot.log');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function log(message) {
    const line = `${new Date().toISOString()} - ${message}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_PATH, `${line}\n`);
    } catch (err) {
        // Logging must never take the bot down.
    }
}

function loadConfig() {
    let raw;
    try {
        raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    } catch (err) {
        throw new Error(`config.json not found at ${CONFIG_PATH}`);
    }

    const config = JSON.parse(raw);
    const options = config.poll_options || [];

    if (!config.group_name) throw new Error('config.json: "group_name" is required');
    if (!config.poll_question) throw new Error('config.json: "poll_question" is required');
    if (options.length < 2) throw new Error('config.json: "poll_options" needs at least 2 options');
    if (options.length > 12) throw new Error('config.json: WhatsApp allows at most 12 poll options');

    return config;
}

// Turn schedule_day / schedule_time from config.json into a cron expression.
function toCronExpression(day, time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
    if (!match) throw new Error(`config.json: "schedule_time" must look like "09:00", got "${time}"`);

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error(`config.json: "schedule_time" is not a real time: "${time}"`);

    const wanted = String(day || '').trim().toLowerCase();
    const dayField = wanted === 'daily' || wanted === 'every day' ? '*' : DAYS.indexOf(wanted);
    if (dayField === -1) {
        throw new Error(`config.json: "schedule_day" must be a weekday name or "daily", got "${day}"`);
    }

    return `${minute} ${hour} * * ${dayField}`;
}

async function connect(config) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const usePairingCode = !state.creds.registered && Boolean(config.pairing_phone_number);

    const sock = makeWASocket({
        version,
        auth: state,
        // QR is printed by hand below so the pairing-code path can suppress it.
        printQRInTerminal: false,
        browser: ['Poll Bot', 'Chrome', '1.0.0'],
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    if (usePairingCode) {
        // Baileys needs an open socket before it can ask for a pairing code.
        setTimeout(async () => {
            try {
                const number = String(config.pairing_phone_number).replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(number);
                log(`Pairing code: ${code}  (WhatsApp > Linked devices > Link with phone number)`);
            } catch (err) {
                log(`Could not request a pairing code: ${err.message}`);
            }
        }, 3000);
    }

    // Resolves once we are logged in; rejects if the login is permanently refused.
    return new Promise((resolve, reject) => {
        let settled = false;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !usePairingCode) {
                log('Scan this QR code with WhatsApp > Linked devices > Link a device');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open' && !settled) {
                settled = true;
                log('Connected to WhatsApp.');
                resolve(sock);
            }

            if (connection === 'close') {
                const status = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = status === DisconnectReason.loggedOut;

                if (loggedOut) {
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
                    connect(config).catch((err) => log(`Reconnect failed: ${err.message}`));
                }
            }
        });
    });
}

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

async function sendPoll(sock, config) {
    const groupId = await resolveGroupId(sock, config.group_name);

    await sock.sendMessage(groupId, {
        poll: {
            name: config.poll_question,
            values: config.poll_options,
            selectableCount: config.allow_multiple_answers ? config.poll_options.length : 1,
        },
    });

    log(`Poll sent to "${config.group_name}".`);
}

async function main() {
    const config = loadConfig();
    const sendNow = process.argv.includes('--now');
    const listGroups = process.argv.includes('--list-groups');

    // Validate the schedule before logging in, so a typo fails instantly.
    const cronExpression = sendNow || listGroups ? null : toCronExpression(config.schedule_day, config.schedule_time);

    const sock = await connect(config);

    if (listGroups) {
        const groups = await findGroups(sock);
        console.log('\nGroups this account can post to:');
        groups.forEach((g) => console.log(`  ${g.subject}`));
        await sock.end();
        return;
    }

    if (sendNow) {
        await sendPoll(sock, config);
        // Give WhatsApp a moment to flush the outgoing message before closing.
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await sock.end();
        return;
    }

    log(`Scheduled: every ${config.schedule_day} at ${config.schedule_time} (${config.timezone || 'system time'}).`);
    log('Leave this running. Press Ctrl+C to stop.');

    cron.schedule(cronExpression, async () => {
        try {
            await sendPoll(sock, config);
        } catch (err) {
            log(`Failed to send the poll: ${err.message}`);
        }
    }, config.timezone ? { timezone: config.timezone } : undefined);
}

main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
});
