# Kal-toh

> "Kal-toh is to chess as chess is to tic-tac-toe."

A playable take on the Vulcan game of *Star Trek: Voyager*, as an Android app. A splintering
nest of steel *t'an* hangs over a stone basin, gathered about a centre mass and held by a field
that spins on a hidden axis. Players take turns placing one t'an at a time. Close a loop around
that hidden axis and it becomes a ring. Overload the structure and pieces fall. Ring by ring,
order comes out of the chaos, and when the form is complete the chaos falls away.

Nothing is written on the screen. The title, the instructions and every control are carved into
the underside of the stone: tip the base over to read them, from whichever side you like.

<p align="center">
  <img src="docs/nest.png" width="19%" alt="The starting nest">
  <img src="docs/ring.png" width="19%" alt="A ring forming">
  <img src="docs/complete.png" width="19%" alt="A completed globe">
  <img src="docs/underside.png" width="19%" alt="The carved underside of the base">
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
| Place a t'an | Put **two fingers** on the t'an lying at the foot of the screen to lift it. Move each finger onto a piece of the kal-toh. The two pieces glow blue, and the held t'an shows exactly where it will rest. Let go to place it. |
| Read | **Tip the base over**, from any side. The carving is found with its top up whichever side it came up from, and as the underside comes to face you it draws near to be read: the title, whose turn it is and the score, what just happened, and how to play. |
| Translate | Everything is carved in Vulcan. **Touch anywhere on the carving** but a glyph or a value: all of it is smoothed away to bare stone and cut again in Standard, as deep. Touch again for Vulcan. |
| Test the spin | **Tap the t'an twice**, or touch the spiral carved under the base. The kal-toh spins on its hidden axis, and strained t'an glow amber. |
| Ways to play | Touch the circle carved under the base. Touch a way's value to change it, then *begin anew* to play that way. The lens with rays there opens the hologram's tuning. |
| Begin anew | **Shake the phone for three seconds**, or touch *begin anew* under the base. |
| Draw nearer | Pinch. |
| Hologram | Touch the lens carved under the base (or turn it on in the ways to play). See below. |

### The rules

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

### Ways of play

- **Harmony** (default): a ring scores one point per t'an in it. Each t'an your move drops
  costs one. Completing the form scores ten. The game ends when the form is complete or the
  t'an run out.
- **Collapse**: drop two or more t'an in one move and lose a life. The spin quickens every round.
  The last player standing wins.
- **Meditation**: alone, with no limit. Complete the form in as few moves as you can.

Opponent: a Vulcan *novice*, *adept* (default) or *master*, or nobody (pass and play, one to
four players). Other settings: the spin's strength (unknown by default), a drift, the axis hidden
or shown, a light, medium or dense nest, the cost of testing, *foresight* (see the ring a held
t'an would make, once the axis is known, always, or never), strain cues, *chains* (a ring earns
another turn, as boxes do in dots and boxes), the supply of t'an, lives, sound, vibration, and
whether the carving reads in Vulcan or Standard until touched.

### Strategy

The axis is the secret. Until a ring forms or someone tests the spin, every loop you close is a
guess. Testing tells everyone, and it costs your turn. Once the axis is known, rings are a race,
and the game becomes one of tempo, as in dots and boxes. A loop left one t'an short of closing
is a ring for your opponent, so build toward rings only where you can finish them. Building far
out from the centre mass, or hanging long chains, risks a collapse that costs you points or a
life. In *collapse* the spin keeps rising, so every move must leave the structure stronger than
it found it.

### Hologram view

Turn on the hologram (the lens under the base) and allow the camera. The screen becomes a pane of
glass with the kal-toh standing a few centimetres behind it. Move your head, or the phone, and you
look around it. Lean in and the view through the glass widens; draw back and it narrows, as
through a real window. Nothing from the camera is shown or stored, and the camera is released
whenever the game is out of sight. The illusion is strongest with one eye closed.

How it works, after the usual practice for head-coupled ("fish tank") perspective:

- **Only the front camera.** The view depends only on where your eye is relative to the screen,
  so the gyroscope plays no part.
- **Finding the eye.** MediaPipe's face landmarker finds both irises to a fraction of a pixel. It
  runs in a worker thread, on the GPU, or on the CPU if the GPU cannot be had.
- **Distance.** The iris is about 11.7 mm across in nearly everyone, so its size in the picture,
  with the camera's focal length, gives the distance.
- **Your eye in millimetres.** Its direction from the camera, plus where the camera sits beside the
  screen, places your eye relative to the middle of the screen. Android supplies the screen's
  true size, the camera's field of view, and the camera's position from the screen cutout.
