# Kal-toh

> "Kal-toh is to chess as chess is to tic-tac-toe."

A playable take on the Vulcan game of *Star Trek: Voyager*, as an Android app, with three games
of steel *t'an* on a stone basin:

- **The kal-toh**, the way to play at first. A jagged jumble of t'an rests over the basin. Join
  two tips at a time with a new t'an: true neighbours bring order, false bonds fall, until the
  jumble becomes the kal-toh, two concentric icosidodecahedra joined junction to junction,
  spinning true on its hidden axis.
- **Many forms.** A new form every game, built rather than found. A jumble hides one of fourteen
  solids whose loops are of more than one kind (triangles and hexagons, squares and octagons,
  ...), with a sample of its pattern already closed and loose t'an hanging among it as noise.
  Read the angles that repeat, close its loops one by one, and struts brace outward from each
  loop closed; then build the same form again on their tips, an outer shell round the inner.
- **Rings.** A splintering nest of t'an hangs over the basin, gathered about a centre mass and
  held by a field that spins on a hidden axis. Close a loop around that axis and it becomes a
  ring. Overload the structure and pieces fall. Ring by ring, order comes out of the chaos.

Nothing is written on the screen. The title, the shape being built, the players, what just
happened and every control are carved on one face on the underside of the stone: tip the base over
to read them, from whichever side you like. All of it is engraved black, like the frame round it;
only the rings round the players' marks are painted, each in its player's colour. Ten minutes of
the mess hall loop beneath the play - the warp core's hum, the air, the crew's voices murmuring
under them - starting with your first touch; they play along with whatever else the phone is playing, never
pausing it. A voice guides you through your first game, and each way to play the first time you
play it, answering what you do, until you turn it down under the stone.
The stone stands on a silver pedestal table in Voyager's mess hall: beyond it, out of focus
and seen small and wide, the bar where Picard sits stands up to the right, and the table's satin
top mirrors the room softly,
with the stone and the t'an standing on it. The t'an are mirror-polished, with a touch of
aluminium's grey: a face turned toward you mirrors the mess hall behind you, where Tuvok sits at
his table, and the waiting t'an in the tray, its faces gently domed, holds his face.

<p align="center">
  <img src="docs/table.png" width="38%" alt="The kal-toh on its pedestal table in the mess hall, the stone and t'an mirrored in the table's top">
</p>
<p align="center">
  <img src="docs/jumble.png" width="19%" alt="The jumble of the original game">
  <img src="docs/sphere.png" width="19%" alt="The completed kal-toh, spinning on its axis">
  <img src="docs/forms.png" width="19%" alt="Many forms: a new form's jumble, a sample of its loops closed, noise among it">
  <img src="docs/forms-whole.png" width="19%" alt="Many forms: the inner form whole, struts bracing out from every junction">
  <img src="docs/forms-complete.png" width="19%" alt="Many forms: both shells whole">
</p>
<p align="center">
  <img src="docs/nest.png" width="19%" alt="The starting nest of rings">
  <img src="docs/ring.png" width="19%" alt="A ring forming">
  <img src="docs/complete.png" width="19%" alt="A completed globe of rings">
  <img src="docs/green.png" width="19%" alt="Two players, as it was before the mess hall: the light behind turned green on the second player's turn">
  <img src="docs/underside.png" width="19%" alt="The carved underside of the base, all on one face: the name and the shape being built, each seat named, its mark ringed in its colour, its plays marked beneath, what just happened, and the ways to play">
</p>
<p align="center">
  <img src="docs/ways.png" width="19%" alt="The face translated into Vulcan, in many forms: the form's name, the loops closed, the game and its ways, the room, sound and voice sliders, vibration, and the glyphs Rules, Translate and Shake">
  <img src="docs/rules.png" width="19%" alt="The rules of the chosen game and the marks under the seats, a glyph away">
</p>

## Install

1. Get the APK: `kaltoh/release/KalToh.apk` in this repository, or the `KalToh-apk` artifact
   of the latest **Build Kal-toh APK** run under the repository's *Actions* tab.
2. Open it on the phone. Android will ask you to allow installs from that source (the browser
   or file manager); allow it once, then install.
