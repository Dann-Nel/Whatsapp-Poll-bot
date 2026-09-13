/**
 * A local cache of the account's WhatsApp contacts, so jobs can name a person
 * ("Mom") instead of typing a phone number.
 *
 * Baileys has no contact store, and contacts only arrive as sync events after
 * connecting, so they are collected as they stream in and written to
 * contacts.json. Later runs read the file and can resolve names immediately.
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'contacts.json');

function load() {
    try {
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch (err) {
        return {};
    }
}

function save(contacts) {
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(contacts, null, 2)}\n`);
}

// WhatsApp offers several names per contact; prefer the one the user set.
function bestName(contact) {
    return contact.name || contact.notify || contact.verifiedName || '';
}

/**
 * Merges freshly synced contacts into the cache. Only individual people are
 * kept - groups are resolved separately, and broadcast/status entries are not
 * something you can message.
 */
function merge(cache, incoming) {
    let added = 0;

    for (const contact of incoming || []) {
        const jid = contact.id || contact.jid;
        if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;

        const name = bestName(contact);
        if (!name) continue;

        if (!cache[jid] || cache[jid] !== name) added += 1;
        cache[jid] = name;
    }

    return added;
}

function findByName(cache, wanted) {
    const target = String(wanted).trim().toLowerCase();
    const entries = Object.entries(cache);

    const exact = entries.filter(([, name]) => name.trim().toLowerCase() === target);
    if (exact.length === 1) return exact[0][0];
    if (exact.length > 1) {
        throw new Error(
            `"${wanted}" matches ${exact.length} contacts. Use their phone number instead.`
        );
    }

    const partial = entries.filter(([, name]) => name.toLowerCase().includes(target));
    if (partial.length === 1) return partial[0][0];
    if (partial.length > 1) {
        throw new Error(
            `"${wanted}" matches several contacts: ${partial.map(([, n]) => n).join(', ')}. ` +
            'Use a fuller name or their phone number.'
        );
    }

    return null;
}

module.exports = { load, save, merge, findByName, bestName, CACHE_PATH };
