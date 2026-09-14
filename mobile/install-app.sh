#!/data/data/com.termux/files/usr/bin/bash
#
# Turns this bot into tappable home-screen icons.
#
# Termux:Widget reads executable scripts from ~/.shortcuts and offers each one
# as a launcher icon or widget. Termux:Boot runs ~/.termux/boot/* at startup,
# so the scheduler comes back by itself after a reboot.
#
# Run once:  bash install-app.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SHORTCUT_DIR="$HOME/.shortcuts"
BOOT_DIR="$HOME/.termux/boot"

echo "Installing home-screen shortcuts..."
mkdir -p "$SHORTCUT_DIR"
cp "$REPO_DIR"/shortcuts/* "$SHORTCUT_DIR"/
chmod +x "$SHORTCUT_DIR"/*
# Widget refuses to run scripts the group or others can write to.
chmod 700 "$SHORTCUT_DIR"

echo "Installing boot auto-start..."
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/start-poll-bot.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
# Runs at device startup, via the Termux:Boot app.
termux-wake-lock
cd ~/Whatsapp-Poll-bot/mobile || exit 1
nohup node bot.js >> bot.log 2>&1 &
echo $! > "$HOME/.wapoll.pid"
BOOT
chmod +x "$BOOT_DIR/start-poll-bot.sh"

echo
echo "Done. Installed:"
ls -1 "$SHORTCUT_DIR"
echo
echo "Next steps on your phone:"
echo "  1. Install 'Termux:Widget' from F-Droid (same place you got Termux)."
echo "  2. Long-press your home screen > Widgets > Termux > drag it on."
echo "     Or: the Termux:Widget app icon itself lists the shortcuts."
echo "  3. For a single icon per action, add a 'Termux shortcut' 1x1 widget"
echo "     and pick the script you want."
echo
echo "  For auto-start after a reboot, also install 'Termux:Boot' from F-Droid"
echo "  and open it once so Android grants it permission."
