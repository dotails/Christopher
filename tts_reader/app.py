"""TTS Reader - a phone-friendly read-aloud app backed by the Kokoro voice model.

Runs a small web server on your computer. Open the printed address on your
phone (same Wi-Fi) to paste text and have it read aloud with natural voices.
Everything runs locally: no API keys, no accounts, no internet after the
one-time model download.

    python app.py              # full-quality model (~325 MB download)
    python app.py --small      # quantized model (~90 MB, slightly lower quality)
    python app.py --port 8080
"""

import argparse
import io
import logging
import os
import socket
import sys
import threading
import urllib.request
import wave
from collections import OrderedDict

import numpy as np
from flask import Flask, jsonify, request, send_from_directory

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "models")
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
VOICES_FILE = "voices-v1.0.bin"
MODEL_FILES = {False: "kokoro-v1.0.onnx", True: "kokoro-v1.0.int8.onnx"}

# Voice-name prefix -> (espeak language code, human-readable accent).
# Japanese and Mandarin voices are left out: they need extra tokenizers.
LANGS = {
    "a": ("en-us", "US"),
    "b": ("en-gb", "UK"),
    "e": ("es", "Spanish"),
    "f": ("fr-fr", "French"),
    "h": ("hi", "Hindi"),
    "i": ("it", "Italian"),
    "p": ("pt-br", "Portuguese"),
}
# The best-rated voices go to the top of the list.
FAVORITES = ["af_heart", "af_bella", "am_michael", "am_fenrir", "bf_emma", "bm_george", "af_nicole", "am_puck"]

MAX_CHARS = 2000
CACHE_SIZE = 64


def download(name):
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, name)
    if os.path.exists(path):
        return path
    tmp = path + ".part"
    print(f"Downloading {name} (one-time)...")

    def progress(blocks, block_size, total):
        if total > 0:
            done = min(blocks * block_size, total)
            sys.stdout.write(f"\r  {done / 1e6:6.1f} / {total / 1e6:.1f} MB")
            sys.stdout.flush()

    urllib.request.urlretrieve(RELEASE + name, tmp, progress)
    os.replace(tmp, path)
    print()
    return path


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; this just picks the LAN interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def to_wav(samples, sample_rate):
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def voice_label(voice):
    prefix, name = voice.split("_", 1)
    accent = LANGS[prefix[0]][1]
    gender = "female" if prefix[1] == "f" else "male"
    return f"{name.capitalize()} ({accent} {gender})"


def create_app(kokoro):
    app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="")
    lock = threading.Lock()
    cache = OrderedDict()
    latest_epoch = {}  # client id -> newest playback position epoch it has sent

    voices = [v for v in kokoro.get_voices() if v[0] in LANGS and v.count("_") == 1]
    voices.sort(key=lambda v: (FAVORITES.index(v) if v in FAVORITES else len(FAVORITES), v))

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/api/voices")
    def list_voices():
        return jsonify([{"id": v, "name": voice_label(v)} for v in voices])

    @app.post("/api/tts")
    def tts():
        data = request.get_json(silent=True) or {}
        text = str(data.get("text", "")).strip()[:MAX_CHARS]
        voice = data.get("voice") if data.get("voice") in voices else voices[0]
        try:
            speed = min(2.0, max(0.5, float(data.get("speed", 1.0))))
        except (TypeError, ValueError):
            speed = 1.0
        if not text:
            return jsonify(error="no text"), 400

        # The page bumps its epoch whenever you jump around. Requests from before the
        # jump are no longer needed, so skip them instead of making the new one wait.
        client = str(data.get("client", ""))[:64]
        try:
            epoch = int(data.get("epoch", 0))
        except (TypeError, ValueError):
            epoch = 0
        if epoch > latest_epoch.get(client, -1):
            if len(latest_epoch) > 1000:
                latest_epoch.clear()
            latest_epoch[client] = epoch

        key = (text, voice, round(speed, 2))
        with lock:
            wav = cache.get(key)
            if wav is None:
                if epoch < latest_epoch.get(client, epoch):
                    return jsonify(error="superseded"), 409
                samples, sr = kokoro.create(text, voice=voice, speed=speed, lang=LANGS[voice[0]][0])
                wav = to_wav(samples, sr)
                cache[key] = wav
                if len(cache) > CACHE_SIZE:
                    cache.popitem(last=False)
            else:
                cache.move_to_end(key)
        return app.response_class(wav, mimetype="audio/wav", headers={"Cache-Control": "no-store"})

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--host", default="0.0.0.0", help="use 127.0.0.1 to allow only this computer")
    parser.add_argument("--small", action="store_true", help="use the smaller quantized model")
    args = parser.parse_args()

    from kokoro_onnx import Kokoro

    model = download(MODEL_FILES[args.small])
    voices = download(VOICES_FILE)
    print("Loading voice model...")
    kokoro = Kokoro(model, voices)
    app = create_app(kokoro)

    print("\n  TTS Reader is running.")
    print(f"  On this computer:  http://127.0.0.1:{args.port}")
    if args.host == "0.0.0.0":
        print(f"  On your phone:     http://{lan_ip()}:{args.port}   (same Wi-Fi)")
    print("  Press Ctrl+C to stop.\n")
    logging.getLogger("werkzeug").setLevel(logging.ERROR)  # hide per-request logs and the dev-server banner
    app.run(host=args.host, port=args.port, threaded=True)


if __name__ == "__main__":
    main()
