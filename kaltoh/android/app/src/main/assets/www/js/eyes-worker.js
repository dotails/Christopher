// Finds the player's eyes in the front camera's frames, away from the page's own thread so the
// kal-toh keeps its frame rate: MediaPipe's face landmarker, whose iris landmarks give each eye's
// centre and size to a fraction of a pixel. Frames arrive as ImageBitmaps or VideoFrames (see
// tracker.js); for each, the two irises go back, or none if no face is seen.
const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;

// MediaPipe narrates its loading on the console (as warnings, even errors); none of it matters here.
for (const level of ['log', 'info', 'warn', 'error']) {
  const say = console[level].bind(console);
  console[level] = (...args) => {
    if (!/^(INFO|WARNING|[IWE]\d{4} )/.test(String(args[0]))) say(...args);
  };
}

// MediaPipe loads its WebAssembly glue with importScripts, which a module worker refuses; load it
// the same way, synchronously, into this worker's global scope.
self.importScripts = (...urls) => {
  for (const url of urls) {
    const request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.send();
    if (request.status !== 200) throw new Error(`${url}: ${request.status}`);
    (0, eval)(request.responseText);
  }
};

let landmarker = null;

async function start(engine) {
  const { FaceLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
  const files = { wasmLoaderPath: `${BASE}vision_wasm_internal.js`, wasmBinaryPath: `${BASE}vision_wasm_internal.wasm` };
  landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${BASE}face_landmarker.task`, delegate: engine === 'cpu' ? 'CPU' : 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

// An iris: landmark i is its centre, i + 1 to i + 4 lie on its rim. In frame pixels.
function iris(points, i, width, height) {
  const x = points[i].x * width;
  const y = points[i].y * height;
  let r = 0;
  for (let k = 1; k <= 4; k++) r += Math.hypot(points[i + k].x * width - x, points[i + k].y * height - y);
  return { x, y, d: r / 2 };
}

self.onmessage = async ({ data }) => {
  if (data.type === 'start') {
    try {
      await start(data.engine);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'failed', reason: String(err?.message ?? err) });
    }
    return;
  }
  if (data.type !== 'frame') return;
  const { frame, time, capture } = data;
  let image = frame;
  const reply = { type: 'eyes', capture, width: 0, height: 0, eyes: null };
  try {
    // A frame straight from the camera's track (a VideoFrame) is turned into a picture first.
    if (typeof VideoFrame !== 'undefined' && frame instanceof VideoFrame) image = await createImageBitmap(frame);
    reply.width = image.width;
    reply.height = image.height;
    const points = landmarker?.detectForVideo(image, time).faceLandmarks?.[0];
    if (points && points.length >= 478) {
      reply.eyes = [iris(points, 468, image.width, image.height), iris(points, 473, image.width, image.height)];
    }
  } catch (err) {
    reply.error = String(err?.message ?? err);
  }
  if (image !== frame) image.close();
  frame.close();
  self.postMessage(reply);
};
