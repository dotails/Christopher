# TTS Reader

Paste text on your phone and have it read aloud in a natural-sounding voice.

It uses **[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)**, a free
open-source voice model (Apache-2.0) that runs locally on your computer. You
don't need an API key or an account, and after the one-time model download it
works without internet. A small Python server on your computer generates the
speech, and your phone opens the app in its browser over Wi-Fi.

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

## Setup

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
