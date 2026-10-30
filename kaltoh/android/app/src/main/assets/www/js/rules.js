// The nest the kal-toh begins from in zen (zen-rules.js): t'an dropped toward a centre mass, each
// coming to rest against two others (nest.js), the whole tested against a spin about a hidden
// axis (statics.js) and grown again until enough holds, so nothing floats and no chain hangs out
// further than its bonds can bear. Pure logic over the physical nest, so it runs under Node too.
import * as G from './geom.js';
import { growNest } from './nest.js';
import { settle } from './statics.js';

export const ROD_LENGTH = 0.42;
export const ROD_THICKNESS = 0.02;
export const CORE_RADIUS = 0.05;
export const CAPS = { force: 1, moment: 0.12 };

// The spin it is tested against: calm, moderate or strong, chosen by the seed.
const SPIN = [0.6, 0.85, 1.1];
// How many t'an hang about the centre mass.
const DENSITY = { light: 45, medium: 60, dense: 80 };

// An axis kept away from the vertical and the horizontal.
function hiddenAxis(rng) {
  const elevation = (15 + rng() * 60) * (Math.PI / 180);
  const azimuth = rng() * Math.PI * 2;
  return [Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)];
}

// Whatever survives the forces: grow, test, and grow again until enough holds.
export function buildNest(rng, target, forces, margin = 1.2) {
  const nest = growNest(rng, { count: Math.round(target * 1.2), length: ROD_LENGTH, thickness: ROD_THICKNESS, coreRadius: CORE_RADIUS });
  // Tested harder than it need bear, so it is not already on the edge.
  const harder = { ...forces, spin: forces.spin * margin, drift: G.scale(forces.drift, margin) };
  for (let round = 0; ; round++) {
    settle(nest, harder, CAPS);
    const free = nest.liveRods.filter((r) => !r.anchored).length;
    if (free >= target || round >= 6) break;
    growNest(rng, { nest, count: Math.ceil((target - free) * 1.3), core: 0, length: ROD_LENGTH, thickness: ROD_THICKNESS, coreRadius: CORE_RADIUS });
  }
  return nest;
}

// A seed's nest, and the forces it was tested against.
export function startingNest({ seed, density = 'medium' } = {}) {
  const rng = G.mulberry32(seed ?? (Math.random() * 2 ** 32) >>> 0);
  const spin = SPIN[Math.floor(rng() * 3)];
  const forces = { axis: hiddenAxis(rng), spin, drift: [0, 0, 0] };
  return { nest: buildNest(rng, DENSITY[density] ?? DENSITY.medium, forces), forces };
}
