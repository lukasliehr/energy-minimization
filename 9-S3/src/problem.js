// Nine points on the three-sphere S^3 in R^4. The minimizer of the harmonic energy, the
// sum of 1/|x - y|^2 over all pairs, is a regular pentagon on a great circle together
// with a square on the great circle of the orthogonal plane. The minimal energy is 35/2.
// See https://github.com/lukasliehr/Harmonic-Energy-9-Points-S3.
// Its competitor here is a triangle times a triangle: nine points in a 3 x 3 grid on the
// torus between the two circles.

import { space } from '../../shared/math.js';
import { closeness, determinant, orthonormalize } from '../../shared/chart.js';

const S3 = space(4);
// Points 0 to 4 are the pentagon (group 0), points 5 to 8 the square (group 1).
const GROUPS = [0, 0, 0, 0, 0, 1, 1, 1, 1];

/** The pentagon in the plane of the first two coordinates, the square in the plane of the last two. */
export const MINIMIZER = (() => {
  const X = new Float64Array(36);
  for (let k = 0; k < 5; k++) {
    X[4 * k] = Math.cos((2 * Math.PI * k) / 5);
    X[4 * k + 1] = Math.sin((2 * Math.PI * k) / 5);
  }
  for (let k = 0; k < 4; k++) {
    X[4 * (5 + k) + 2] = Math.cos((Math.PI * k) / 2);
    X[4 * (5 + k) + 3] = Math.sin((Math.PI * k) / 2);
  }
  return X;
})();

/** Three by three points: an equilateral triangle in each of the two planes, at the radius 1/sqrt(2). */
export function triangles() {
  const Y = new Float64Array(36), r = Math.SQRT1_2;
  for (let j = 0; j < 3; j++) {
    for (let k = 0; k < 3; k++) {
      const o = 4 * (3 * j + k);
      Y[o] = r * Math.cos((2 * Math.PI * j) / 3); Y[o + 1] = r * Math.sin((2 * Math.PI * j) / 3);
      Y[o + 2] = r * Math.cos((2 * Math.PI * k) / 3); Y[o + 3] = r * Math.sin((2 * Math.PI * k) / 3);
    }
  }
  return Y;
}

/**
 * The frame of the picture for the position t of the bar, see shared/chart.js.
 * The centre of the picture moves along a quarter of a great circle:
 *   t = 0    it lies on the circle of the square, between two of its points. The pentagon
 *            is then a regular pentagon on a circle of radius 1/2, and the square is four
 *            points with equal gaps on the straight line through its middle.
 *   t = 1/2  it has the same distance from both circles, which appear as two linked rings.
 *   t = 1    it is a point of the pentagon. The square is then regular, and the pentagon
 *            is five points with equal gaps on a straight line.
 */
export function frame(t) {
  const tau = (t * Math.PI) / 2, c = Math.cos(tau), s = Math.sin(tau), h = Math.SQRT1_2;
  // a = (1, 0, 0, 0) is a point of the pentagon and b = (0, 0, h, h) lies between two
  // points of the square. a' and b' are the directions of the two circles there.
  return Float64Array.from([
    s, 0, c * h, c * h,       // the centre: cos(tau) b + sin(tau) a
    0, 1, 0, 0,               // x-axis: a'
    0, 0, -h, h,              // y-axis: b'
    -c, 0, s * h, s * h,      // z-axis: sin(tau) b - cos(tau) a
  ]);
}

// A point of the pentagon and a point of the square are told apart by their distances
// to the other eight points.
const PROFILES = [S3.profile(MINIMIZER, 0), S3.profile(MINIMIZER, 5)];

/** The pentagon and the square of a copy Y of the minimizer as a colouring, or null if Y is no copy. */
function detectGroups(Y) {
  const groups = [];
  for (let i = 0; i < 9; i++) {
    const p = S3.profile(Y, i);
    const g = PROFILES.findIndex((q) => q.every((d, k) => Math.abs(d - p[k]) < 0.02));
    if (g < 0) return null;
    groups.push(g);
  }
  return groups.filter((g) => g === 0).length === 5 ? groups : null;
}

