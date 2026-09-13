/**
 * Normalizes the many shapes a job's "to" field is allowed to take into one
 * flat list of { kind: 'group'|'number', value } targets, so a single message
 * can fan out to any mix of groups and individual people.
 *
 * All of these are accepted:
 *   "to": "My Group"
 *   "to": "27821234567"
 *   "to": ["My Group", "27821234567"]
 *   "to": { "group": "My Group" }
 *   "to": { "number": "27821234567" }
 *   "to": { "groups": ["A", "B"], "numbers": ["27821234567"] }
 *   "to": [{ "group": "A" }, { "number": "27821234567" }]
 */

// A bare string is a number if it looks like a phone number, else a group name.
const NUMBER_LIKE = /^\+?[0-9][0-9\s().-]{6,}$/;

function classifyString(value, label) {
    const text = String(value).trim();
    if (!text) throw new Error(`${label}: "to" contains an empty entry`);

    return NUMBER_LIKE.test(text)
        ? { kind: 'number', value: text }
        : { kind: 'group', value: text };
}

function normalizeEntry(entry, label) {
    if (typeof entry === 'string') return [classifyString(entry, label)];

    if (!entry || typeof entry !== 'object') {
        throw new Error(`${label}: "to" entries must be a name, a number, or an object`);
    }

    const targets = [];
    const push = (kind, values) => {
        for (const value of [].concat(values)) {
            const text = String(value).trim();
            if (!text) throw new Error(`${label}: "to" contains an empty ${kind}`);
            targets.push({ kind, value: text });
        }
    };

    if (entry.group !== undefined) push('group', entry.group);
    if (entry.groups !== undefined) push('group', entry.groups);
    if (entry.number !== undefined) push('number', entry.number);
    if (entry.numbers !== undefined) push('number', entry.numbers);

    if (targets.length === 0) {
        throw new Error(`${label}: "to" needs "group"/"groups" and/or "number"/"numbers"`);
    }

    return targets;
}

function normalizeTargets(to, label) {
    if (to === undefined || to === null) throw new Error(`${label}: a "to" field is required`);

    const entries = Array.isArray(to) ? to : [to];
    if (entries.length === 0) throw new Error(`${label}: "to" is empty - nobody to send to`);

    const targets = entries.flatMap((entry) => normalizeEntry(entry, label));

    // Drop duplicates so listing a group twice doesn't send the message twice.
    const seen = new Set();
    return targets.filter((target) => {
        // Compare numbers digits-only, so "+27 82 123 4567" and "27821234567"
        // count as the same person.
        const identity = target.kind === 'number'
            ? target.value.replace(/[^0-9]/g, '')
            : target.value.trim().toLowerCase();
        const key = `${target.kind}:${identity}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const describeTarget = (target) => (target.kind === 'group' ? `group "${target.value}"` : target.value);

module.exports = { normalizeTargets, describeTarget, NUMBER_LIKE };