3. Needs Android 7.0 or newer with an up-to-date *Android System WebView* (any phone from the
   last several years). The game runs fully offline.

Every build is signed with the same sideload key (`android/app/sideload.keystore`, published
on purpose so updates install over each other; it is not a secret), so a newer APK installs
over an older one without uninstalling.

## How to play

| To | Do |
|---|---|
| Turn the base | Drag the stone (a fingertip off its edge counts). Sideways spins it like a potter's wheel; up and down tips it toward or away from you, all the way over. Let go mid-drag and it glides on, then stops. The base always turns about the centre of the sphere-to-be. Level - its foot within twenty degrees of facing straight down - it rests on the floor, and spins there like a turntable; tip it further, toward you or away, and it lifts to turn freely. It never comes down while you hold it: let it go within twenty degrees of level and it falls straight down until its lowest edge meets the floor, then tips over on that edge until it lies flush, with a knock each time (held tipped a little as it rests, it rocks up onto its edge, never into the floor). Resting there, the t'an turned into it ride up over it rather than pushing it into the floor. **Two fingers** on the stone turn it as you see it instead: twist them and it turns about your line of sight, the same way round; move them together and it tumbles along with them; spread or pinch them to draw nearer, or back again as far as the view was first framed. A drag on open space turns nothing, so a finger that only just misses the t'an at the foot of the screen sets nothing spinning. With the base turned over, grab it by its rim, outside the carving's framing circle: within the circle the carving is for touching, and nothing turns. |
| Turn the t'an | Drag anywhere within the t'an's outline, even between them (two fingers turn it as you see it, as for the stone). The assembly turns on the base and stays wherever you leave it. It has its own weight: when the base turns it lags behind and catches up, and flung, it coasts to a stop. Left alone it never moves on the base at all. It never cuts into the stone. While it turns, the stone gives way just enough; when the stone is turned into it, the t'an are bumped aside and settle against it. |
| Place a t'an | Touch the t'an lying at the foot of the screen with **one finger** to take it up: it dangles from your finger, swinging as you move, about as large as it lay in the tray - one finger is not enough to lay it. Put a **second finger** down anywhere and it is held by both. Two fingers on the tray at once lift it too. Held so, the t'an lies between your fingers at its own length, and **where its ends are is where it lands**: spread your fingers wide of the pieces, out of your own way, and lay its ends on them - in the original game and many forms, on the tips you mean to join (each end picks the tip nearest it, which lights up); in rings, anywhere on a piece. The pieces glow blue, and the held t'an shows exactly where it will rest (amber where it cannot, and the carving says why). Let go to place it; let go of a t'an held by one finger only and it goes back to the tray. The t'an waiting at the foot of the screen lies on the glass itself: it stays put however you draw the view nearer. |
| Read | **Tip the base over**, from any side. The carving is found with its top up whichever side it came up from, and as the underside comes to face you it draws near to be read. It is all on one face: the title, and beneath it the shape the game builds (in the original game *two concentric icosidodecahedra*; in many forms, this game's form); whose turn it is and the score; what just happened (in many forms, and how many loops are closed); then, under a carved rule, the ways to play, the room, the sound, the voice and vibration; and three glyphs at the foot: *Rules*, *Translate* and *Shake*. *Rules* turns to the rules of the chosen game, short, and the marks under the seats; *Return* comes back. |
| Play with others | Two players take turns at first, passing the phone; choose one to four (or a Vulcan, in rings) in the ways to play. Whose turn it is is told under the base, and only there: each seat is named (*Player 1*, *Player 2*, ... or *The Vulcan*) over its mark, which is ringed in paint of its colour (red for the first player, a rich green for the second, then deep blue and gold), the mark filled for whose turn it is. Beneath is the score: in the original game and many forms, true joins of those tried (*7/9*); in rings, points. Each player's plays are carved in order under their seat: a dot for a true join (or a t'an placed), a ringed dot for a great hoop, a loop closed or a ring, a cross where t'an fell. The rules show the marks. |
| Translate | Everything is carved in Standard at first. Touch the **Starfleet delta** carved among the glyphs, *Translate* beneath it (in Standard, whichever script the rest is in): all of it is smoothed away to bare stone and cut again in Vulcan, as deep. Touch it again for Standard. The carving reads in whichever script you left it in, the next time too. Touching the carving anywhere else translates nothing. |
| Ways to play | Carved on the face, under the players, in two columns: each way's name, and its value. First the game itself, with a line beneath on what it is, then its ways (how many players), then **Room** (the mess hall's sound around you), **Sound effects**, **Voice** (Sky's, guiding the play, full at first; silent, it guides no more) and **Vibration**. Touch a way's row to change its value. A change to the game waits for a new one: the rule across the face says *Shake to play this way*, and a ring is cut round *Shake*. Shake the phone, or touch *Shake*, to play that way. **Room**, **Sound effects** and **Voice** are sliders: touch along the groove, or draw a finger along it, from silent to full (silenced, the room's sound pauses). (Rings has more ways than fit on the face: a large **arrow carved at the rim** turns to them, and one on the other side turns back.) |
| Begin anew | **Shake the phone for three seconds**, or touch *Shake* under the base. |
| Be guided | A voice talks you through the game: *Sky*, one of the voices of the Kokoro speech model, every line spoken ahead of time and played from the app, offline. Your very first game is zen, where nothing can go wrong. The voice greets you, and as you go tells you how to take up a t'an with one finger and hold it with two, what blue and amber mean, how to turn the stone, and that there is more under it. It watches what you do and answers it: a t'an left waiting, or dangling from one finger; one let go before its ends were on two pieces, or where it glowed amber; a refusal (the same tip twice, already joined, too far, too near); harmony, discord and what to look for; a wobble, a fling, noise, a loop closed, a form taken, a shake gathering. Turned over, it says that everything is there, and how to choose a way and begin it; and the first time you play each way, what that way is. Each lesson is given once, remembered from one day to the next; a mistake is explained again when it is made again, though not every time. It never speaks over itself, and the room's sound dips beneath it. **Voice**, under the stone, sets how loud it is; slide it to nothing and it falls silent. |
| Draw nearer | Pinch, anywhere. |

### The kal-toh (the original game)

- **The hidden form.** The jumble is the kal-toh scrambled. Its true skeleton is a tree of 29
  t'an from the outer icosidodecahedron, with every joint twisted about its own t'an, so the
  joints keep their true angles: two t'an meeting at **60°** frame a triangle of the finished
  sphere, at **108°** a pentagon. The other 90 t'an (the inner shell and the struts between the
  shells) are tangled through it. Only junctions of the hidden order answer your touch.
- **A move** joins the tips of two t'an with a new one. A t'an reaches only tips about its own
  length apart as the jumble lies, no more than a quarter longer or shorter; it will not stretch
  to tips further apart, nor squeeze between tips closer together (it glows amber and goes back to
  the tray). Because the skeleton is a tree, every join closes a loop, and the pieces shift until
  the tips meet. If no true join lies within reach - after a run of false bonds, say - the jumble
  eases a little toward its order, and again, until one does (the carving says so), so every game
  can be finished.
  - *Harmony*: the tips are true neighbours in the sphere. The loop pulls into its true shape, a
    blue wave runs through the structure, and the tangled t'an nearby glide into the inner shell.
    Closing one of the six great hoops of ten sends a brighter wave round it.
  - *Discord*: they are not. The new t'an falls away in amber, shaking loose the newest bond at
    those tips, and the structure slips back toward chaos. Where the first tip truly belongs - its
    neighbours in the sphere not yet joined to it - glows a moment, so a mistake teaches.
- **The hidden spin.** The structure spins about a hidden axis, different every game. Every t'an
  is mass on that spin. A join that would unbalance it past what it can bear is *flung* away even
  if it is true; but one that brings it back toward balance always holds, even when a false bond
  has shaken loose what kept it within bounds. Brought close to that limit, it wobbles, and the
  carving warns you. Build evenly around the axis.
- **The end.** The sphere is complete when all 60 outer t'an are in place. The inner shell
  settles, a thread of light shows the axis, and the kal-toh glows. Alone, you are told how many
  moves it took and how many t'an fell. With others (one to four, taking turns), whoever places
  the final t'an wins: plan so that your rival is left with only discord or imbalance.
- Everything rests on the stone as the rings game does: the kal-toh keeps its place on the base,
  turns with it, is never cut into by it, and its fallen t'an lie where they fall until a new game.

### Many forms

- **A new form every game.** The jumble hides one of fourteen solids, each with t'an all of one
  length and loops of more than one kind: the truncated tetrahedron (triangles and hexagons), the
  cuboctahedron (triangles and squares), the truncated octahedron (squares and hexagons), the
  truncated cube (triangles and octagons), the rhombicuboctahedron (triangles and squares), the
  prisms of five to eight sides and the antiprisms of four to eight. It is turned any way up, and
  the jumble is twisted anew.
- **The jumble** is the inner form's skeleton, a tree of its t'an with every joint twisted about
  its own t'an, so the joints keep their true angles: **60°** a triangle, **90°** a square,
  **108°** a pentagon, **120°** a hexagon, **135°** an octagon. A sample of its pattern is already
  closed in its true shape: some of the loops about one junction, of more than one kind. Loose
  t'an hang among it as noise.
- **A move** joins two tips about a t'an apart with a new one, as in the original game (it will
  not stretch or squeeze; if no true join lies within reach, the jumble eases toward its form).
  - *Harmony*: true neighbours. The loop the new t'an closes pulls toward its true shape. A loop
    of the form closed whole finds its equilibrium: it glows round, holds for good (no false bond
    can shake it loose), and struts brace outward from each of its junctions. Noise hanging from a
    junction whose loops are all closed falls away.
  - *Discord*: not neighbours, or a tip of the noise. The new t'an falls, shaking loose the newest
    bond at those tips that no closed loop holds, and where the tip truly belongs glows a moment.
    Noise you touch falls away with it.
