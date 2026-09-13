# WhatsApp scheduled-message bot — phone edition

Runs entirely on your Android phone in [Termux](https://f-droid.org/packages/com.termux/).
No PC, no Chrome, no chromedriver — it speaks WhatsApp's own protocol, so it can
send **plain messages and native polls**, to **groups or individual people**, on
any repeat you like: hourly, daily, weekly, monthly, yearly, or raw cron.

> The original Windows/Selenium bot (`poll_sender.py` in the repo root) still
> works on a desktop. This folder is the phone-runnable replacement.

## Setup (once, ~5 minutes)

Install Termux **from F-Droid** (the Play Store build is outdated), open it, then:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git
git clone https://github.com/dann-nel/whatsapp-poll-bot.git
cd whatsapp-poll-bot/mobile
npm install
termux-wake-lock        # stops Android killing the bot in the background
```

## Link your WhatsApp account (once)

```bash
./poll groups
```

**Option A — QR code.** A QR code prints in Termux. On another device open
WhatsApp → Settings → Linked devices → Link a device, and scan it.

**Option B — pairing code (easier with one phone).** Put your number in
`pairing_phone_number` in `config.json` (country code, digits only, no `+`), run
the bot, and it prints an 8-character code. In WhatsApp: Linked devices → Link
with phone number → enter the code.

The session is saved in `auth_state/` and reused forever after.

## Daily use

```bash
./poll                     # run every enabled job on its schedule — leave this running
./poll now                 # send every enabled job once, right now
./poll now "Lift poll"     # send just one job, right now (works even if disabled)
./poll jobs                # list jobs, their targets and when they fire
./poll groups              # list your exact group names
./poll send "Running late" "Mom"          # one-off message, no config edit
./poll send "Running late" "27821234567"  # one-off to a number
```

## Configuring jobs

`config.json` holds a `jobs` array. Each job is one scheduled message:

```json
{
  "name": "Good morning",
  "enabled": true,
  "to": { "number": "27821234567" },
  "message": { "type": "text", "text": "Good morning! Happy {day}, {date}." },
  "schedule": { "every": "daily", "time": "07:30" }
}
```

**Who it goes to** — exactly one of:

| | |
| --- | --- |
| `"to": { "group": "My Group" }` | A group. Run `./poll groups` for exact names. |
| `"to": { "number": "27821234567" }` | A person. Full international number, digits only, no `+`. |

**What it sends** — `message.type` is `text` or `poll`:

```json
"message": { "type": "text", "text": "Anything you like." }

"message": {
  "type": "poll",
  "question": "Pizza Friday?",
  "options": ["Yes", "No", "Maybe"],
  "allow_multiple_answers": false
}
```

Polls take 2–12 options. In any text or poll question you can use `{date}`,
`{time}`, `{day}`, `{month}` and `{year}` — they're filled in when the message
is actually sent, in your configured timezone.

**When it fires** — `schedule.every` is one of:

| `every` | Extra fields | Example |
| --- | --- | --- |
| `hourly` | `minute` (0–59) | `{ "every": "hourly", "minute": 0 }` |
| `daily` | `time` | `{ "every": "daily", "time": "07:30" }` |
| `weekly` | `day`, `time` | `{ "every": "weekly", "day": "monday", "time": "09:00" }` |
| `monthly` | `day_of_month` (1–31), `time` | `{ "every": "monthly", "day_of_month": 1, "time": "08:00" }` |
| `yearly` | `month`, `day_of_month`, `time` | `{ "every": "yearly", "month": "june", "day_of_month": 14, "time": "08:00" }` |
| `cron` | `expression` | `{ "every": "cron", "expression": "45 8 * * 1-5" }` |

Times are 24-hour and interpreted in the top-level `"timezone"`. Set
`"enabled": false` to park a job without deleting it. The shipped `config.json`
has one working example of every type — flip `enabled` and edit to taste.

A bad schedule or a malformed job is rejected **before** the bot logs in, naming
the job and the problem, so typos never silently skip a send.

## Troubleshooting

- **"Group not found"** — the error lists every group you're in; copy the name exactly.
- **"… is not a WhatsApp account"** — use the full international number with no
  `+` or spaces (`27821234567`, not `082 123 4567`).
- **Nothing sends while the screen is off** — run `termux-wake-lock`, and exempt
  Termux from battery optimisation in Android settings.
- **"Logged out on the phone"** — you unlinked the device. Run `./poll groups` and re-link.
- **Bot stops when you close Termux** — Termux must stay in the notification tray.

Activity is appended to `bot.log`.

## Note

This uses an unofficial WhatsApp client library. Don't use it to spam — sending
frequent automated messages, especially to people who didn't ask for them, is a
good way to get a number banned. Scheduled messages to your own group and to
people expecting them is what it's built for.
