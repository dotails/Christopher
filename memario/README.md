# Memario

A corrupted side-scroller for Android. Every 16-pixel cell of the world holds a fixed digit.
Stand on the digits a register needs, write them into memory, and unlock abilities, while each
unlock makes the game glitchier and less stable. Reach the EXIT at the end of the level.

## The hero

The hero is the player's own character (cap, black hoodie with pink strings, backpack), cut from
their sprite sheet into 34×34 frames in `android/app/src/main/assets/www/img/hero.png`:
idle, walk, jump/fall, a pointing action played whenever a digit is written, and hurt/KO played
before respawning. `img/faces.png` holds four portraits (normal, grin, shocked, bruised) that react
on the bottom screen.

## The memory row

Every 16-pixel column of a level holds one digit. They run along the bottom of the map as a row of
memory: a column decrypts (its digit scrambles, then settles) the first time you pass over it, and
stays revealed. Your column is boxed, with a caret, and a faint beam rises from it to the hero. Its
colour says where a press would send the digit: **green** feeds a hack, **red** feeds a curse, **gold**
depends on the button, **white** feeds nothing. When you write a digit it flies up out of the row
into the hero, who points at it, and the line types itself into the log on the register screen.

## Digits carried by bugs and boxes

Each level removes one or two digits from the memory row entirely, and only bugs and 0x boxes carry
them. They are the digits that level's key hacks need:

| Level | Missing from memory | Needed by |
| --- | --- | --- |
| 1 Boot Sector | 8 | Super Jump, Speed Boost |
| 2 Firewall | 0 | Phase Shift, Double Jump |
| 3 Kernel Space | 4 | Freeze Bugs (twice; the caged bug carries one) |
| 4 Root Access | 0 and 7 | Phase Shift, Super Jump |

Every bug and every 0x box carries a digit (every other one carries a missing digit) on a small
black tag like the one on the hero's sheet. A tag shows `?` until you come near; then it decrypts and
stays revealed, and a bug's tag rides along on the bug as it moves. Bumping a box also reveals it.

Within reach (right next to a bug, or under or on a box) the carrier replaces the column's digit:
a dotted link runs from its tag to the hero, the memory row's slot shows the digit with a cyan
pointer mark, the register screen says READING BUG or READING 0X BOX, and a write flies from the tag
into the hero. Reading a bug means getting close to it; Freeze makes that safe (stand on it).
A killed bug leaves its digit behind as a flickering orphaned pointer, so a missing digit can't be
lost.

## Creatures, the raptor and the level toolbox

Everything is an original design in the hero's own style (dark hood, hot-pink strings and shoes,
warm skin, heavy outline) with hacking names. Every creature carries a digit on its tag.

| Creature | Behaviour |
| --- | --- |
| PROCESS | walks, turns at edges; stomp it |
| SHELL | stomped, it retreats into a shell that keeps its digit. Touch the shell to kick it; hold Y (or press Y beside it) to pick it up and carry its digit anywhere (even mid-air for Phase Shift); Y throws it, down drops it. A kicked shell mows down creatures, breaks RAM blocks into pixels and bumps 0x boxes. An abandoned shell climbs back out after a while |
| DRONE | a winged shell that hops; a stomp clips its wings |
| SPIKE | can't be stomped (except from the raptor); shells, fire and bombs work |
| SPAMMER | paces and lobs arcing packets at you |
| FORK BOMB | stomped, it lights; kick it, carry it, throw it. It blows breakable blocks apart into their own pixels, kills nearby creatures and hurts you if you're close |
| ZOMBIE PROCESS | creeps toward you while you look away, freezes and hides its face when you look at it, passes through walls |
| DAEMON | chained to a stake; lunges when you come close |
| SOCKET | rises out of conduits; stays down while you stand on its conduit |
| STACK SMASH | waits overhead and slams down on whoever is underneath; you can ride its top |
| PING CANNON | fires pings toward you; stomp a ping to bounce |
| SPINLOCK | a rotating bar of fire around a hub |