- **The outer shell.** When the inner form is whole, a strut stands out from every junction, the
  last of the noise falls, and the tray brings a longer t'an. Build the same form again on the
  struts' tips. The struts lean a little at first and find their true lines as the outer loops
  close about them, so copy the pattern of the shell within: two struts' tips are neighbours only
  if their junctions are.
- **The end.** Both shells whole, the kal-toh glows, its hidden axis shows, and the carving names
  the form. Alone, you are told how many moves it took; with others (one to four, taking turns),
  whoever made the most true joins prevails.

### Rings

- **The t'an** are all one length. They cling magnetically where they touch, and never pass
  through one another. The opening nest is made by dropping each t'an toward the centre mass
  until it comes to rest against two others. The nest is then tested against the game's hidden
  forces, so nothing floats and no chain hangs out further than its bonds can bear.
- **The hidden forces** change every game: an axis through the centre mass, a spin of unknown
  strength about it, and sometimes a steady drift. The spin flings every t'an outward from the
  axis and twists it toward lying square to it.
- **A move** places one t'an touching two pieces whose touch points are no further apart than
  its own length. It rests against them, never through anything.
- **Rings.** If the new t'an closes a loop that winds once around the hidden axis, and the loop is
  close enough to a ring's shape, its t'an slide into a regular polygon square to the axis, right
  where the loop was, meeting or crossing tip to tip. Whatever only hung from the loop falls away
  as it forms. A ring's joints are twice as firm as a chance crossing, and since it is centred on
  the spin, a ring carries its own load. A ring also reveals the axis to everyone.
