# Memario

A corrupted side-scroller for Android. Every 16-pixel cell of the world holds a fixed digit.
Stand on the digits a register needs, write them into memory, and unlock abilities, while each
unlock makes the game glitchier and less stable. Reach the EXIT at the end of the level.

## Controls (on-screen handheld controller)

| Control | Action |
| --- | --- |
| D-pad ◀ ▶ / left stick | Move |
| A | Jump |
| B (or D-pad down) | Breakpoint: slows time; then press ◀, ▶ or A to write the digit you stand on |
| X | Flip gravity (after GRAVITY FLIP is unlocked) |
| Y | Grid overlay on/off |
| Right stick | Look ahead |
| SELECT / START | Sound on/off / pause |
| Phone back button | Pause menu (quits only from the title screen) |

Tapping a register row also writes the current digit into it.

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
