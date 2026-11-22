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

Held upright: the game screen runs edge to edge on top, the register screen fills the space between it
and the controller, and nothing scrolls. Held sideways (and on desktop), Switch-style: one big game
screen with a slim 3×3 register strip under it and the controller halves either side.

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

## Levels

Four levels, each about hacking deeper into the machine. Every level brings its own registers, and
its obstacles are impossible without that level's hacks. Each level adds new curses and harsher
conditions. Progress is saved; the title screen offers to continue from the furthest level reached.

| Level | Theme | Impossible without | Hacks (sequence, control, opens when) | Curses |
| --- | --- | --- | --- | --- |
| 1 Boot Sector | sky blue | ROM wall (Super Jump); 10-block pit (Super Jump + Speed) | Fire Power 4 2 7 1 9 A · Super Jump 3 8 5 2 ◀ · Speed Boost 6 1 4 8 3 ▶ (16 bytes) | Heavy Boots 2 7 2 7 A · Mirror Input 1 6 6 1 ▶ |
| 2 Firewall | sunset | floor-to-ceiling firewalls (Phase); 6-block pits (Double Jump) | Phase Shift 9 9 0 1 A (mid-air) · Double Jump 2 6 0 4 ▶ (10 bytes) · Hot Reload 3 1 4 1 ◀ | Memory Leak 0 0 7 3 ◀ · Packet Lag 6 6 2 2 ▶ · Blackout 3 3 9 9 A (below 60%) |
| 3 Kernel Space | night purple | caged bug by a tall wall (Freeze, climb off its back); spike floor under open sky (Bridge); spike floor under the bus (Gravity Flip) | Freeze Bugs 4 4 1 2 A · Alloc Bridge 6 2 8 0 ▶ (12 bytes) · Gravity Flip 7 3 1 5 0 ◀ (1 online) | Bug Swarm 1 9 1 9 ▶ · Null Pointer 3 0 3 0 A · Mirror Input 5 5 2 5 ◀ |
| 4 Root Access | matrix green | firewall (Phase); spikes under the bus (Flip); wall under open sky (Super Jump); firewalls through a spike floor (Flip + Phase together) | Phase Shift 0 4 0 4 A (mid-air) · Gravity Flip 5 1 3 9 ▶ (1 online) · Super Jump 7 7 2 1 ◀ (below 70% stability) | Watchdog 2 2 8 ◀ · Packet Lag 1 1 6 6 ▶ · Heavy Boots 8 3 8 3 A · Blackout 9 2 9 2 A (below 60%) · Null Pointer 4 9 4 9 ▶ (after a crash) |

What the new hacks and curses do:

- **Double Jump**: a second jump in mid-air. **Hot Reload**: a crash respawns you where you last stood instead of at the save.
- **Freeze Bugs**: bugs stop, stop hurting you, and become platforms. **Alloc Bridge**: dashed null blocks become solid.
- **Packet Lag**: every input reaches the hero 10 frames late. **Bug Swarm**: bugs run faster and respawn.
- **Null Pointer**: one in three platform blocks drops out of memory for a second every four seconds (they flicker first).
- **Watchdog**: a countdown on screen; when it reaches zero you crash, every 40 seconds, until a patch purges it.
- Root Access's Super Jump only opens once stability drops below 70%: unlock the other two hacks (or take some damage) first.

Green registers always take a write before red ones on the same control. The badge over the hero
shows where a press would go: **green** feeds a hack, **red** feeds a curse, **gold** depends on the
button. Patches from 0x blocks reduce corruption, flush partly filled curses and purge the most
recent active curse. A register filled with any wrong digit (only possible with a force-write)
segfaults and is flushed. Every write has a 10% chance of a random glitch, and below roughly 55%
stability left and right occasionally swap.

## Music

Each level has its own original chiptune loop, synthesised live (square lead, triangle bass, noise
drums). As stability drops, the lead detunes and drops notes. Sound and music toggle separately in
the START menu.

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
