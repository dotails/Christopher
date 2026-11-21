# Memario

A corrupted side-scroller for Android. Every 16-pixel cell of the world holds a fixed digit.
Stand on the digits a register needs, write them into memory, and unlock abilities, while each
unlock makes the game glitchier and less stable. Reach the EXIT at the end of the level.

## Layout

Like a dual-screen handheld emulator: the game on the top screen, the register bank on the bottom
screen, and the controller below. Nothing scrolls. Held sideways, the two screens sit side by side
between the halves of the controller.

## Controls (on-screen handheld controller)

| Control | Action |
| --- | --- |
| D-pad ◀ ▶ / left stick | Move |
| A | Jump |
| ◀ / ▶ / A on a register's next digit | Writes that digit into the register (and still moves or jumps) |
| B (or D-pad down) | Force-write: slows time; then ◀, ▶ or A writes whatever digit you stand on |
| X | Flip gravity (after GRAVITY FLIP is unlocked) |
| Y | Grid overlay on/off |
| Right stick | Look ahead |
| SELECT / START | Sound on/off / menu (pause, sound, grid, reboot) |
| Phone back button | Pause menu (quits only from the title screen) |

The badge over the hero turns green when the digit you stand on is some register's next digit.
Tapping a register on the bottom screen also force-writes the current digit into it.

## Registers

| Register | Sequence | Written with | Ability |
| --- | --- | --- | --- |
| FIRE POWER | 4 2 7 1 9 | A | Auto-fires plasma |
| SUPER JUMP | 3 8 5 2 | ◀ | Jump height ×2 |
| SPEED BOOST | 6 1 4 8 3 | ▶ | Run speed ×1.75 |
| PHASE SHIFT | 9 9 0 1 | A | Walk through conduits and the firewall |
| GRAVITY FLIP | 7 3 1 5 0 | ◀ | X inverts gravity |

A register filled with any wrong digit segfaults and is flushed. Every write has a 10% chance of
a random glitch (palette rotation, screen tearing, enemy resizing, VRAM artifacts), and below
roughly 55% stability left and right occasionally swap.

## Building

The game is one page, `android/app/src/main/assets/www/index.html`, hosted full screen in a
WebView by `MainActivity`. Fonts are bundled, so it runs offline.

```
cd memario/android
./gradlew assembleRelease      # -> app/build/outputs/apk/release/app-release.apk
```

GitHub Actions (`.github/workflows/memario-android.yml`) builds the same APK on every push that
touches `memario/` and attaches it to the run. Builds are signed with the committed sideload key,
so any build installs over another without uninstalling first.
