#!/bin/sh
# Masters the mess hall's ambience for the game (assets/music.mp3): the voices murmuring under it
# brought up, the warp core's hum kept beneath them. Nearly all of the recording's energy is the
# hum's deep rumble, below 120 Hz, more than a phone's speaker can play; the voices, between
# about 500 Hz and 3 kHz, lie some 37 dB under it. So the two are levelled apart: below 250 Hz
# the hum, raised a little and limited on its own (so its swells never pump the voices); above,
# the voices and the air, raised 21 dB, the voices' band 8 dB more and the hiss above 4 kHz 6 dB
# less; together, -9.6 LUFS, peaks under -1 dBFS.
#
# Usage: master_music.sh <the ambience as supplied> [out.mp3]
#   (as supplied: git show 479472b:kaltoh/android/app/src/main/assets/www/assets/music.mp3)
set -eu
out="${2:-$(dirname "$0")/../android/app/src/main/assets/www/assets/music.mp3}"
ffmpeg -hide_banner -loglevel error -y -i "$1" -filter_complex "\
[0:a]acrossover=split=250:order=4th[low][high];\
[low]volume=6dB,alimiter=limit=0.5:attack=5:release=200:level=disabled[hum];\
[high]equalizer=f=1400:t=q:w=0.6:g=8,highshelf=f=4000:g=-6,volume=21dB[voices];\
[hum][voices]amix=inputs=2:normalize=0,alimiter=limit=0.891:attack=5:release=100:level=disabled[out]" \
  -map "[out]" -ar 44100 -c:a libmp3lame -b:a 192k "$out"
ffmpeg -hide_banner -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -E '^ +(I|Peak):'