- **Fallen t'an** lie where they fall, in the basin, on its lip or on the floor beneath the
  stone, until a new game begins. Nothing ever passes into the stone: every t'an, standing or
  fallen, is kept clear of it along its whole length.
- **Collapse.** After every move the spin tests the whole structure. If some bond cannot carry its
  load in any way the structure could share it, it gives way, the load shifts, and whatever no
  longer hangs from the centre mass falls. Strained t'an glow amber, a warning before
  they give.
- **Forms.** *Lantern*: three rings, at least one above the centre mass and one below.
  *Globe* (the default): four rings, at least one above, one below, and one about the middle.
  *Sphere*: six rings, two above, two below, one about the middle, and one crowning each pole.
  When the form is complete, everything that is not a ring, the centre mass, or holding them
  together falls away, and the finished kal-toh glows.

How to win at rings:

- **Most points** (the default): a ring scores one point per t'an in it. Each t'an your move
  drops costs one. Completing the form scores ten. The game ends when the form is complete or
  the t'an run out.
- **Last standing**: drop two or more t'an in one move and lose a life. The spin quickens every
  round. The last player standing wins.
- **Fewest moves**: alone, with no limit. Complete the form in as few moves as you can.

Opponent: a Vulcan *novice*, *adept* (default) or *master*, or nobody (pass and play, one to
four players). Other settings: the spin's strength (unknown by default), a drift, the axis hidden
or shown, a light, medium or dense nest, *foresight* (see the ring a held
t'an would make, once the axis is known, always, or never), strain cues, *chains* (a ring earns
another turn, as boxes do in dots and boxes), the supply of t'an, lives, the room's, sound and voice levels,
and vibration. The settings are remembered, and so is the script the carving was last
translated to.