**The raptor** (Boot Sector, Kernel Space, Root Access) wears a cap like the hero's. Land on it to
ride. Hold A in the air to flutter (a hover, not extra height). Y shoots its tongue: it swallows a
process, shell, spammer or fork bomb and keeps the creature's digit in its mouth, readable like a held
shell; Y again spits it out (shells come out spinning). Get hit while riding and the raptor bolts
instead of you crashing; catch it again. Down hops off.

**Level toolbox:** springs and bounce buffers, one-way scaffolds, page lifts (moving platforms),
volatile platforms that drop after you stand on them, pipelines (conveyors), cold storage (ice),
hidden sectors (invisible blocks that appear when bumped, each holding a missing digit), and a bit-flip
switch that toggles pink BIT-1 and cyan BIT-0 blocks. None of it is placed where it could bypass a
level's required hacks; every gate was re-checked against springs, platforms and the raptor.

## Look

The levels are dark and lit, in the spirit of Animal Well and Noita: a grainy dark gradient, two
parallax layers of hanging formations, pillars and server racks with tiny glowing LEDs, drifting
motes, glowing moss on the ground, and a light map in which the hero, fire, firewalls, spikes, 0x
boxes, the exit, saves, bombs and explosions cast coloured light. Blackout deepens the dark.

## A world made of pixels

The world is simulated pixel by pixel, Noita-style. Bugs burst into their own pixels when killed and
the debris tumbles and piles up; blocks shed dust when hit; overhangs and pit edges crumble with bit
rot; firewalls throw sparks; corrupt sectors and the Memory Leak curse leak memory that flows and
pools; Null Pointer blocks crumble as they drop out of memory; frozen bugs shed frost. The hero kicks
debris aside, bugs plough through it, fireballs scatter it, and a patch burns it off.

The corruption is drawn as real memory faults rather than screen filters: tiles that read garbage
from the wrong place in graphics memory (often misaligned across two tiles), per-tile and per-kind
palette RAM errors (the sky, the ground, blocks, the bus or the bugs get the wrong colours),
scroll-register desync that shifts whole bands of the screen, and sprite DMA faults that draw the
hero again in the wrong places. Every unlock writes permanent faults into the level; instability
adds temporary ones.

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
| B | Force-write: slows time; then ◀, ▶ or A writes whatever digit you stand on |
| X | Flip gravity (when the level's Gravity Flip is online) |
| Y | Grab a shell or lit fork bomb (hold Y while touching it, or press Y beside it); press again to throw. On the raptor: tongue / spit |
| D-pad down | Drop what you hold, or hop off the raptor |
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

The soundtrack is the player's own song (`www/audio/theme.ogg`, 39 s, F major, ~155 BPM). It plays
from the top, then loops 23 bars on the beat (0.838 s to 36.463 s). It is hacked live along with the
game, through a Web Audio effect chain:

| Register | What it does to the song |
| --- | --- |
| Speed Boost | plays 15% faster |
| Super Jump | treble lifts |
| Fire Power | distortion |
| Phase Shift | ghostly echo |
| Double Jump | chorus doubling |
| Hot Reload | a crash rewinds the tape to the top |
| Freeze Bugs | thin, icy, with a short echo |
| Alloc Bridge | bass boost |
| Gravity Flip | while upside down, the EQ flips (bass cut, treble up) |
| ! Heavy Boots | slows and sinks |
| ! Mirror Input | plays backwards, left and right channels swapped |
| ! Packet Lag | a late slap-back echo |
| ! Memory Leak | the pitch slowly drifts down (a patch restores it) |
| ! Blackout | muffled |
| ! Bug Swarm | frantic hi-hats on top |
| ! Null Pointer | drops out whenever the blocks blink out |
| ! Watchdog | a clock ticks over it, faster in the last 10 seconds |

Each level gives the song a harsher base treatment (Firewall is driven, Kernel Space dark, slow and
echoing, Root Access fast and distorted). Written digits play as notes in F major on the song's beat
(a wrong write clashes); a segfault skips the track; glitches stutter it, tape-stop it, bitcrush it
or bend its pitch; and instability adds micro-stutters. If the song can't be decoded, synthesised
chiptune tracks play instead. Sound and music toggle separately in the START menu.

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
