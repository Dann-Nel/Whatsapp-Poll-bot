/**
 * Turns the human-friendly "schedule" block from config.json into a cron
 * expression. Everything node-cron needs is expressible as the five standard
 * fields, so hourly through yearly all funnel down to one string.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];

function parseTime(time, label) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
    if (!match) throw new Error(`${label}: "time" must look like "09:00", got "${time}"`);

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Error(`${label}: "time" is not a real time: "${time}"`);

    return { hour, minute };
}

function parseMinute(value, label) {
    const minute = Number(String(value ?? '0').replace(/^:/, ''));
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        throw new Error(`${label}: "minute" must be 0-59, got "${value}"`);
    }
    return minute;
}

function parseDayOfWeek(day, label) {
    const index = DAYS.indexOf(String(day ?? '').trim().toLowerCase());
    if (index === -1) throw new Error(`${label}: "day" must be a weekday name, got "${day}"`);
    return index;
}

function parseDayOfMonth(value, label) {
    // "last" is not a cron concept, so it is rejected rather than silently wrong.
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error(`${label}: "day_of_month" must be 1-31, got "${value}"`);
    }
    return day;
}

function parseMonth(value, label) {
    const named = MONTHS.indexOf(String(value ?? '').trim().toLowerCase());
    if (named !== -1) return named + 1;

    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;

    throw new Error(`${label}: "month" must be a month name or 1-12, got "${value}"`);
}

function toCronExpression(schedule, label) {
    if (!schedule || typeof schedule !== 'object') {
        throw new Error(`${label}: a "schedule" block is required`);
    }

    const every = String(schedule.every ?? '').trim().toLowerCase();

    switch (every) {
        case 'hourly': {
            // Fires once an hour at this minute past the hour.
            const minute = parseMinute(schedule.minute, label);
            return `${minute} * * * *`;
        }
        case 'daily': {
            const { hour, minute } = parseTime(schedule.time, label);
            return `${minute} ${hour} * * *`;
        }
        case 'weekly': {
            const { hour, minute } = parseTime(schedule.time, label);
            return `${minute} ${hour} * * ${parseDayOfWeek(schedule.day, label)}`;
        }
        case 'monthly': {
            const { hour, minute } = parseTime(schedule.time, label);
            return `${minute} ${hour} ${parseDayOfMonth(schedule.day_of_month, label)} * *`;
        }
        case 'yearly': {
            const { hour, minute } = parseTime(schedule.time, label);
            const day = parseDayOfMonth(schedule.day_of_month, label);
            return `${minute} ${hour} ${day} ${parseMonth(schedule.month, label)} *`;
        }
        case 'cron': {
            // Escape hatch for anything the shorthands above don't cover.
            if (!schedule.expression) throw new Error(`${label}: "cron" needs an "expression"`);
            return String(schedule.expression).trim();
        }
        default:
            throw new Error(
                `${label}: "every" must be one of hourly, daily, weekly, monthly, yearly, cron - got "${schedule.every}"`
            );
    }
}

// Plain-English echo of a schedule, for --list-jobs and the startup banner.
function describe(schedule) {
    const every = String(schedule?.every ?? '').toLowerCase();
    switch (every) {
        case 'hourly': return `every hour at :${String(parseMinute(schedule.minute, 'x')).padStart(2, '0')}`;
        case 'daily': return `every day at ${schedule.time}`;
        case 'weekly': return `every ${schedule.day} at ${schedule.time}`;
        case 'monthly': return `on day ${schedule.day_of_month} of every month at ${schedule.time}`;
        case 'yearly': return `every ${schedule.month} ${schedule.day_of_month} at ${schedule.time}`;
        case 'cron': return `cron "${schedule.expression}"`;
        default: return 'unknown schedule';
    }
}

module.exports = { toCronExpression, describe, DAYS, MONTHS };
