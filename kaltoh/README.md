# Kal-toh

> "Kal-toh is to chess as chess is to tic-tac-toe."

A playable take on the Vulcan game of *Star Trek: Voyager*, as an Android app, with two games
of steel *t'an* on a stone basin:

- **The kal-toh**, the way to play at first. A jagged jumble of t'an rests over the basin. Join
  two tips at a time with a new t'an: true neighbours bring order, false bonds fall, until the
  jumble becomes the kal-toh, two concentric icosidodecahedra joined junction to junction,
  spinning true on its hidden axis.
- **Rings.** A splintering nest of t'an hangs over the basin, gathered about a centre mass and
  held by a field that spins on a hidden axis. Close a loop around that axis and it becomes a
  ring. Overload the structure and pieces fall. Ring by ring, order comes out of the chaos.

Nothing is written on the screen. The title, the instructions and every control are carved into
the underside of the stone: tip the base over to read them, from whichever side you like.

<p align="center">
  <img src="docs/jumble.png" width="19%" alt="The jumble of the original game">
  <img src="docs/sphere.png" width="19%" alt="The completed kal-toh, spinning on its axis">
  <img src="docs/nest.png" width="19%" alt="The starting nest of rings">
  <img src="docs/ring.png" width="19%" alt="A ring forming">
  <img src="docs/complete.png" width="19%" alt="A completed globe of rings">
</p>
<p align="center">
  <img src="docs/green.png" width="19%" alt="Two players: the light behind turns green on the second player's turn">
  <img src="docs/underside.png" width="19%" alt="The carved underside of the base, each player's plays marked under their seat">
  <img src="docs/ways.png" width="19%" alt="The ways to play, with an arrow at the rim to turn the page">
  <img src="docs/tuning.png" width="19%" alt="The hologram's tuning, carved">
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
| Turn the base | Drag the stone or open space. Sideways spins it like a potter's wheel; up and down tips it toward or away from you, all the way over. Let go mid-drag and it glides on, then stops. The base always turns about the centre of the sphere-to-be. |
| Turn the t'an | Drag anywhere within the t'an's outline, even between them. The assembly turns on the base and stays wherever you leave it. It has its own weight: when the base turns it lags behind and catches up, and flung, it coasts to a stop. Left alone it never moves on the base at all. It never cuts into the stone. While it turns, the stone gives way just enough; when the stone is turned into it, the t'an are bumped aside and settle against it. |
| Place a t'an | Put **two fingers** on the t'an lying at the foot of the screen to lift it. Move each finger onto a piece of the kal-toh: in the original game, near the tip you mean to join (the tips light up); in rings, anywhere on a piece. The pieces glow blue, and the held t'an shows exactly where it will rest (amber where it cannot). Let go to place it. |
| Read | **Tip the base over**, from any side. The carving is found with its top up whichever side it came up from, and as the underside comes to face you it draws near to be read: the title, whose turn it is and the score, what just happened, and how to play. |
| Play with others | Choose two to four players (or a Vulcan, in rings) in the ways to play. The light behind the kal-toh takes the colour of whoever's turn it is: red for the first player, a rich green for the second, then deep blue and gold. A finished game keeps its winner's colour. Each player's plays are carved in order under their seat: a dot for a true join (or a t'an placed), a ringed dot for a great hoop or a ring, a cross where t'an fell, a circle for a spin test. The rules page shows the marks. |
| Translate | Everything is carved in Vulcan. **Touch anywhere on the carving** but a glyph or a value: all of it is smoothed away to bare stone and cut again in Standard, as deep. Touch again for Vulcan. |
| Test the spin | **Tap the t'an twice**, or touch the spiral carved under the base. The kal-toh spins on its hidden axis: in the original game an unbalanced one wobbles; in rings, strained t'an glow amber. |
| Ways to play | Touch the circle carved under the base. The first way is the game itself. Touch a value to change it; some say beneath what they mean. Where there are more ways than fit, a large **arrow carved at the rim** turns the page, and one on the other side turns back. A change to the game waits for a new one: the carving says so and *begin anew* glows. Touch it to play that way. The lens with rays there opens the hologram's tuning. |
| Begin anew | **Shake the phone for three seconds**, or touch *begin anew* under the base. |
| Draw nearer | Pinch. |
| Hologram | Touch the lens carved under the base: beneath it is carved *Hologram on* or *Hologram off*. It is also the first row of the hologram's tuning, and a row of the ways to play. See below. |

