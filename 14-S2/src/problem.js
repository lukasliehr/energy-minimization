// Fourteen points on the sphere. The minimizer of the Coulomb energy is the bicapped
// hexagonal antiprism X(h*): the two poles and two regular hexagons at the heights h*
// and -h*, one rotated by pi/6 against the other. Its competitor here is the same
// shape without the rotation, a hexagonal prism with two caps.

import { assignSides, bisect, energy, pairDistances } from '../../shared/math.js';

const SIXTH = Math.PI / 6;
// Points 0 and 1 are the poles (group 2), 2 to 7 the upper hexagon (group 0),
// 8 to 13 the lower hexagon (group 1).
const RINGS = [2, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];

/** The optimal height and the minimal Coulomb energy, as enclosed in the proof. */
export const H_STAR = 0.455367795162463;
export const E_STAR = 69.30636329662642;

/**
 * The poles and two hexagons at the heights h and -h, the lower one rotated by theta.
 * theta = pi/6 gives X(h), and theta = 0 a hexagonal prism with two caps.
 */
export function capped(h, theta = SIXTH) {
  const r = Math.sqrt(1 - h * h);
  const Y = new Float64Array(42);
  Y[2] = 1;
  Y[5] = -1;
  for (let k = 0; k < 6; k++) {
    const u = (k * Math.PI) / 3, v = u + theta;
    Y[3 * (2 + k)] = r * Math.cos(u); Y[3 * (2 + k) + 1] = r * Math.sin(u); Y[3 * (2 + k) + 2] = h;
    Y[3 * (8 + k)] = r * Math.cos(v); Y[3 * (8 + k) + 1] = r * Math.sin(v); Y[3 * (8 + k) + 2] = -h;
  }
  return Y;
}

/** Recover (h, theta) from a configuration produced by capped and moved symmetrically. */
export function cappedParameters(Y) {
  const h = Y[8];
  let theta = Math.atan2(Y[25], Y[24]) - Math.atan2(Y[7], Y[6]);
  const period = Math.PI / 3;
  theta = ((theta % period) + period) % period;
  return { h, theta };
}

/** Height of the prism with caps that has the least Coulomb energy among all heights. */
export const PRISM_HEIGHT = bisect((h) => energy(capped(h + 1e-6, 0), 1) - energy(capped(h - 1e-6, 0), 1), 0.2, 0.8);

export const problem = {
  n: 14,
  // The theorem is about the Coulomb energy only.
  exponent: { fixed: 1 },
  groupColors: ['--upper', '--lower', '--pole'],
  pointRadius: 0.05,
  // In X(h*) the 36 edges are shorter than 1.05 and all other pairs are further apart
  // than 1.54. The diagonals of the side faces of the prism have length 1.28.
  lines: { near: 1.1, far: 1.3 },
  randomSeparation: 0.28,

  minimizer: () => capped(H_STAR),
  minimizerGroups: RINGS,

  /**
   * The poles and the two hexagons of a bicapped antiprism Y as a colouring, or null if
   * Y has no antipodal pair that splits the other points six to six.
   */
  detectGroups(Y, current) {
    const [i, j, distance] = pairDistances(Y).reduce((far, pair) => (pair[2] > far[2] ? pair : far));
    if (distance < 2 - 1e-6) return null;
    const upper = [], lower = [];
    for (let m = 0; m < 14; m++) {
      if (m === i || m === j) continue;
      const along = (Y[3 * i] - Y[3 * j]) * Y[3 * m] + (Y[3 * i + 1] - Y[3 * j + 1]) * Y[3 * m + 1] + (Y[3 * i + 2] - Y[3 * j + 2]) * Y[3 * m + 2];
      (along > 0 ? upper : lower).push(m);
    }
    if (upper.length !== 6) return null;
    const groups = new Array(14).fill(-1);
    groups[i] = 2;
    groups[j] = 2;
    return assignSides(Y, upper, lower, current, groups);
  },

  competitor: {
    make: () => capped(PRISM_HEIGHT, 0),
    groups: RINGS,
    /** A small twist keeps the symmetry, so the prism turns into the antiprism as a whole. */
    twist(Y) {
      const { h, theta } = cappedParameters(Y);
      return capped(h, theta < SIXTH ? theta + 0.008 : theta - 0.008);
    },
  },
};
