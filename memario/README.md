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

## Digits carried by viruses and boxes

Each level removes one or two digits from the memory row entirely, and only viruses and 0x boxes
carry them. They are the digits that level's key hacks need:

| Level | Missing from memory | Needed by |
| --- | --- | --- |
| 1 Boot Sector | 8 | Super Jump, Speed Boost |
| 2 Firewall | 0 | Phase Shift, Double Jump |
| 3 Cloud Storage | 4 | Quarantine (twice; the caged virus carries one) |
| 4 Root Access | 0 and 7 | Phase Shift, Super Jump |

Every virus and every 0x box carries a digit (every other one carries a missing digit). Nothing
floats over them: a carrier writes its digit **into the memory row at the column it occupies**,
over that column's own digit, with a coloured underline (pink for a virus, gold for a box, red and
flickering for an orphan, cyan for something you hold). A virus's digit slides along the row as it
walks, and the column's own digit comes back when it leaves. A carrier shows `?` on the row until
you come within three columns; then it decrypts and stays revealed.

To read a carrier, stand in its column: the row there, the badge and the register screen
(READING CRAWLER, READING 0X BOX…) all show its digit, and a write flies up out of the row while
the carrier sparks. A held shell or the raptor's mouthful sits at your own column. A killed virus
leaves its digit behind as an orphaned pointer in that column, so a missing digit can't be lost.

## Symbols

Each level hides one gold symbol in the memory row (`*`, `#`, `@`, `$`). A symbol belongs to a
single column and only reads **from up high**: walk under it and the row shows it with a small up
caret; stand on the high spot above it and it becomes your value. Symbols feed each level's
rarest hack:

| Level | Symbol and where | Hack | Sequence | Does |
| --- | --- | --- | --- | --- |
| 1 | `*` on the high block row (column 89) | Shield | 5 * 5 ▶ | soaks one crash (not a fall); rewrite it at the `*` to recharge |
| 2 | `#` on the block row under the spinlock (column 145) | Bit Magnet | # 5 5 ◀ | bits fly to you |
| 3 | `@` on top of the cage wall (column 54) | Glide | 2 @ 6 A | hold A while falling to glide |
| 4 | `$` on top of the Super Jump wall (column 101) | Overclock | $ 9 1 ▶ | the world runs at half speed |

None of them can open a gate: every gate was re-checked with them online.

## Viruses, the raptor and the level toolbox

Every creature is a virus that fills a classic platformer role, drawn in the hero's own style
(heavy black outline, navy capsid like the hood, hot-pink spike proteins like the strings and
shoes, a warm visor for a face). Every virus carries a digit.

| Virus | Role | Behaviour |
| --- | --- | --- |
| CRAWLER | the walker | a round capsid ringed with spike proteins; walks, turns at edges; stomp it |
| TROJAN | the shell | stomped, it retreats into its hex capsid, which keeps its digit. Touch the shell to kick it; hold Y (or press Y beside it) to pick it up and carry its digit anywhere (even mid-air for Phase Shift); Y throws it, down drops it. A kicked shell mows down viruses, breaks RAM blocks into pixels and bumps 0x boxes. An abandoned shell climbs back out after a while |
| BOTNET | the winged shell | a winged trojan that hops; a stomp clips its wings |
| SPIKE PROTEIN | the spiny | can't be stomped (except from the raptor); shells, fire and bombs work |
| SPAM WORM | the thrower | paces and lobs arcing packets at you |
| FORK BOMB | the walking bomb | stomped, it lights; kick it, carry it, throw it. It blows breakable blocks apart into their own pixels, kills nearby viruses and hurts you if you're close |
| ROOTKIT | the shy ghost | a hollow capsid that creeps toward you while you look away, freezes and hides its face when you look, passes through walls |
| RANSOMWARE | the chained biter | a padlock with teeth, chained to a stake; lunges when you come close |
| PHAGE | the pipe plant | a bacteriophage that rises out of conduits; stays down while you stand on its conduit |
| KERNEL PANIC | the castle boss | a crowned virus pacing the lava bridge in Root Access, hopping and lobbing packets. Get past it and pull the kill switch: the bridge deallocates under it |
| STACK SMASH | the crusher | waits overhead and slams down on whoever is underneath; you can ride its top |
| PING CANNON | the cannon | fires pings toward you; stomp a ping to bounce |
| SPINLOCK | the fire bar | a rotating bar of fire around a hub |

**The raptor** (Boot Sector, Cloud Storage, Root Access) wears a cap like the hero's. Land on it to
ride. Hold A in the air to flutter (a hover, not extra height). Y shoots its tongue: it swallows a
crawler, trojan, spam worm or fork bomb and keeps the creature's digit in its mouth, readable like a held
shell; Y again spits it out (shells come out spinning). Get hit while riding and the raptor bolts
instead of you crashing; catch it again. Down hops off.

