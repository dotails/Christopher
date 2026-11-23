# Memario design notes: playtest study (5.2.0)

How this was studied: a bot plays the game (the same bot that runs the title-screen demo), and scripted
runs measured routes, write rules and failure cases on every level. Gate integrity was re-checked by an
automated sweep of about 2,900 jump, wall-jump and zig-zag attempts per release.

## What was wrong

| Problem the player hit | Cause | Fix |
| --- | --- | --- |
| Going back to a digit and pressing its key "undid" progress | Two paths wrote whatever digit you stood on, right or wrong: B (force-write) and tapping a register on the middle screen, which sits right above the thumbs in portrait. A register holding a wrong digit segfaulted and was wiped when it filled | Writes now happen only when the digit is the register's next one. B and taps never write. Progress only moves forward |
| Standing on the right number and pressing the key did nothing | A 0x box or virus anywhere in your column replaced the ground digit you were reading (5.0 rule); a closed register gave no feedback | Key presses read only the layer you are in. A press that writes nothing says why: "3 FITS JUMP: PRESS ◀" or "SPEED IS CLOSED: NEEDS 16 BYTES" |
| Turning a hack off was impossible, curses could only be patched | No toggle | Re-entering an online register's full string switches it off; re-entering a curse's string lifts it |
| The register screen was hard to read mid-jump | 9 rows of 1x text in a short panel | Two columns of cards: the control as it looks on the pad, the next digit 3x size, the name 2x size, plus a prompt line ("◀ JUMP", "A !HEAVY") and a screen border that flashes green/red/gold |
| Deaths felt unfair at the edges of sprites | Enemy and hazard boxes matched the sprite | Hurt boxes inset 3 to 4 px (hero inset 2 px); stomps still use the full box |

## Route lengths: how far you walk to complete each register

Greedy route from the level start, in columns, walking to the nearest place holding each next digit.
"All layers" adds air digits, platform digits and creature/box digits to the ground row.

| Level | Register | Ground + carriers | All layers |
| --- | --- | --- | --- |
| 1 | Fire Power | 26 | 15 |
| 1 | Super Jump | 37 | 22 |
| 2 | Phase Shift | 23 | 13 |
| 2 | Double Jump | 29 | 15 |
| 2 | Hot Reload | 25 | 5 |
| 3 | Alloc Bridge | 24 | 9 |
| 3 | Gravity Flip | 24 | 14 |
| 4 | Super Jump | 35 | 16 |
| 4 | Phase Shift | 22 | 22 |

Layers roughly halve the walking for most hacks, so the game is more about where you stand (ground,
platform, mid-jump) and less about backtracking. The same is true of curses (Root Access's Packet Lag
drops from 8 columns to 3), so a careless jump-and-press is now a real risk. That is intended: lit
digits on the row, platforms and air lane show which digits a register wants next, green for hacks and
red for curses.

## What the demo teaches, in order

1. Walking decrypts the ground row.
2. A ground write (stand on 3, press ◀).
3. A missing digit comes from a virus (stomp it; its 8 goes in).
4. An air write (jump, press ◀ at the top over an air 5).
5. Completing a hack, and that re-entering the string switches it off.
6. Bad: pressing A on a 2 feeds a curse. Bad: side contact crashes you.
7. The payoff: Super Jump over the ROM wall.

## Ideas toward AAA feel, not yet built

- **Readable intent at speed:** draw a faint ghost of the next needed digit over the nearest place that
  holds it (ground, air or platform), like a racing line, toggled in the menu.
- **Risk/reward combos:** the combo already pays bytes for quick consecutive hack writes; extend it to a
  multiplier that also slows corruption, and let a curse write break it with a sting in the music.
- **Hack synergies:** pairs that do more together (Speed + Super = long jump arc trail; Phase + Gravity =
  ceiling dash), shown as a linked badge.
- **Boss phases:** KERNEL PANIC switching to a second phase that corrupts the bridge's digits, so the
  kill-switch run is also a write puzzle.
- **Per-level challenge goals:** "no curses", "under 2:00", "all bits", with medals on the level select.
- **Ghost replays:** record the player's inputs (the demo bot already plays through the same input path)
  and race your best run.
- **Accessibility:** a high-contrast row, colour-blind safe verdict colours (shape marks in addition to
  green/red), adjustable game speed, and remappable controls.
- **Haptics as information:** a distinct short buzz when you stand on a digit some register wants.
- **Audio as information:** each register gets an instrument; its next digit hums when it's on screen.
- **Deep hacks (planned 6.0):** multi-level sequences, cancels, the castle warp and the built-in
  minigames.
