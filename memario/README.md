# Memario

A corrupted side-scroller for Android. Every 16-pixel cell of the world holds a fixed digit.
Stand on the digits a register needs, write them into memory, and unlock abilities, while each
unlock makes the game glitchier and less stable. Reach the EXIT at the end of the level.

## The hero

The hero is the player's own character (cap, black hoodie with pink strings, backpack), cut from
their sprite sheet into 34×34 frames in `android/app/src/main/assets/www/img/hero.png`:
idle, walk, jump/fall, a pointing action played whenever a digit is written, and hurt/KO played
before respawning. `img/faces.png` holds four portraits (normal, grin, shocked, bruised) that react
on the bottom screen. The number tag over the hero's head shows the digit underfoot.

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

Green registers grant abilities. Red registers are curses: the very same button presses fill them,
so the goal is to collect the good ones without the bad ones. When a press could feed both a good
and a bad register on the same control, the good one always takes it. Some registers only accept
digits under a condition.

The badge over the hero shows where a press would send the digit you stand on: **green** feeds an
ability, **red** feeds a curse, **gold** means it depends on which button you press.

| Register | Sequence | Control | Opens when | Effect |
| --- | --- | --- | --- | --- |
| FIRE POWER | 4 2 7 1 9 | A | always | Auto-fires plasma |
| SUPER JUMP | 3 8 5 2 | ◀ | always | Jump height ×2 |
| SPEED BOOST | 6 1 4 8 3 | ▶ | 16 bytes collected | Run speed ×1.75 |
| PHASE SHIFT | 9 9 0 1 | A | you are mid-air | Walk through conduits and the firewall |
| GRAVITY FLIP | 7 3 1 5 0 | ◀ | 2 abilities online | X inverts gravity |
| ! HEAVY BOOTS | 2 7 2 7 | A | always | Curse: jump height cut |
| ! MIRROR INPUT | 1 6 6 1 | ▶ | always | Curse: left and right swapped |
| ! MEMORY LEAK | 0 0 7 3 | ◀ | after your first crash | Curse: stability drains over time |
| ! BLACKOUT | 3 3 9 9 | A | stability below 60% | Curse: the screen goes dark around you |

Patches from 0x blocks reduce corruption, flush partly filled curses, and purge the most recent
active curse. A register filled with any wrong digit (only possible with a force-write) segfaults
and is flushed. Every write has a 10% chance of a random glitch (palette rotation, screen tearing,
enemy resizing, VRAM artifacts), and below roughly 55% stability left and right occasionally swap.

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