- **The window.** The kal-toh is drawn with an off-axis projection through the screen at its true
  size (Kooima's generalised perspective projection).
- **Steady and quick.** A one-euro filter steadies each axis without lagging fast moves. The eye is
  carried ahead along its motion by the camera's measured delay, so the view does not trail your
  head.

**Tuning.** Every part of this can be tuned on its own carved page, under the base: ways to play,
then the lens with rays. Values are always shown in numerals, so a photo of the page records a
setting. The top lines show what the camera sees now: the eye's position in millimetres, frames
per second and delay, the engine in use, and the screen and camera as measured.

| Value | What it does |
|---|---|
| Depth behind the glass | How far behind the screen the kal-toh's centre stands (mm). |
| Size | Scale of the kal-toh. |
| Straight ahead is | Where you first held the phone (the default), or the true middle of the screen. |
| Head motion | Gain on how far your head moves across (1 is true). |
| Leaning in and out | Gain on how far your head moves toward or away from the screen (1 is true). |
| Steadiness | The one-euro filter's cutoff when still (Hz). Lower is steadier but slower. |
| Quickness | How much the cutoff rises with speed. Higher follows fast moves more closely. |
| Looking ahead | How far ahead the eye is carried. *Auto* uses the measured delay. |
| Camera view | The front camera's field of view along its long side. *Auto* asks the phone. |
| Camera above screen centre | Where the camera sits (mm). *Auto* uses the screen's cutout. |
| Iris width | Your iris's true width, if you know it (mm). |
| Seen from | Between the eyes, or one eye (for viewing with the other closed). |
| Face tracker runs on | GPU or CPU. |

The recentre glyph sets where you hold the phone now as the centre; the defaults glyph restores
every value. If the page cannot use the camera at all, the Android shell's own, rougher face
tracker takes over.

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
    - `ai.js`, `ai-worker.js`: the Vulcan. It tries moves on copies of the game, looks a reply
      ahead, and builds arcs round the axis. It knows the axis only once it has been revealed.
  - The view: `scene.js` (renderer, lights, mess-hall reflections, the stone, and the window
    the screen becomes), `motion.js` (base and assembly dynamics, and every t'an kept clear of
    the stone along its length), `rodmesh.js` (brushed stainless t'an with a procedural
    lengthwise scratch normal map), `falling.js` (fallen t'an: tumbling, coming to rest on the
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
  haptics. For the hologram it grants the page the camera and reports the screen's true size and
  the camera's field of view and place. `HeadTracker.java` is the fallback face tracker.
- **`tools/`**
  - `physics.test.mjs`: geometry, load paths, and growing nests.
  - `rules.test.mjs`: placement, rings, forms, modes, the Vulcan, and physical invariants
    checked after every move of many random games. Every t'an keeps its length, nothing passes
    through anything, nothing floats, and every bond bears its load.
  - `browser-check.cjs`: plays the real game in headless Chromium with simulated touch. It covers
    placing, the Vulcan's reply, the spin test, a ring, and turning the base: the t'an lag, catch
    up, then hold perfectly still. It turns the t'an by their area and checks no t'an ever passes
    into the stone. It turns the base over to read it (top up whichever way it was turned) and
    touches the carving to translate it. It covers the carved ways to play and the hologram's
    tuning, fallen t'an staying until a new game, and shaking to begin anew. Given a Y4M video of
    a face as a second argument, Chromium fakes the front camera with it, and the hologram is
    checked too: the eye is found and the view follows it.
  - `convert_base.py`, `make_icon.py`: asset and icon generators.

```sh
node kaltoh/tools/physics.test.mjs
node kaltoh/tools/rules.test.mjs
node kaltoh/tools/browser-check.cjs out/   # needs Playwright with Chromium
node kaltoh/tools/browser-check.cjs out/ face.y4m   # and the hologram, with a video of a face
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
area; press `R` to begin anew, `T` to test the spin, and use the mouse wheel to draw nearer.

## Credits and notes

- Kal-toh and *Star Trek* belong to Paramount; this is an unofficial fan project for personal use.
- The Vulcan fonts (*Vulcan Script* for titles, *Modern Vulcan* for everything else), the stone
  basin model (made with Meshy) and the mess-hall panorama were supplied for this project. Their
  licences are not included; check them before distributing the app beyond personal use.
- three.js is MIT licensed (`android/app/src/main/assets/www/vendor/three.LICENSE`).
- MediaPipe and its face landmarker model are Apache 2.0 licensed
  (`android/app/src/main/assets/www/vendor/mediapipe/LICENSE`).
- The head-coupled view follows Robert Kooima's *Generalized Perspective Projection* (2008), the
  MediaPipe Iris method of estimating distance from the iris, and Casiez, Roussel and Vogel's
  *1€ filter* (CHI 2012).