### Strategy

In the original game, read the angles: a 60° joint is a triangle waiting to be closed, a 108°
joint a pentagon. Build evenly all round, and heed a wobble: one side has grown too heavy.

In many forms, look first at the sample: its loops tell you two of the form's kinds, and how they
meet at a junction. Then find the angles that repeat in the jumble, close small loops first (they
lock, and their struts mark the junctions that are settled), and look for the pattern of loops
round each junction: it is the same at every one. Leave the noise alone; a tip that hangs from a
single t'an at an angle no loop of the form would make is likely noise.

In rings, the axis is the secret. Until a ring forms, every loop you close is a guess. Once the
axis is known, rings are a race,
and the game becomes one of tempo, as in dots and boxes. A loop left one t'an short of closing
is a ring for your opponent, so build toward rings only where you can finish them. Building far
out from the centre mass, or hanging long chains, risks a collapse that costs you points or a
life. In *collapse* the spin keeps rising, so every move must leave the structure stronger than
it found it.

## How it is made

- **`android/app/src/main/assets/www/`**: the game, as plain ES modules on
  [three.js](https://threejs.org) (r186, vendored), with no build step.
  - The physics and rules, with no rendering (so they run and are tested under Node):
    - `geom.js`: vectors, quaternions, closest points between segments.
    - `nest.js`: t'an and bonds; growing a nest by dropping t'an toward the centre mass.
    - `statics.js`: will it hold? Every bond carries a force and a moment. A least-strain
      solution by preconditioned conjugate gradients, then iterative re-weighting toward the
      plastic limit (a structure stands if any distribution of its load keeps every bond within
      strength). Breaking and collapse follow.
    - `relax.js`: position-based relaxation. When a ring forms, contacts slide along the t'an to
      stay in touch, nothing interpenetrates, and the most stretched contact lets go first.
    - `rules.js`: placement, loops around the axis (a breadth-first search over how many times a
      path has crossed a cut around the axis), rings, forms, modes, scoring.
    - `classic-rules.js`: the original game. The icosidodecahedral lattice, the jumble (a
      balanced spanning tree with every joint twisted, steered clear of the stone beneath it),
      harmony, discord, imbalance and the wobble.
    - `forms-rules.js`: many forms. The fourteen solids, each built from its points (rods as the
      closest pairs, loops walked round each junction's neighbours in turn), the jumble (a
      spanning tree holding the sample's loops, every other joint twisted), the noise, the leaning
      struts, the two shells, harmony, discord and easing.
    - `ai.js`, `ai-worker.js`: the Vulcan. It tries moves on copies of the game, looks a reply
      ahead, and builds arcs round the axis. It knows the axis only once it has been revealed.
  - The view: `classic.js` (the original game on the stone: the jumble's skeleton kept rigid by a
    small position-based solver as each junction finds its order, the inner shell settling into
    place, joining and the end), `forms.js` (many forms on the stone, in the same
    way: loops closing, struts growing out, noise falling away, the outer shell), `scene.js` (renderer, lights, the mess hall -
    sharp in the metal, turned so that Tuvok, at his table, is behind the player; out of focus
    beyond the kal-toh, shown eight times smaller than the window would show it, so much of the
    room is on the screen, and framed so the bar where Picard sits stands up to the right, clear of
    the kal-toh; drawn nearer, it grows as a room whose far wall stands some way beyond the table
    would - the stone, and the window the screen becomes), `table.js` (the pedestal
    table under the stone, its top at the floor, its near edge out of sight: satin silver (black
    where the model is) mirroring the blurred room, and the
    stone and t'an on it drawn a second time each frame, the eye turned over in the plane of the
    top, without shadows, at the screen's own resolution and multisampled, softened only a touch), `motion.js` (base and assembly dynamics, and every t'an kept clear of
    the stone along its length), `rodmesh.js` (polished metal t'an: flat mirror faces, nothing
    bending what they reflect, the room looked up as sharp as the metal is smooth, with a trace of
    aluminium's pale grey laid over it; only the waiting t'an's faces are domed, a little, so that
    it shows Tuvok whole enough to know; where t'an meet at a junction their
    ends are mitred in the shader, each corner cut back to the plane halving the angle to each
    other t'an there, so they meet the last millimetre to the last), `falling.js` (fallen t'an: tumbling, coming to rest on the
    stone or the table, or tipping off its edge and away, and staying until a new game), `tray.js`, `input.js`, `engrave.js`
    (everything written, carved on one face of the stone's underside - the ways to play among it,
    laid out from `settings.js` - on a layer whose depth the shader can smooth away and recut), `texts.js` (the words,
    in Vulcan and Standard), `settings.js`, `audio.js` (synthesized sound: every contact as its materials would sound - thin light metal on
    metal, rock on metal, rock on rock - each struck and drawn along), `shake.js`, `main.js`. `audio.js` also
    loops the music, through its own level, paused when silenced or out of sight; on the phone the
    shell plays it (`MainActivity.java`, a media player that never asks for the audio focus, so other
    apps' sound plays on). The **Room** slider sets its level.
  - `guide.js`: the voice guiding the play. It hears what the game reports (a t'an taken up, held,
    aimed, let go, placed; every line the carving says) and watches what it can see (a t'an left
    waiting, the stone turned over, a shake gathering), and answers: each lesson once, remembered
    in the browser's storage; a mistake again when it is made again, but not within twenty seconds;
    never two lines at once, and none until the sound can be heard. Its lines are Kokoro's *Sky*
    voice, rendered ahead of time by `tools/make_voice.py` from `tools/voice-lines.json` into
    `assets/voice/` (about four minutes of speech, 1.7 MB) and played by `audio.js` at the Voice
    slider's level, the room's sound dipping beneath.
- **`android/`**: a small Java shell (`MainActivity.java`). It runs a full screen WebView that
  serves the game from the APK, and handles accelerometer shake detection and haptics.
- **`tools/`**
  - `physics.test.mjs`: geometry, load paths, and growing nests.
  - `rules.test.mjs`: placement, rings, forms, modes, the Vulcan, and physical invariants
    checked after every move of many random games. Every t'an keeps its length, nothing passes
    through anything, nothing floats, and every bond bears its load.
  - `classic.test.mjs`: the original game's lattice, jumbles (every t'an whole, every joint true),
    harmony, discord, and complete spheres, balanced and won by whoever places the last t'an;
    that played within a t'an's reach, with the jumble lying as the game draws it and easing when
    stuck, every game can be finished, mistakes and all; and that past the balance limit a join
    that restores balance still holds.
  - `ground.test.mjs`: the stone at rest on the floor when level, rocking up onto its edge (never
    into the floor) when held tipped a little, lifted to turn freely when tipped past twenty degrees,
    never coming down while held, and let go falling straight down to its edge, then tipping flush,
    knocking each time; resting there, t'an spun into it are lifted clear.
  - `forms.test.mjs`: many forms. Every solid (rods equal, loops flat and regular, junctions,
    rods and loops as a solid's), new games of them (the jumble keeps every t'an whole and every
    joint true, the sample in its true shape and place, noise, leaning struts), moves, loops
    holding and bracing outward, both shells completed, and that played within reach, easing
    when stuck, every game ends, mistakes and all.
  - `browser-check.cjs`: plays the real game in headless Chromium with simulated touch. First the
    original game: the jumble grows, a t'an taken up by one finger and held by a second, its ends laid
    on two tips, joins true neighbours, tips too far apart for a t'an are refused, a false bond falls and shows where the
    tip belonged, no t'an passes into the stone, and t'an meeting at a
    junction are mitred to touch. Turned over, the base shows everything on one face (the name and
    the shape being built, the two players, what happened, the game and its ways, the room, the
    sound, the voice and vibration, and the glyphs, with no page to turn to and no row for the
    script); touching the
    game there changes it, the carving says to shake to play this way, and the glyph *Shake* plays
    many forms: its form named under the title, the sample and the noise, a true join, noise touched
    falling away, the inner form
    whole with struts at every junction and a longer t'an in the tray, a join on the struts' tips.
    Then, with its further ways a page on by the arrows at the rim, it plays rings. It covers
    placing, the Vulcan's reply, a ring, and turning the base: the t'an lag, catch
    up, then hold perfectly still; a drag on open space below the stone turns nothing; two fingers
    twisted on the stone turn it about the line of sight. It turns the t'an by their area and checks
    no t'an ever passes
    into the stone. It turns the base over to read it (top up whichever way it was turned); a drag
    within the carving's circle turns nothing and a touch there does not translate it, but the
    Starfleet delta does (Standard at first, Vulcan then), and the script is remembered for next
    time. The rules glyph turns to the rules, and *Return* comes back. It draws a finger along the
    room's slider, sets the voice's level on its own slider, and changes the ways on the face for a new game. It covers
    fallen t'an staying until a new game, and shaking to begin anew. It checks that the stone stands on the table, its top at the
    floor, mirroring what stands on it (and then puts the table out of sight: drawing its metal
    makes the software renderer several times slower), that whose
    turn it is is told only under the board (the scene's light the same on each player's turn),
    that each player's plays are kept for the carving, and that each seat is named.
  - `convert_base.py`, `convert_table.py`, `make_icon.py`: asset and icon generators (the table at its
    full detail, 154,670 triangles; on the phone that is nothing, and its rounded edges need them).
  - `make_voice.py`: renders the guide's lines with Kokoro (kokoro-onnx, the Sky voice) into
    `assets/voice/`, each brought to -14 LUFS so it is clear over the room's sound; unchanged
    lines are kept.
  - `guide.test.mjs`: the guide, as a player would meet it - each lesson once, each mistake
    answered, nothing said while it cannot be heard or once turned down to nothing - and every line
    it can say written and rendered as written.

```sh
node kaltoh/tools/physics.test.mjs
node kaltoh/tools/rules.test.mjs
node kaltoh/tools/classic.test.mjs
node kaltoh/tools/forms.test.mjs
node kaltoh/tools/ground.test.mjs
node kaltoh/tools/guide.test.mjs
node kaltoh/tools/browser-check.cjs out/   # needs Playwright with Chromium
```

### Build it yourself

```sh
# needs JDK 17+ and the Android SDK (ANDROID_HOME)
cd kaltoh/android
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

To try the game in a desktop browser, serve `android/app/src/main/assets/www/` with any static
web server and open `index.html`. Drag with the mouse to turn the base, or the t'an by their
area; press `R` to begin anew, and use the mouse wheel to draw nearer.

## Credits and notes

- Kal-toh and *Star Trek* belong to Paramount; this is an unofficial fan project for personal use.
- The Vulcan fonts (*Vulcan Script* for titles, *Modern Vulcan* for everything else), the stone
  basin and pedestal table models (made with Meshy), the mess-hall panorama (and its blurred copy,
  `assets/sky.jpg`) and the ambience
  (`android/app/src/main/assets/www/assets/music.mp3`, already cut to ten minutes and faded in and
  out; made louder here) were supplied for this project. Their licences are not included; check
  them before distributing the app beyond personal use.
- The guide's voice is *Sky* (`af_sky`) of Kokoro-82M by hexgrad (Apache 2.0), run with
  kokoro-onnx (MIT).
- three.js is MIT licensed (`android/app/src/main/assets/www/vendor/three.LICENSE`).
- The window the screen becomes follows Robert Kooima's *Generalized Perspective Projection*
  (2008).