**Level toolbox:** springs and bounce buffers, one-way scaffolds, page lifts (moving platforms),
volatile platforms that drop after you stand on them, pipelines (conveyors), cold storage (ice),
hidden sectors (invisible blocks that appear when bumped, each holding a missing digit), and a bit-flip
switch that toggles pink BIT-1 and cyan BIT-0 blocks. None of it is placed where it could bypass a
level's required hacks; every gate was re-checked against springs, platforms and the raptor.

## Movement

The platforming follows modern conventions and is tuned to feel snappy:

- **Coyote time** (7 frames to jump after running off a ledge) and a **jump buffer** (a press up to 8 frames before landing still jumps).
- **Variable height**: let go of A early for a short hop (rising speed is cut in half). A short **hang at the apex** while A is held.
- **Wall slide and wall jump**: press into a wall in mid-air to slide down it slowly; A kicks off it. Ground, blocks and conduits hold you; ROM, firewalls, the bus, NULL blocks, ice and bit blocks are too smooth, and nothing holds you once you've dropped below the ground line, so pits stay pits.
- **Corner correction**: clip the corner of a block on the way up and you're nudged past it instead of stopped dead (hidden sectors excepted).
- **Fast fall**: hold down in the air.
- Quick acceleration, quicker turnarounds with skid dust, squash on landing, stretch on take-off, dust puffs.

Every gate was re-checked by an automated sweep of about 2,900 attempts (jumps from every quarter
column, four hold lengths, wall-jump spam and zig-zags) with no breach.

## Look: four worlds

Each level takes the design language of a classic world type, rebuilt in the game's own style and
lit in the spirit of Animal Well and Noita:

| Level | World | Look |
| --- | --- | --- |
| 1 Boot Sector | Overworld | open green country at dusk: far ranges, soft clouds, rolling hills with bushes, relay masts with blinking lights, grass on brown earth, lightly lit |
| 2 Firewall | Underground | a brick ceiling and brick floor, hanging formations, server racks with tiny LEDs, deep dark |
| 3 Cloud Storage | Sky | the floor drops into the void; cloud banks below, floating islands adrift, cloud scaffolds, ground topped with cloud |
| 4 Root Access | Castle | grey stone bricks, lava instead of corrupt sectors, towers and battlements, pillars and hanging chains, a boss on a bridge over the lava |

Light still comes from the hero, fire, firewalls, lava, 0x boxes, the exit, saves, bombs and
explosions. Blackout deepens the dark.

## A world made of pixels

The world is simulated pixel by pixel, Noita-style. Viruses burst into their own pixels when killed and
the debris tumbles and piles up; blocks shed dust when hit; overhangs and pit edges crumble with bit
rot; firewalls throw sparks; corrupt sectors and the Memory Leak curse leak memory that flows and
pools; Null Pointer blocks crumble as they drop out of memory; frozen viruses shed frost. The hero kicks
debris aside, viruses plough through it, fireballs scatter it, and a patch burns it off.

The corruption is drawn as real memory faults rather than screen filters: tiles that read garbage
from the wrong place in graphics memory (often misaligned across two tiles), per-tile and per-kind
palette RAM errors (the sky, the ground, blocks, the bus or the viruses get the wrong colours),
scroll-register desync that shifts whole bands of the screen, and sprite DMA faults that draw the
hero again in the wrong places. Every unlock writes permanent faults into the level; instability
adds temporary ones.

Faults are physical, not just pictures:

- **Garbage blocks.** Garbage written into empty memory is a real block. You can stand on it, bump it,
  and use it to reach places, and viruses and debris collide with it. It never appears on top of the
  hero, a virus, a save or the exit.
- **Unmapped blocks.** A RAM block, 0x box, conduit, ice or note block whose bytes go missing turns
  see-through (cyan scanlines) for about three seconds, and you can pass straight through it or fall
  through it. It flickers before it maps back in, and never snaps back while you're inside it.
  Ground, ROM, firewalls, the bus and the brick ceiling never unmap.
- **Gates stay honest.** Around every gate, faults stay cosmetic, so a glitch can never stand in for a
  required hack. A fuzz test re-ran the whole gate sweep with 700 permanent faults per attempt: no breach.

## Layout

Held upright: the game screen runs edge to edge on top, the register screen fills the space between it
and the controller, and nothing scrolls. Held sideways (and on desktop), Switch-style: one big game
screen with a slim 3×3 register strip under it and the controller halves either side.

## Controls (on-screen handheld controller)

