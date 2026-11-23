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

## Menus, save files and the hack tool

**Title:** START always brings up the title menu (A plays). The game plays itself behind the menu, without dimming it: a bot runs through all four levels
with the music and sound on, showing good play and bad (feeding a curse, side contact, two jumps over an
eleven-block gap, walking into the void), and loops. The menu: NEW, SAVES, SETTINGS and TUTORIAL. TUTORIAL is a list of fifteen lessons (writing a digit,
digits from viruses, air digits, finishing a hack, curses, crashes, Super Jump, Speed Boost, Phase Shift,
Multi Jump, Quarantine, Alloc Bridge, Gravity Flip, flip and phase, KERNEL PANIC): pick one and the bot
plays it with a caption at the top of the game screen and a note on screen 2 whose arrow points at the part
being explained (the memory row, a register card, the status line), then offers the next one, again, the list, or play; pressing anything during a
lesson goes back to the list (plus
HACK TOOL in the stacked landscape layout). Levels start straight away, with a small banner.
A or START on the title continues your latest unfinished run.

**Pause menu** (START, or the phone's back button): RESUME, RESTART (the level), RESTART FROM CHECKPOINT
(back to your last save point without losing anything), SAVES, SETTINGS, TUTORIAL and QUIT TO TITLE. While
paused, screen 2 shows the hack tool, where this level's registers (dashed, with their progress) and your
set show green among everything else.

**Saves are automatic and historical.** Every run is kept as its own save, newest first; it's written when
a level starts, every ten seconds of play, on pause and when a level is cleared. SAVES lists them with
CONTINUE and DEL (tap twice), and NEW GAME sits at the top.

**Settings** (remembered): sound, music, vibration, grid, hints, the title demo, and the landscape layout.

**Screen 2 is one searchable hack list, everywhere** (title, playing, paused; in the stacked landscape
layout the list opens full screen from HACK TOOL or SCAN HACKS). At the top, ACTIVE: copies of the rows in
play right now (in a level, that level's own registers paired up, then your set; on the title, your set). Below the search box and filters (ALL, IN SET, LEVEL, CHEATS, MACROS,
WARPS, LOOK, GLITCHES) comes the whole list, the originals staying where they are. Adding or removing a
hack never makes the list jump: it holds its place while the copy appears or disappears above.

Each card looks like the game's register cards: the top row is its level number, then what the hack does;
the bottom row is the control (A, ◀ or ▶) and the register's digits, written ones lit, the
next one a little bigger and coloured, glowing when you're standing on it. While you play, the digits are
the big bold line; paused or on the title, the description is. Colour: white available, green active
(pink for curses), grey still locked. Down the right edge runs a minimap of the whole list in the same
colours, with a frame for what's on screen; tap or drag it to jump. During a level a thin strip above the
list keeps the memory row and one status line: what happened last, and why.

**Unlocking:** clearing a level for the first time unlocks that level's hacks and curses plus a batch of
the rest (eight or so cheats, macros, warps, looks and glitches); the level number on a card is the level
that unlocks it. Tap an available card to put it in your set, or take it out. Your set comes with you into
every level, listed under YOUR SET below the level's own registers; like the level's, each has a digit
string you write in to switch it on.

**Hacks and curses come in fixed pairs**, shown as rows: the hack on the left, its curse on the right
(Super Jump with Heavy Boots, God Mode with Echo Rootkits, and so on; looks come alone). Tapping either side
turns the whole row on or off; an active row is outlined, its hack filled green and its curse red.

**Every hack you add brings a curse with it**, picked for you and marked "came with" in the tool; it goes
away when you remove the hack. Looks (palettes, sprite scale) come free.

| Group | Entries |
| --- | --- |
| Level | every hack and curse from all four levels |
| Cheats | Moon Gravity, Spring Legs, Turbo, God Mode, Byte Printer, Stabilizer, Memory Dump (reveals every digit), Bullet Time (whole game at 70%), Virus Shrink, Rapid Fire |
| Macros | Auto-Run, Bunny Hop (hold A), Auto-Write (writes hack digits without a press) |
| Warps | Warp: Next Save, Save Anywhere (both fire once, then reset) |
| Look | Sprite Scale 0.6 / 1.5, palettes: Neon, Handheld, Sepia, Mono, Inverted |
| Glitches | Heavy Gravity, Virus Growth, Overclocked Viruses, Byte Drain, Memory Fog, Screen Quake, Row Scramble, Virus Spawner, Sticky Floor, Virus Armor, No Grace, Sluggish, Hiccups, Bit Rot, Echo Rootkits, Palette Rot, Screen Tear, Memory Blinds, Write Tax |

Cheats can carry you past a level's gates; that's the point of bringing them, and the paired curse is the
price. Minigames will join the catalog in a later version.

## Writing digits: three layers, and touch

Digits live in three layers, and the one you write from is the one you're in:

- **Ground:** every column's digit, on the memory row at the top of screen 2. It decrypts the first time you pass.
- **Platform:** every block you can stand on has its own digit, printed on its face once you get near.
- **Air:** every column also has an air digit. While you're airborne (jumping, falling, on a wall) you read it. You don't have to be in the air first: press ◀ or ▶ together with A (or a moment before it) and the air digit is the one written; on its own, ◀ ▶ on the ground write the ground digit.

The memory row (at the top of screen 2) has two lanes: the top lane shows air digits, gold symbols and the digits viruses and boxes
carry; the bottom lane shows ground digits. Your column shows the digit you would write right now, with a
mark for its layer (a caret for air, a bar for a platform). Digits that some register wants next are lit:
green for a hack, red for a curse, gold for both.

**Keys:** on a register's next digit, press its control (◀, ▶ or A). The press still moves or jumps.
If two registers on that control want it, a hack takes it before a curse. A press that writes nothing
tells you why when the digit is wanted elsewhere ("3 FITS JUMP: PRESS ◀").

**Touch:** viruses and 0x boxes carry digits. Stomp, kick, grab, bump, shoot or swallow one (or stand on
a box or a frozen virus) and its digit goes into **every** register that needs it next, on any control,
curses included.

**Progress never undoes.** Only the right digit writes. When a register is full it turns on; entering
its whole string again switches a hack off, or lifts a curse. B scans the memory around you (29 columns,
the air lane and platforms) on a five-second cooldown. Tapping a register on the middle screen explains
it in the log; taps never write.

## Digits carried by viruses and boxes

Each level removes one or two digits from the memory row entirely, and only viruses and 0x boxes
carry them. They are the digits that level's key hacks need:

| Level | Missing from memory | Needed by |
| --- | --- | --- |
| 1 Boot Sector | 8 | Super Jump, Speed Boost |
| 2 Firewall | 0 | Phase Shift, Multi Jump |
| 3 Cloud Storage | 4 | Quarantine (twice; the caged virus carries one) |
| 4 Root Access | 0 and 7 | Phase Shift, Super Jump |

Every virus and every 0x box carries a digit (every other one carries a missing digit), written by
touching it (see above). Their digits show in the top lane of the memory row at the column they occupy
(pink for a virus, gold for a box, red and flickering for an orphan), as `?` until you come within three
columns. A virus's digit slides along as it walks. A killed virus leaves its digit behind as an orphaned
pointer; brush past it to write it, so a missing digit can't be lost.

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
| TROJAN | the shell | stomped, it retreats into its hex capsid, which keeps its digit. Touch the shell to kick it; hold Y (or press Y beside it) to pick it up and carry its digit anywhere (even mid-air for Phase Shift); Y throws it, down drops it. A kicked shell mows down viruses, breaks RAM blocks into pixels and bumps 0x boxes. A shell you leave stays a shell, and a lit fork bomb you set down holds its fuse until you pick it up again |
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
instead of you crashing; catch it again. Riding, you're still one block wide, so you fit down 1-tile holes.
X jumps you off (a full jump); you can't land back on it until you've touched the ground or a platform.

**Level toolbox:** springs and bounce buffers, one-way scaffolds, page lifts (moving platforms),
volatile platforms that drop after you stand on them, pipelines (conveyors), cold storage (ice),
hidden sectors (invisible blocks that appear when bumped, each holding a missing digit), and a bit-flip
switch that toggles pink BIT-1 and cyan BIT-0 blocks. None of it is placed where it could bypass a
level's required hacks; every gate was re-checked against springs, platforms and the raptor.

## Movement

The platforming follows modern conventions and is tuned to feel snappy:

- **Coyote time** (7 frames to jump after running off a ledge) and a **jump buffer** (a press up to 8 frames before landing still jumps).
- **Variable height**: let go of A early for a short hop (rising speed is cut in half). A short **hang at the apex** while A is held.
- **Double jump, always**: a second jump in mid-air is yours from the start.
- **Wall slide and wall jump**: press into a wall in mid-air to slide down it slowly; A kicks off it. Ground, blocks and conduits hold you; ROM, firewalls, the bus, NULL blocks, ice and bit blocks are too smooth, and nothing holds you once you've dropped below the ground line, so pits stay pits.
- **Forgiving stomps**: clip the top corner of a virus on the way down and it counts as landing on it.
- **Corner correction**: clip the corner of a block on the way up and you're nudged past it instead of stopped dead (hidden sectors excepted).
- **Crouch**: hold down, anywhere, even mid-air or on the raptor. You get shorter (head down, feet put), crouch-walk slowly, and stay down under a low block until there's room.
  Crouched you're under a block tall, so you fit a one-block-high gap; on the raptor, the raptor ducks too and you ride through.
  Both have their own crouch art: the hero's sheet has a crouch row (your two crouch frames: still uses the first, crouch-walking alternates both, mid-air uses the second), and the raptor
  has a low pose, belly to the floor and head forward, with your cap and eyes peeking over its back.
- **Hitbox**: the hero is 10 pixels wide, narrower than a block, so jumping up through a one-block hole doesn't need perfect lining up.
- **Phase Shift**: besides firewalls and conduits, walk (or jump) into any wall from the side and you drift through it to the
  first spot on the far side where you fit (up to 12 blocks). Floors and ceilings still hold.
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
hero again in the wrong places. Every unlock and curse writes lasting faults into the level (they heal
after 40–70 seconds); instability adds short ones. There are never more than 36 faults at once, and at most
10 garbage blocks, oldest healing first, so a long run never fills the sky with junk.

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

Held upright: the game screen runs edge to edge on top, and screen 2 (memory row, registers, hack tool)
fills the space between it and the controller. Held sideways (and on desktop), the controller halves sit either side and,
by default, the game is on the left and screen 2 on the right, both full height; there the memory row shows
the columns around the hero at full size. SETTINGS can switch landscape to STACKED: the game on top and a
slim screen 2 under it, whose registers run in four columns (hack, curse, hack, curse).

## Controls (on-screen handheld controller)

| Control | Action |
| --- | --- |
| D-pad / left stick | Move (up also jumps). In menus and the hack list: move the highlight |
| A (green) | Jump (hold for height, tap for a hop; in mid-air against a wall: wall jump). In menus: press the highlighted button |
| B (red) | Hold to run (walking is three quarters of running speed). In menus: back |
| ◀ / ▶ / A on a register's next digit | Writes that digit into the register (and still moves or jumps) |
| SELECT | Scan: decrypts 29 columns of ground, air and platform digits around you (5 s cooldown) |
| X (blue) | Flip gravity (when the level's Gravity Flip is online); on the raptor, jump off (no remount until you land) |
| Y (yellow) | Grab a shell or lit fork bomb (hold Y while touching it, or press Y beside it); press again to throw. On the raptor: tongue / spit |
| D-pad down | Crouch (on the ground, in the air or on the raptor); also sets down what you hold |
| Right stick | Look ahead |
| START | Pause menu; on the title, the title menu |
| Phone back button | Pause menu (quits only from the title screen) |
| The two lights on the right | Top: lit green, red or gold when a press would write (hack, curse, both). Bottom: stability, green to amber to red, blinking when critical |

Tapping a register on the middle screen explains it in the log. Leave the title screen alone for nine
seconds and the game plays a demo with captions; any input ends it.

## Levels

Four levels, each about hacking deeper into the machine. Every level brings its own registers, and
its obstacles are impossible without that level's hacks. Each level adds new curses and harsher
conditions. Progress is saved; the title screen offers to continue from the furthest level reached.

| Level | Theme | Impossible without | Hacks (sequence, control, opens when) | Curses |
| --- | --- | --- | --- | --- |
| 1 Boot Sector | overworld | ROM wall, ten blocks tall under open sky (Super Jump and a double jump); thirteen-block pit (Speed Boost) | Fire Power 4 2 7 1 9 A · Super Jump 3 8 5 2 ◀ · Speed Boost 6 1 4 8 3 ▶ (16 bytes) · Shield 5 * 5 ▶ | Heavy Boots 2 7 2 7 A · Memory Slip 1 6 6 1 ▶ |
| 2 Firewall | underground | floor-to-ceiling firewalls (Phase); eleven-block pits (Multi Jump) | Phase Shift 9 9 0 1 A (mid-air) · Multi Jump 2 6 0 4 ▶ (10 bytes) · Hot Reload 3 1 4 1 ◀ · Bit Magnet # 5 5 ◀ | Memory Leak 0 0 7 3 ◀ · Packet Lag 6 6 2 2 ▶ · Blackout 3 3 9 9 A (below 60%) |
| 3 Cloud Storage | sky | caged trojan by a nine-block wall (Quarantine, climb off its back with a double jump); the void under open sky (Bridge); the void under the bus (Gravity Flip) | Quarantine 4 4 1 2 A · Alloc Bridge 6 2 8 0 ▶ (12 bytes) · Gravity Flip 7 3 1 5 0 ◀ (1 online) · Glide 2 @ 6 A | Outbreak 1 9 1 9 ▶ · Null Pointer 3 0 3 0 A · Packet Storm 5 5 2 5 ◀ |
| 4 Root Access | castle | firewall (Phase); lava under the bus (Flip); a ten-block wall under open sky (Super Jump and a double jump, or Phase through it); firewalls through a lava floor (Flip + Phase together); KERNEL PANIC on the bridge (get past it, pull the kill switch) | Phase Shift 0 4 0 4 A (mid-air) · Gravity Flip 5 1 3 9 ▶ (1 online) · Super Jump 7 7 2 1 ◀ (below 70% stability) · Overclock $ 9 1 ▶ | Watchdog 2 2 8 ◀ · Packet Lag 1 1 6 6 ▶ · Heavy Boots 8 3 8 3 A · Blackout 9 2 9 2 A (below 60%) · Null Pointer 4 9 4 9 ▶ (after a crash) |

What the new hacks and curses do:

- **Multi Jump**: two more jumps in mid-air on top of the double jump; save each one for when you start to fall. **Hot Reload**: a crash respawns you where you last stood instead of at the save.
- **Quarantine**: viruses stop, stop hurting you, and become platforms. **Alloc Bridge**: dashed null blocks become solid.
- **Memory Slip**: every floor is as slick as ice. **Packet Storm**: a steady wind pushes you back.
- **Packet Lag**: every input reaches the hero 10 frames late. **Outbreak**: viruses run faster and respawn.
- **Null Pointer**: one in three platform blocks drops out of memory for a second every four seconds (they flicker first).
- **Watchdog**: a countdown on screen; when it reaches zero you crash, every 40 seconds, until a patch purges it.
- Root Access's Super Jump only opens once stability drops below 70%: unlock the other two hacks (or take some damage) first.

Green registers always take a write before red ones on the same control. The badge over the hero
shows where a press would go: **green** feeds a hack, **red** feeds a curse, **gold** depends on the
button. Patches from 0x blocks reduce corruption, flush partly filled curses and purge the most
recent active curse. Only a register's next digit is ever written, so nothing is lost by
pressing in the wrong place. Every write has a 10% chance of a random glitch. Nothing ever reverses the controls.

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
| Multi Jump | chorus doubling |
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
(curse writes clash); glitches stutter it, tape-stop it, bitcrush it
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
