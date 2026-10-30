#!/usr/bin/env python3
"""The piano's notes in the music (assets/theme.mp3), for the phone to feel as it plays them.

Each note is found where it is struck: the spectrum's rise (spectral flux, on a log scale, over the
piano's range) peaking above its surroundings. A chord is one note; notes closer than MIN_GAP are
one. Each is kept with how hard it was played, from 0 to 1: the rise's strength against the loudest
notes of the piece, and how loud the music is there.

Writes assets/theme-notes.json: {"notes": [[ms, force], ...]}, read by MainActivity.java.

Run: python3 kaltoh/tools/make_theme_notes.py
"""
import json
import pathlib
import subprocess
import sys

import numpy as np

WWW = pathlib.Path(__file__).resolve().parent.parent / 'android/app/src/main/assets/www/assets'
RATE = 22050
FRAME = 2048
HOP = 256  # 11.6 ms
MIN_GAP = 0.1  # seconds between notes felt apart
LOW, HIGH = 60.0, 5000.0  # the piano's range that sounds a note


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onsets(signal):
    window = np.hanning(FRAME).astype(np.float32)
    count = 1 + (len(signal) - FRAME) // HOP
    frames = np.lib.stride_tricks.as_strided(signal, shape=(count, FRAME), strides=(signal.strides[0] * HOP, signal.strides[0]))
    spectrum = np.abs(np.fft.rfft(frames * window, axis=1))
    freqs = np.fft.rfftfreq(FRAME, 1 / RATE)
    band = (freqs >= LOW) & (freqs <= HIGH)
    level = np.log1p(100 * spectrum[:, band])
    flux = np.maximum(0, np.diff(level, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    loud = np.sqrt((frames ** 2).mean(axis=1))
    # A little above its surroundings (the mean of the half second about it) and a floor of the
    # piece's own: the notes struck, not the swells of those held.
    span = int(0.25 * RATE / HOP)
    kernel = np.ones(2 * span + 1) / (2 * span + 1)
    local = np.convolve(flux, kernel, mode='same')
    floor = np.percentile(flux, 60)
    near = int(MIN_GAP * RATE / HOP)
    found = []
    for t in range(1, len(flux) - 1):
        f = flux[t]
        if f < local[t] * 1.1 + floor * 0.2 or f < flux[max(0, t - near):t + near + 1].max():
            continue
        if found and t - found[-1] < near:
            continue
        found.append(t)
    top = np.percentile(flux[found], 95) if found else 1
    loudest = np.percentile(loud, 99)
    notes = []
    for t in found:
        force = 0.7 * min(1.0, flux[t] / top) + 0.3 * min(1.0, loud[min(len(loud) - 1, t + 2)] / loudest)
        # Where the frame's centre is struck, the note sounds.
        ms = int(round((t * HOP + FRAME / 2) / RATE * 1000))
        notes.append([ms, round(float(force), 2)])
    return notes


def main():
    source = WWW / 'theme.mp3'
    notes = onsets(decode(source))
    out = WWW / 'theme-notes.json'
    out.write_text(json.dumps({'notes': notes}, separators=(',', ':')) + '\n')
    seconds = notes[-1][0] / 1000 if notes else 0
    print(f'{len(notes)} notes over {seconds:.1f} s ({len(notes) / max(seconds, 1):.1f} a second) -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
