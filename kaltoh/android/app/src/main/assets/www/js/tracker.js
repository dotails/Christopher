// The front camera, watched for the player's eyes (eyes-worker.js). Nothing is shown or kept.
//
// Frames are read straight from the camera's track where the browser allows it
// (MediaStreamTrackProcessor): no video element, so nothing for Android to pause for being out of
// sight. Elsewhere a video element is kept in the page, two pixels behind the game, since a phone
// may stop playing a video that is not on screen. One frame at a time goes to the worker; a frame
// that arrives while the last is still being read is dropped, so what is found is always fresh.
//
// It watches itself: if no frames come, it reads them the other way; if frames come but the GPU
// never finds a face, it tries the CPU. What it is doing is kept in `state`, in plain words, for
// the tuning page.
const READY_WITHIN = 25000; // ms for the face model to load
const FRAMES_WITHIN = 4000; // ms for the first frame to reach the face model
const FACE_WITHIN = 10000; // ms of frames without a face before the GPU is doubted

export class Tracker {
  // onEyes({ eyes, width, height, capture }); onStatus(status): starting | on | denied | unavailable.
  constructor({ onEyes, onStatus }) {
    this.onEyes = onEyes;
    this.onStatus = onStatus;
    this.running = false;
    this.session = 0;
    this.state = 'off';
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
      this.state = 'this browser cannot watch the camera';
      this.fail('unavailable');
      return;
    }
    this.state = 'opening the front camera';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
    } catch (err) {
      if (session !== this.session) return;
      const refused = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      this.state = refused ? 'the camera was refused' : `the camera would not open (${err?.name ?? 'error'})`;
      this.fail(refused ? 'denied' : 'unavailable');
      return;
    }
    if (session !== this.session) {
      this.release();
      return;
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
      this.state = `the face finder would not start (${outcome})`;
      this.fail('unavailable');
      return;
    }
    this.counts = { sent: 0, answered: 0, faces: 0 };
    this.startedAt = performance.now();
    this.source = typeof MediaStreamTrackProcessor === 'function' ? 'track' : 'video';
    this.listen(session);
    this.onStatus('on');
    this.pump(session);
    this.watch(session);
  }

  // Start the face model on an engine: 'ready', or why not.
  launch(engine) {
    this.worker?.terminate();
    this.engine = engine;
    this.state = `loading the face finder (${engine.toUpperCase()})`;
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

  listen(session) {
    this.busy = false;
    this.worker.onmessage = ({ data }) => {
      if (data.type !== 'eyes') return;
      this.busy = false;
      this.counts.answered += 1;
      if (data.eyes) this.counts.faces += 1;
      if (data.error && data.error !== this.error) console.warn('face tracker:', data.error);
      this.error = data.error ?? null;
      if (session === this.session) this.onEyes(data);
    };
  }

  pump(session) {
    this.state = this.source === 'track' ? 'reading the camera' : 'reading the camera (video)';
    if (this.source === 'track') this.pumpTrack(session);
    else this.pumpVideo(session);
  }

  send(session, frame, time, capture) {
    if (session !== this.session || this.busy) {
      frame.close();
      return;
    }
    this.busy = true;
    this.counts.sent += 1;
    this.worker.postMessage({ type: 'frame', frame, time, capture }, [frame]);
  }

  // Frames straight from the camera's track.
  pumpTrack(session) {
    let reader;
    try {
      reader = new MediaStreamTrackProcessor({ track: this.stream.getVideoTracks()[0] }).readable.getReader();
    } catch {
      this.source = 'video';
      this.pumpVideo(session);
      return;
    }
    this.reader = reader;
    (async () => {
      while (session === this.session && this.reader === reader) {
        let next;
        try {
          next = await reader.read();
        } catch {
          return;
        }
        if (next.done) return;
        const now = performance.now();
        this.send(session, next.value, now, now);
      }
    })();
  }

  // Frames from a video element kept in the page (two pixels, behind the game).
  pumpVideo(session) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
    video.srcObject = this.stream;
    document.body.appendChild(video);
    this.video = video;
    video.play().catch(() => {
      // Some browsers start the stream without play() resolving; frames still come.
    });
    const grab = (time, capture) => {
      if (session !== this.session || this.busy || video.readyState < 2) return;
      this.busy = true;
      createImageBitmap(video).then((frame) => {
        this.busy = false;
        this.send(session, frame, time, capture);
      }, () => {
        this.busy = false;
      });
    };
    if (video.requestVideoFrameCallback) {
      const next = (now, meta) => {
        if (session !== this.session || this.video !== video) return;
        grab(now, meta.captureTime ?? meta.expectedDisplayTime ?? now);
        video.requestVideoFrameCallback(next);
      };
      video.requestVideoFrameCallback(next);
    } else {
      let last = -1;
      const poll = () => {
        if (session !== this.session || this.video !== video) return;
        if (video.currentTime !== last) {
          last = video.currentTime;
          const now = performance.now();
          grab(now, now);
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }
  }

  // Once a second: frames must be coming, and on the GPU a face must eventually be found.
  watch(session) {
    let triedVideo = false;
    let triedCpu = this.engine === 'cpu';
    const timer = setInterval(async () => {
      if (session !== this.session) {
        clearInterval(timer);
        return;
      }
      const since = performance.now() - this.startedAt;
      const { sent, answered, faces } = this.counts;
      if (sent === 0 && since > FRAMES_WITHIN) {
        if (!triedVideo && this.source === 'track') {
          // Nothing from the track: read it through a video element instead.
          triedVideo = true;
          this.reader?.cancel().catch(() => {});
          this.reader = null;
          this.source = 'video';
          this.startedAt = performance.now();
          this.pump(session);
        } else {
          clearInterval(timer);
          this.state = 'the camera sends no pictures';
          this.fail('unavailable');
        }
      } else if (answered > 0 && faces === 0 && since > FACE_WITHIN && !triedCpu) {
        // Pictures, but never a face: perhaps the GPU cannot read them here. Try the CPU.
        triedCpu = true;
        clearInterval(timer);
        const outcome = await this.launch('cpu');
        if (session !== this.session) return;
        if (outcome !== 'ready') {
          this.state = `the face finder would not start (${outcome})`;
          this.fail('unavailable');
          return;
        }
        this.counts = { sent: 0, answered: 0, faces: 0 };
        this.startedAt = performance.now();
        this.listen(session);
        this.state = 'reading the camera';
        this.watch(session);
      }
    }, 1000);
  }

  fail(status) {
    const state = this.state;
    this.stop();
    this.state = state;
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
    this.state = 'off';
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    this.release();
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
    }
    this.video = null;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