### The kal-toh (the original game)

- **The hidden form.** The jumble is the kal-toh scrambled. Its true skeleton is a tree of 29
  t'an from the outer icosidodecahedron, with every joint twisted about its own t'an, so the
  joints keep their true angles: two t'an meeting at **60°** frame a triangle of the finished
  sphere, at **108°** a pentagon. The other 90 t'an (the inner shell and the struts between the
  shells) are tangled through it. Only junctions of the hidden order answer your touch.
- **A move** joins the tips of two t'an with a new one. Because the skeleton is a tree, every
  join closes a loop, and the pieces shift until the tips meet.
  - *Harmony*: the tips are true neighbours in the sphere. The loop pulls into its true shape, a
    blue wave runs through the structure, and the tangled t'an nearby glide into the inner shell.
    Closing one of the six great hoops of ten sends a brighter wave round it.
  - *Discord*: they are not. The new t'an falls away in amber, shaking loose the newest bond at
    those tips, and the structure slips back toward chaos.
- **The hidden spin.** The structure spins about a hidden axis, different every game. Every t'an
  is mass on that spin. A join that would unbalance it past what it can bear is *flung* away even
  if it is true. Test the spin to find the axis: a balanced kal-toh spins true, an unbalanced one
  wobbles, its axis circling toward the heavy side. Build evenly around it.
- **The end.** The sphere is complete when all 60 outer t'an are in place. The inner shell
  settles, a thread of light shows the axis, and the kal-toh glows. Alone, you are told how many
  moves it took and how many t'an fell. With others (one to four, taking turns), whoever places
  the final t'an wins: plan so that your rival is left with only discord or imbalance.
- Everything rests on the stone as the rings game does: the kal-toh keeps its place on the base,
  turns with it, is never cut into by it, and its fallen t'an lie where they fall until a new game.

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
- **Testing the spin** shows the axis, at the cost of a turn (or free, or forbidden: see the ways
  to play). A Vulcan opponent may test too.
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
or shown, a light, medium or dense nest, the cost of testing, *foresight* (see the ring a held
t'an would make, once the axis is known, always, or never), strain cues, *chains* (a ring earns
another turn, as boxes do in dots and boxes), the supply of t'an, lives, sound, vibration, and
whether the carving reads in Vulcan or Standard until touched.

### Strategy

In the original game, read the angles: a 60° joint is a triangle waiting to be closed, a 108°
joint a pentagon. Test the spin early and often, and build on the light side of the axis.

In rings, the axis is the secret. Until a ring forms or someone tests the spin, every loop you close is a
guess. Testing tells everyone, and it costs your turn. Once the axis is known, rings are a race,
and the game becomes one of tempo, as in dots and boxes. A loop left one t'an short of closing
is a ring for your opponent, so build toward rings only where you can finish them. Building far
out from the centre mass, or hanging long chains, risks a collapse that costs you points or a
life. In *collapse* the spin keeps rising, so every move must leave the structure stronger than
it found it.

### Hologram view

Turn on the hologram (the lens under the base, carved *Hologram off* until it is on) and allow the
camera. The screen becomes a pane of glass with the kal-toh standing a few centimetres behind it.
Move your head, or the phone, and you look around it. Lean in and the view through the glass
widens; draw back and it narrows, as through a real window. Nothing from the camera is shown or
stored, and the camera is released whenever the game is out of sight. The illusion is strongest
with one eye closed. While it starts, and while it looks for your face, the carving says so.

How it works, after the usual practice for head-coupled ("fish tank") perspective:

- **Only the front camera.** The view depends only on where your eye is relative to the screen,
  so the gyroscope plays no part.
- **Following your head.** On the phone the Android shell follows your head itself, with
  Google's ML Kit face detector (its model bundled in the app, so it works offline and without
  Google Play services). It reads every camera frame it can keep up with and finds your face,
  both eyes and how far your head is turned. If ML Kit cannot run, the camera's own face
  detection, or failing that Android's older face detector, finds the face more roughly.
- **Distance.** Most people's eyes are about 63 mm apart. Their spacing in the picture, corrected
  for how far your head is turned and taken with the camera's focal length, gives the distance.