/** The points of one group of Y in the order in which they follow each other on their circle. */
function around(Y, members) {
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
  const at = (m) => Array.from(Y.subarray(4 * m, 4 * m + 4));
  const u = at(members[0]);
  // The second direction comes from the member that is least aligned with the first one.
  // Opposite points of the square would not span the plane.
  const w = members.slice(1).map(at).reduce((best, y) => (Math.abs(dot(y, u)) < Math.abs(dot(best, u)) ? y : best));
  const c = dot(w, u);
  let v = w.map((x, k) => x - c * u[k]);
  const length = Math.sqrt(dot(v, v));
  v = v.map((x) => x / length);
  return members
    .map((m) => {
      const y = Y.subarray(4 * m, 4 * m + 4);
      return [m, Math.atan2(dot(y, v), dot(y, u))];
    })
    .sort((p, q) => p[1] - q[1])
    .map((p) => p[0]);
}

/**
 * A motion U of S^3 that maps the minimizer onto its copy Y. There are 80 of them, since
 * the pentagon and the square can each be turned and reflected. The result is the one
 * that is closest to the motion W and has the same determinant, so that the picture can
 * pass from W to it without a jump. The matrices are stored as in shared/chart.js.
 */
function pose(Y, groups, W) {
  const pentagon = around(Y, groups.flatMap((g, m) => (g === 0 ? [m] : [])));
  const square = around(Y, groups.flatMap((g, m) => (g === 1 ? [m] : [])));
  const sign = Math.sign(determinant(W));
  let best = null, bestScore = -Infinity;
  for (let turn5 = 0; turn5 < 5; turn5++) {
    for (const way5 of [1, -1]) {
      for (let turn4 = 0; turn4 < 4; turn4++) {
        for (const way4 of [1, -1]) {
          // U sends the k-th point of the pentagon to pentagon[turn5 + way5 k], and likewise
          // for the square. The columns of U are the images of the four unit vectors.
          const U = new Float64Array(16);
          for (let k = 0; k < 5; k++) {
            const m = pentagon[(((turn5 + way5 * k) % 5) + 5) % 5];
            for (let r = 0; r < 4; r++) {
              U[4 * r] += 0.4 * Math.cos((2 * Math.PI * k) / 5) * Y[4 * m + r];
              U[4 * r + 1] += 0.4 * Math.sin((2 * Math.PI * k) / 5) * Y[4 * m + r];
            }
          }
          for (let k = 0; k < 4; k++) {
            const m = square[(((turn4 + way4 * k) % 4) + 4) % 4];
            for (let r = 0; r < 4; r++) {
              U[4 * r + 2] += 0.5 * Math.cos((Math.PI * k) / 2) * Y[4 * m + r];
              U[4 * r + 3] += 0.5 * Math.sin((Math.PI * k) / 2) * Y[4 * m + r];
            }
          }
          orthonormalize(U);
          if (Math.sign(determinant(U)) !== sign) continue;
          const score = closeness(W, U);
          if (score > bestScore) { bestScore = score; best = U; }
        }
      }
    }
  }
  return best;
}

export const problem = {
  n: 9,
  dim: 4,
  // The theorem is about the harmonic energy, which is the Riesz energy with s = 2.
  exponent: { fixed: 2 },
  energyName: 'Harmonic energy',
  groupColors: ['--upper', '--lower'],
  pointRadius: 0.045,
  // The sides of the pentagon have the length 1.18. The sides of the square and the 20
  // pairs of a point of the pentagon with a point of the square have the length 1.41.
  // All other pairs are further apart than 1.90. In the competitor the 18 edges have the
  // length 1.22 and the other pairs 1.73.
  lines: { near: 1.45, far: 1.6 },
  // Lines between points of different groups are drawn thinner by this factor.
  crossWeight: 0.3,
  randomSeparation: 0.35,
  // The energy is very flat around this minimizer: a configuration can be 0.006 away from
  // it with an energy that is only 4e-9 higher. So the relaxation stops a little earlier
  // than on the other pages, and the page then moves the points onto the exact copy.
  tolerance: 1e-7,

  minimizer: () => MINIMIZER.slice(),
  minimizerGroups: GROUPS,
  detectGroups,
  pose,

  competitor: {
    make: triangles,
    groups: new Array(9).fill(-1),
  },

  // The bar that turns the three-sphere, with the positions at which it clicks into place.
  view: { initial: 0.5, marks: [0, 0.5, 1], frame },
};
