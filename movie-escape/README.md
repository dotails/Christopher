# Reel Escape 🎬

A 3D party-platformer (Three.js) where you get sucked into an action movie.
Built for Android (Capacitor) and also runs in any modern browser.

## The story

1. **The theater** — you're watching *REEL HERO* on a Friday night. The movie glitches, the
   hero points at *you*, and a vortex pulls you through the screen.
2. **Five movie sets**, each with three tasks on your ancient, half-erased script
   (tap the script to squint at it — or follow the golden arrow at your feet):
   - **The Heist** — film reels, alarm switches under sweeping lasers, the vault key
   - **Rooftop Chase** — ticking bombs, a window-washer lift, deliver the briefcase to the chopper
   - **Jungle Temple** — spinning logs, a turntable, a boulder run, the temple gong
   - **Space Station** — low gravity, floating platforms, the command deck
   - **Villain's Lair** — lava, flame jets, detonators, the control room
3. **The twist** — the EXIT is a prop door, your old script crumbles to dust, and the
   **Reel Monster** rises from the lava holding the fresh copy. Make it charge into the
   arena edge, then stomp the glowing spot on its head while it's dizzy (3 hits).
4. **The Final Cut** — the real script says every scene needs a retake: grab a golden
   clapperboard in every scene, all the way back to the start.
5. **The Great Door** — sealed since Scene 1. It opens… onto a paradise outside the movie.

The Director (your megaphone-wielding narrator) comments on everything. Every fall is a new *take*.

## Controls

| | Touch | Keyboard / mouse | Gamepad |
|---|---|---|---|
| Move | left side of screen (floating stick) | WASD / arrows | left stick |
| Camera | drag on the right side | mouse (click to lock) | right stick |
| Jump | JUMP | Space (hold for higher) | A |
| Dive | DIVE | Shift | B / X |
| Pause | ‖ button | Esc / P | Start |

Progress saves automatically; **Continue** resumes from the start of the current scene.
Settings: music/SFX volume, camera speed, graphics (Low/Med/High), auto-camera, invert, bean colour.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static web build in dist/
```

Everything is generated in code — geometry, textures, music and sound effects — so there are
no art or audio files to manage.

| Path | What |
|---|---|
| `src/game/Game.js` | loop, camera, story flow, cutscenes, saving |
| `src/world/rooms.js` | the five movie sets and their tasks |
| `src/world/boss.js` | the Reel Monster |
| `src/world/theater.js`, `paradise.js` | opening cinema and the ending |
| `src/world/player.js`, `physics.js`, `entities.js` | bean character, collision, obstacles |
| `src/core/audio.js` | procedural music + SFX |
| `src/core/ui.js`, `src/style.css` | HUD, menus, the crumbling script |

## Build the Android APK

Requirements: Node 20+, JDK 21, Android SDK (platform 36, build-tools 36).

```bash
bash scripts/build-apk.sh           # -> dist-apk/ReelEscape-debug.apk (installable)
```

Or let GitHub build it: every push touching `movie-escape/` runs
`.github/workflows/android-apk.yml`; download the APK from the run's **Artifacts**.

### Release / Play Store

Create a keystore once (keep it safe and **never commit it**):

```bash
keytool -genkey -v -keystore reel-escape.jks -alias reel -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (git-ignored):

```
storeFile=/absolute/path/reel-escape.jks
storePassword=...
keyAlias=reel
keyPassword=...
```

and run `bash scripts/build-apk.sh release`. For the Play Store, build an App Bundle with
`cd android && ./gradlew bundleRelease`. Bump `versionCode`/`versionName` in
`android/app/build.gradle` for each release.
