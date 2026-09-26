# TTS Reader

Paste text on your phone and have it read aloud in a natural-sounding voice.
There are two ways to run it: an **Android app** that works entirely on the
phone, or a **Python server** on your computer that any phone browser can use.

It uses **[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)**, a free
open-source voice model (Apache-2.0) that runs locally on your own device. You
don't need an API key or an account, and it works without internet.

> **Why not Claude's voices?** Anthropic's API has no text-to-speech endpoint.
> The voices in the Claude app aren't available to developers, so no API key
> can unlock them.

## Features

- A text box that fills the screen. Paste or type, then press **Play**.
- **Play / Pause**, plus **Previous / Next paragraph**. Previous restarts the
  current paragraph if you're partway in; press it again to go back one more.
- **Tap any sentence** while reading to jump there. To start from a specific
  spot, tap it in the text box before pressing Play.
- A **speed slider** (0.5×–2×) that affects what's playing right away.
- **Voice picker** with 40+ voices: US and UK English (male and female), plus
  Spanish, French, Italian, Portuguese and Hindi.
- Remembers your text, position, voice and speed. Supports lock-screen and
  headphone play/pause/skip controls, and can be added to your home screen so
  it opens like an app.

## Android app (no computer needed)

`android/` builds a standalone APK that runs the voices **on the phone
itself**, offline. It uses [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
to run the models and shows the same screen as the web version. It has
English voices only:

- **US and UK:** 27 voices from the full-precision Kokoro v1.0 model.
- **Australian:** 10 voices from
  [piper-en_AU-librivox-medium](https://huggingface.co/DataCraftsmanAustralia/piper-en_AU-librivox-medium)
  (CC BY 4.0, recorded by LibriVox volunteers). It's a smaller Piper model, so
  it sounds a little less natural than Kokoro. Banjo, Kirra and Tully were
  trained on the most audio, so they should sound the best.

**Install:** on your phone, open this repository's
[Releases page](https://github.com/dotails/christopher/releases/tag/tts-reader-android)
and tap **TTS-Reader.apk**, then open the downloaded file. If Android asks,
allow your browser to install unknown apps. GitHub Actions rebuilds the APK
whenever `tts_reader/` changes.

- It needs a 64-bit phone running Android 8.0 or newer. The download is about
  450 MB, and it uses about 450 MB more once unpacked.
- The first launch takes a little longer while it unpacks the voices. The
  first use of each accent then takes a few seconds to load it.
- You can share text from another app to it with **Share → TTS Reader**.
- The screen stays on while it's reading.

To build it yourself, install Android Studio (or the Android SDK and JDK 17)
and run `./gradlew assembleRelease` in `android/`. The build downloads the
speech engine and the model on its first run.

## Setup (computer + phone browser version)

You need **Python 3.9 or newer** on a Windows, Mac or Linux computer
([python.org](https://www.python.org/downloads/); on Windows, tick
"Add python.exe to PATH" in the installer).

**Windows:** double-click `start_windows.bat`.

**Mac / Linux:** run `./start.sh`.

The first run installs the packages and downloads the voice model (~350 MB),
which takes a few minutes. After that, startup takes a few seconds. When it's
ready it prints something like:

```
  TTS Reader is running.
  On this computer:  http://127.0.0.1:5000
  On your phone:     http://192.168.1.23:5000   (same Wi-Fi)
```

Open the phone address in Safari or Chrome on your phone. To make it feel like
a regular app, use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to
Home screen** (Android).

If your phone can't connect, allow Python through your computer's firewall.
Windows usually asks the first time; choose **Private networks**.

### Options

```
start_windows.bat --small       # 90 MB model instead of 325 MB; slightly lower quality, faster on slow PCs
start_windows.bat --port 8080   # use a different port
start_windows.bat --host 127.0.0.1   # only allow this computer, not your phone
```

(`./start.sh` takes the same options, as does `python app.py` if you install
`requirements.txt` yourself.)

## Notes

- Speech is generated a sentence or two at a time, while the previous part
  plays. Playback starts within a second or two on a typical laptop. A jump to
  a paragraph that isn't ready yet can take a couple of seconds.
- iPhones may stop playback when the screen locks, because Safari pauses web
  pages in the background. The app asks the phone to keep the screen on while
  it reads.
- To use it away from home, install [Tailscale](https://tailscale.com) (free)
  on the computer and the phone, and open the computer's Tailscale address.
