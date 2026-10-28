// The front camera, watched for the player's eyes (eyes-worker.js). Nothing is shown or kept:
// each frame goes to the worker as soon as it is captured, one at a time - a frame that arrives
// while the last is still being read is skipped, so what is found is always as fresh as it can be.
const READY_WITHIN = 30000; // ms for the face model to load before giving up

export class Tracker {
  // onEyes({ eyes, width, height, capture }); onStatus(status): starting | on | denied | unavailable.
  constructor({ onEyes, onStatus }) {
    this.onEyes = onEyes;
    this.onStatus = onStatus;
    this.running = false;
    this.session = 0;
  }

  get supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia) && typeof Worker !== 'undefined' && typeof createImageBitmap === 'function';
  }

  async start(engine) {
    if (this.running) return;
    this.running = true;
    const session = ++this.session;
    this.onStatus('starting');
    if (!this.supported) {
      this.fail('unavailable');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
    } catch (err) {
      if (session === this.session) this.fail(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable');
      return;
    }
    if (session !== this.session) {
      this.release();
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    this.video = video;
    try {
      await video.play();
    } catch {
      // Some browsers start the stream without play() resolving; frames still come.
    }

    // The GPU is quicker where its WebGL can be had in a worker; if not, the CPU.
    let outcome = await this.launch(engine);
    if (outcome !== 'ready' && engine !== 'cpu' && session === this.session) {
      console.warn(`face tracker (${engine}):`, outcome);
      outcome = await this.launch('cpu');
    }
    if (session !== this.session) return;
    if (outcome !== 'ready') {
      console.warn('face tracker:', outcome);
      this.fail('unavailable');
      return;
    }
    this.busy = false;
    this.frames = 0;
    this.worker.onmessage = ({ data }) => {
      if (data.type !== 'eyes') return;
      this.busy = false;
      this.frames += 1;
      if (data.error && data.error !== this.error) console.warn('face tracker:', data.error);
      this.error = data.error ?? null;
      if (session === this.session) this.onEyes(data);
    };
    this.onStatus('on');
    this.pump(session);
  }

  // Start the face model on an engine: 'ready', or why not.
  launch(engine) {
    this.worker?.terminate();
    this.engine = engine;
    this.worker = new Worker(new URL('./eyes-worker.js', import.meta.url), { type: 'module' });
    const ready = new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), READY_WITHIN);
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'ready' || data.type === 'failed') {
          clearTimeout(timer);
          resolve(data.type === 'ready' ? 'ready' : data.reason);
        }
      };
      this.worker.onerror = (e) => {
        clearTimeout(timer);
        resolve(e.message || 'worker error');
      };
    });
    this.worker.postMessage({ type: 'start', engine });
    return ready;
  }

  // Hand each new camera frame to the worker, stamped with when it was captured.
  pump(session) {
    const video = this.video;
    const send = (capture, time) => {
      if (session !== this.session || this.busy || video.readyState < 2) return;
      this.busy = true;
      createImageBitmap(video).then((frame) => {
        if (session !== this.session) {
          frame.close();
          return;
        }
        this.worker.postMessage({ type: 'frame', frame, time, capture }, [frame]);
      }, () => {
        this.busy = false;
      });
    };
    if (video.requestVideoFrameCallback) {
      const next = (now, meta) => {
        if (session !== this.session) return;
        send(meta.captureTime ?? meta.expectedDisplayTime ?? now, now);
        video.requestVideoFrameCallback(next);
      };
      video.requestVideoFrameCallback(next);
    } else {
      let last = -1;
      const poll = () => {
        if (session !== this.session) return;
        if (video.currentTime !== last) {
          last = video.currentTime;
          const now = performance.now();
          send(now, now);
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }
  }

  fail(status) {
    this.stop();
    this.onStatus(status);
  }

  release() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  // Let the camera go (always, when the game is out of sight).
  stop() {
    this.session += 1;
    this.running = false;
    this.release();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
