# WhatsApp Poll Bot — phone edition

Runs entirely on your Android phone in [Termux](https://f-droid.org/packages/com.termux/).
No PC, no Chrome, no chromedriver — it speaks WhatsApp's own protocol, so it can
send **real native polls**.

> The original Windows/Selenium bot (`poll_sender.py` in the repo root) still works
> on a desktop. This folder is the phone-runnable replacement.

## Setup (once, ~5 minutes)

Install Termux **from F-Droid** (the Play Store build is outdated), open it, then:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git
git clone https://github.com/dann-nel/whatsapp-poll-bot.git
cd whatsapp-poll-bot/mobile
npm install
```

Keep Termux alive in the background so Android doesn't kill the bot:

```bash
termux-wake-lock
```

## Configure

Edit `config.json` (`nano config.json`):

| Key | Meaning |
| --- | --- |
| `group_name` | Exact WhatsApp group name. Run `./poll groups` to see the list. |
| `poll_question` | The poll question. |
| `poll_options` | 2–12 answer options. |
| `allow_multiple_answers` | `true` lets people pick more than one option. |
| `schedule_day` | Weekday name (`monday`) or `daily`. |
| `schedule_time` | 24-hour time, e.g. `09:00`. |
| `timezone` | e.g. `Africa/Johannesburg`. |
| `pairing_phone_number` | Optional, e.g. `27821234567` — see below. |

## Link your WhatsApp account (once)

```bash
./poll now
```

**Option A — QR code.** A QR code prints in Termux. On another device open
WhatsApp → Settings → Linked devices → Link a device, and scan it.

**Option B — pairing code (easier with one phone).** Put your number in
`pairing_phone_number` (country code, digits only, no `+`), run the bot, and it
prints an 8-character code. In WhatsApp: Linked devices → Link with phone number →
enter the code.

The session is saved in `auth_state/` and reused forever after, so you only do
this once.

## Daily use

```bash
./poll          # stay running and post the poll on schedule
./poll now      # post the poll immediately
./poll groups   # list group names
```

Leave the `./poll` session running (with `termux-wake-lock` on) and it posts the
poll every week by itself. Activity is appended to `poll_bot.log`.

## Troubleshooting

- **"Group not found"** — the error lists every group you're in; copy the name exactly.
- **Nothing sends while the screen is off** — run `termux-wake-lock`, and exempt
  Termux from battery optimisation in Android settings.
- **"Logged out on the phone"** — you unlinked the device in WhatsApp. Just run
  `./poll now` again and re-link.
- **Bot stops when you close Termux** — Termux must stay in the notification tray.

## Note

This uses an unofficial WhatsApp client library. Don't use it to spam — sending
frequent automated messages can get a number banned. One scheduled poll to your
own group is what it's built for.
