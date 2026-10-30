"""Render the guide's spoken lines with Kokoro (the Sky voice), ahead of time, into the app.

Usage: python3 -I make_voice.py <kokoro-v1.0.onnx> <voices-v1.0.bin> [out_dir]
(KOKORO_THREADS=n limits the model to n threads, to leave the rest of the machine be.)

Reads voice-lines.json beside this script ({ key: text }; words are spelt as they are to be said:
t'an as tan, kal-toh's shapes in parts, cubo-octahedron) and writes <out_dir>/<key>.mp3 (mono,
24 kHz, brought to -14 LUFS so the voice is clear over the music) for each line, and
<out_dir>/voice.json ({ key: { text, seconds, level } }). Lines whose text and level are unchanged
since the last run are kept as they are. The model files come from the kokoro-onnx
releases (github.com/thewh1teagle/kokoro-onnx, model-files-v1.0); nothing is spoken on the phone
but these files.
"""
import json
import os
import subprocess
import sys
import tempfile

import onnxruntime as rt
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, '..', 'android', 'app', 'src', 'main', 'assets', 'www', 'assets', 'voice')
VOICE = 'af_sky'
LEVEL = -14  # LUFS


def main(model, voices, out_dir=DEFAULT_OUT):
    with open(os.path.join(HERE, 'voice-lines.json')) as f:
        lines = json.load(f)
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, 'voice.json')
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {}
    kokoro = None
    for key, text in lines.items():
        mp3 = os.path.join(out_dir, f'{key}.mp3')
        if manifest.get(key, {}).get('text') == text and manifest[key].get('level') == LEVEL and os.path.exists(mp3):
            continue
        if kokoro is None:
            options = rt.SessionOptions()
            threads = int(os.environ.get('KOKORO_THREADS', '0'))
            options.intra_op_num_threads = threads
            options.inter_op_num_threads = 1 if threads else 0
            kokoro = Kokoro.from_session(rt.InferenceSession(model, options, providers=['CPUExecutionProvider']), voices)
        samples, rate = kokoro.create(text, voice=VOICE, speed=1.0, lang='en-us')
        with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
            sf.write(wav.name, samples, rate)
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav.name,
                            '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ac', '1', '-ar', '24000', '-b:a', '48k', mp3],
                           check=True)
        manifest[key] = {'text': text, 'seconds': round(len(samples) / rate, 2), 'level': LEVEL}
        print(f'{key}: {manifest[key]["seconds"]} s')
    manifest = {k: manifest[k] for k in lines}
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=1)
    for name in os.listdir(out_dir):
        if name.endswith('.mp3') and name[:-4] not in lines:
            os.remove(os.path.join(out_dir, name))


if __name__ == '__main__':
    main(*sys.argv[1:4])