- **Your eye in millimetres.** The direction of the point between your eyes from the camera, plus
  where the camera sits beside the screen, places your eye relative to the middle of the screen.
  Android supplies the screen's true size, the camera's field of view, and the camera's position
  from the screen cutout.
- **The window.** The kal-toh is drawn with an off-axis projection through the screen at its true
  size (Kooima's generalised perspective projection).
- **Steady and quick.** A one-euro filter steadies each axis without lagging fast moves. The eye is
  carried ahead along its motion by the camera's measured delay, so the view does not trail your
  head.
- **Or your eyes.** You can choose to have the page follow your eyes instead (*It follows your:
  eyes* in the tuning). MediaPipe's face landmarker then finds both irises to a fraction of a pixel
  in a worker thread, on the GPU or the CPU, and their size gives the distance (an iris is 11.7 mm
  across in nearly everyone). In a desktop browser this is the only way.

**Tuning.** Under the base: ways to play, then the lens with rays. Three carved pages, turned by
the arrows at the rim: *what you see*, *how it follows you* and *your phone*. Touch the left of a
value to step it down, the right to step it up. Values are always shown in numerals, so a photo
of a page records a setting. The top lines say what the hologram is doing now (for instance
*Following your head: 38 cm away, 2 cm left, 1 cm up · 30 a second · 60 ms behind*), then the
screen and camera as measured and what finds your face.

| Page | Value | What it does |
|---|---|---|
| What you see | Hologram | On or off. |
| | How deep it stands behind the screen | From the glass to the kal-toh's centre, in cm. |
| | How big it looks | Its scale. |
| | How far it turns as your head moves | 100% is true to life, as through a window. Less is calmer; more exaggerates. |
| | How much it nears as you lean in | The same, for moving toward or away from the screen. |
| How it follows you | Straight on is | Where you first held the phone (the default), or square to the screen. |
| | Calm when you hold still | The one-euro filter's cutoff when still (Hz). Lower is calmer but slower to start. |
| | Keeping up when you move fast | How much that cutoff rises with speed. Higher follows fast moves more closely. |
| | Running ahead of the camera's delay | How far ahead the eye is carried (ms). *Auto* uses the measured delay. |
| | Seen from | Between your eyes, or one eye (for viewing with the other closed). |
| Your phone | It follows your | Head (the phone's face finder, the default) or eyes (the page's own, finer where the phone can run it). |
| | The front camera's view, long side | Its field of view. *Auto* asks the phone. |
| | The front camera, above the screen's middle | Where the camera sits (mm). *Auto* uses the screen's cutout. |
| | Your eyes, apart | Following your head: how far apart your eyes are, if you know it (mm). 63 fits most people. |
| | Your iris, across | Following your eyes: your iris's true width, if you know it (mm). 11.7 fits nearly everyone. |
| | The eye finder runs on | Following your eyes: the GPU (quicker) or the CPU (surer). |

The recentre glyph sets where you hold the phone now as the centre; the defaults glyph restores
every value. If the page cannot use the camera to follow your eyes, the shell follows your head
instead.

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
    - `ai.js`, `ai-worker.js`: the Vulcan. It tries moves on copies of the game, looks a reply
      ahead, and builds arcs round the axis. It knows the axis only once it has been revealed.
  - The view: `classic.js` (the original game on the stone: the jumble's skeleton kept rigid by a
    small position-based solver as each junction finds its order, the inner shell settling into
    place, joining, the spin test and the end), `scene.js` (renderer, lights, mess-hall
    reflections, the stone, and the window the screen becomes), `motion.js` (base and assembly dynamics, and every t'an kept clear of
    the stone along its length), `rodmesh.js` (polished steel t'an: mirror faces, drawn gently
    crowned so each reflects a broad sweep of the mess hall behind the player, scored by
    procedural scratches in a normal map and a roughness map; t'an meeting at a corner are drawn
    just short of it, so they touch rather than pass through each other), `falling.js` (fallen t'an: tumbling, coming to rest on the
    stone or the floor, and staying until a new game), `tray.js`, `input.js`, `engrave.js`
    (everything written, carved into the stone's underside on a layer whose depth the shader can
    smooth away and recut, the ways to play and the hologram's tuning), `texts.js` (the words,
    in Vulcan and Standard), `settings.js`, `audio.js` (synthesized sound), `head.js` (the eye
    in millimetres: from irises to position, filtering and looking ahead), `tracker.js` and
    `eyes-worker.js` (the camera and the face landmarker), `shake.js`, `main.js`.
  - `vendor/mediapipe/`: [MediaPipe](https://ai.google.dev/edge/mediapipe) Tasks Vision 0.10.21
    and its face landmarker model (Apache 2.0).
- **`android/`**: a small Java shell (`MainActivity.java`, `HeadTracker.java`). It runs a full
  screen WebView that serves the game from the APK, and handles accelerometer shake detection and
  haptics. For the hologram it follows the player's head with the front camera and ML Kit
  (`HeadTracker.java`), reports the screen's true size and the camera's field of view and place,
  and grants the page the camera if the player chooses to have their eyes followed instead.
- **`tools/`**
  - `physics.test.mjs`: geometry, load paths, and growing nests.
  - `rules.test.mjs`: placement, rings, forms, modes, the Vulcan, and physical invariants
    checked after every move of many random games. Every t'an keeps its length, nothing passes
    through anything, nothing floats, and every bond bears its load.
  - `classic.test.mjs`: the original game's lattice, jumbles (every t'an whole, every joint true),
    harmony, discord, and complete spheres, balanced and won by whoever places the last t'an.
  - `browser-check.cjs`: plays the real game in headless Chromium with simulated touch. First the
    original game: the jumble grows, a two-finger lift joins true neighbours, a false bond falls,
    two taps test the spin, and no t'an passes into the stone. Then it changes the game in the
    carved ways to play, turning their pages by the arrows at the rim, and plays rings. It covers
    placing, the Vulcan's reply, the spin test, a ring, and turning the base: the t'an lag, catch
    up, then hold perfectly still. It turns the t'an by their area and checks no t'an ever passes
    into the stone. It turns the base over to read it (top up whichever way it was turned) and
    touches the carving to translate it. It covers the carved ways to play and the hologram's
    tuning, fallen t'an staying until a new game, and shaking to begin anew. It checks that t'an
    meeting at a junction touch rather than pass through each other, that the light behind turns
    green on the second player's turn and that each player's plays are kept for the carving. With
    a stand-in for the Android shell reporting a swaying face, it checks the view follows the
    head as on the phone. Given a Y4M video of a face as a second argument, Chromium fakes the
    front camera with it, and the page's own eye finder is checked too.
  - `convert_base.py`, `make_icon.py`: asset and icon generators.

```sh
node kaltoh/tools/physics.test.mjs
node kaltoh/tools/rules.test.mjs
node kaltoh/tools/classic.test.mjs
node kaltoh/tools/browser-check.cjs out/   # needs Playwright with Chromium
node kaltoh/tools/browser-check.cjs out/ face.y4m   # and the hologram, with a video of a face
```

### Build it yourself

```sh
# needs JDK 17+ and the Android SDK (ANDROID_HOME); the first build downloads ML Kit
cd kaltoh/android
./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

To try the game in a desktop browser, serve `android/app/src/main/assets/www/` with any static
web server and open `index.html`. Drag with the mouse to turn the base, or the t'an by their
area; press `R` to begin anew, `T` to test the spin, and use the mouse wheel to draw nearer.

## Credits and notes

- Kal-toh and *Star Trek* belong to Paramount; this is an unofficial fan project for personal use.
- The Vulcan fonts (*Vulcan Script* for titles, *Modern Vulcan* for everything else), the stone
  basin model (made with Meshy) and the mess-hall panorama were supplied for this project. Their
  licences are not included; check them before distributing the app beyond personal use.
- three.js is MIT licensed (`android/app/src/main/assets/www/vendor/three.LICENSE`).
- MediaPipe and its face landmarker model are Apache 2.0 licensed
  (`android/app/src/main/assets/www/vendor/mediapipe/LICENSE`).
- ML Kit's face detection (`com.google.mlkit:face-detection`) is Google's, used under the
  [ML Kit terms](https://developers.google.com/ml-kit/terms). It runs on the phone and needs no
  network, but like all of ML Kit it may report anonymous usage statistics to Google (never
  pictures).
- The head-coupled view follows Robert Kooima's *Generalized Perspective Projection* (2008),
  distance from the eyes' spacing (or, following the eyes, the MediaPipe Iris method of
  estimating it from the iris), and Casiez, Roussel and Vogel's *1€ filter* (CHI 2012).