| Control | Action |
| --- | --- |
| D-pad ◀ ▶ / left stick | Move |
| A | Jump (hold for height, tap for a hop; in mid-air against a wall: wall jump) |
| ◀ / ▶ / A on a register's next digit | Writes that digit into the register (and still moves or jumps) |
| B | Force-write: slows time; then ◀, ▶ or A writes whatever digit you stand on |
| X | Flip gravity (when the level's Gravity Flip is online) |
| Y | Grab a shell or lit fork bomb (hold Y while touching it, or press Y beside it); press again to throw. On the raptor: tongue / spit |
| D-pad down | Drop what you hold, or hop off the raptor; hold in the air to fall fast |
| Right stick | Look ahead |
| SELECT / START | Sound on/off / menu (pause, sound, grid, reboot) |
| Phone back button | Pause menu (quits only from the title screen) |

Tapping a register on the bottom screen also force-writes the current digit into it.

## Levels

Four levels, each about hacking deeper into the machine. Every level brings its own registers, and
its obstacles are impossible without that level's hacks. Each level adds new curses and harsher
conditions. Progress is saved; the title screen offers to continue from the furthest level reached.

| Level | Theme | Impossible without | Hacks (sequence, control, opens when) | Curses |
| --- | --- | --- | --- | --- |
| 1 Boot Sector | overworld | ROM wall (Super Jump); 10-block pit (Super Jump + Speed) | Fire Power 4 2 7 1 9 A · Super Jump 3 8 5 2 ◀ · Speed Boost 6 1 4 8 3 ▶ (16 bytes) · Shield 5 * 5 ▶ | Heavy Boots 2 7 2 7 A · Memory Slip 1 6 6 1 ▶ |
| 2 Firewall | underground | floor-to-ceiling firewalls (Phase); 7-block pits (Double Jump) | Phase Shift 9 9 0 1 A (mid-air) · Double Jump 2 6 0 4 ▶ (10 bytes) · Hot Reload 3 1 4 1 ◀ · Bit Magnet # 5 5 ◀ | Memory Leak 0 0 7 3 ◀ · Packet Lag 6 6 2 2 ▶ · Blackout 3 3 9 9 A (below 60%) |
| 3 Cloud Storage | sky | caged virus by a tall wall (Quarantine, climb off its back); the void under open sky (Bridge); the void under the bus (Gravity Flip) | Quarantine 4 4 1 2 A · Alloc Bridge 6 2 8 0 ▶ (12 bytes) · Gravity Flip 7 3 1 5 0 ◀ (1 online) · Glide 2 @ 6 A | Outbreak 1 9 1 9 ▶ · Null Pointer 3 0 3 0 A · Packet Storm 5 5 2 5 ◀ |
| 4 Root Access | castle | firewall (Phase); lava under the bus (Flip); wall under open sky (Super Jump); firewalls through a lava floor (Flip + Phase together); KERNEL PANIC on the bridge (get past it, pull the kill switch) | Phase Shift 0 4 0 4 A (mid-air) · Gravity Flip 5 1 3 9 ▶ (1 online) · Super Jump 7 7 2 1 ◀ (below 70% stability) · Overclock $ 9 1 ▶ | Watchdog 2 2 8 ◀ · Packet Lag 1 1 6 6 ▶ · Heavy Boots 8 3 8 3 A · Blackout 9 2 9 2 A (below 60%) · Null Pointer 4 9 4 9 ▶ (after a crash) |

What the new hacks and curses do:

- **Double Jump**: a second jump in mid-air. **Hot Reload**: a crash respawns you where you last stood instead of at the save.
- **Quarantine**: viruses stop, stop hurting you, and become platforms. **Alloc Bridge**: dashed null blocks become solid.
- **Memory Slip**: every floor is as slick as ice. **Packet Storm**: a steady wind pushes you back.
- **Packet Lag**: every input reaches the hero 10 frames late. **Outbreak**: viruses run faster and respawn.
- **Null Pointer**: one in three platform blocks drops out of memory for a second every four seconds (they flicker first).
- **Watchdog**: a countdown on screen; when it reaches zero you crash, every 40 seconds, until a patch purges it.
- Root Access's Super Jump only opens once stability drops below 70%: unlock the other two hacks (or take some damage) first.

Green registers always take a write before red ones on the same control. The badge over the hero
shows where a press would go: **green** feeds a hack, **red** feeds a curse, **gold** depends on the
button. Patches from 0x blocks reduce corruption, flush partly filled curses and purge the most
recent active curse. A register filled with any wrong digit (only possible with a force-write)
segfaults and is flushed. Every write has a 10% chance of a random glitch. Nothing ever reverses the controls.

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
| Quarantine | thin, icy, with a short echo |
| Alloc Bridge | bass boost |
| Gravity Flip | while upside down, the EQ flips (bass cut, treble up) |
| ! Heavy Boots | slows and sinks |
| ! Memory Slip, ! Packet Storm | plays backwards, left and right channels swapped |
| ! Packet Lag | a late slap-back echo |
| ! Memory Leak | the pitch slowly drifts down (a patch restores it) |
| ! Blackout | muffled |
| ! Outbreak | frantic hi-hats on top |
| ! Null Pointer | drops out whenever the blocks blink out |
| ! Watchdog | a clock ticks over it, faster in the last 10 seconds |

Each level gives the song a harsher base treatment (Firewall is driven, Cloud Storage dark, slow and
echoing, Root Access fast and distorted). Written digits and symbols play as notes in F major on the song's beat
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
