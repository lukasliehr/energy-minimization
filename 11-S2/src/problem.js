// Eleven points on the sphere. The minimizer of the Coulomb energy is known by its
// coordinates: the table X_0 of https://github.com/lukasliehr/Thomson-11-Points agrees
// with it up to 10^-10. Its convex hull is an icosahedron in which one edge is
// contracted. Its competitor here is an icosahedron without one vertex: a pole and two
// pentagons, at the heights that are best for this shape.

import { energy, pairDistances } from '../../shared/math.js';

/** The table X_0 of Showcase.lean. */
const TABLE = [
  [0.313620689025589, 0.319317483958265, 0.894247397454238],
  [0.122131934022939, -0.879707882375786, 0.459562653375714],
  [0.836384234608648, 0.540732019932700, 0.089834819071496],
  [-0.829513636587083, -0.542301295299786, -0.133478207330809],
  [-0.566960498580477, 0.239819275605855, -0.788062502659060],
  [0.061432238616290, -0.754530255111397, -0.653383634766071],
  [-0.016529763516812, 0.987228274258469, -0.158452205483935],
  [0.892049358244038, -0.450479658797258, 0.036276982596482],
  [0.482848954144595, 0.189339586942292, -0.854989712393075],
  [-0.513162273240149, -0.211638860342633, 0.831789320751279],
  [-0.786447187737911, 0.558000050679941, 0.264833465295296],
];

// Numerically the configuration is mapped to itself by a rotation of 180 degrees about
// the axis through point 0 and by two reflections. The other points form five orbits:
// four points, which are the corners of a rectangle, and three pairs.
const POLE = 0;
const RECTANGLE = [1, 6, 7, 10];
const PAIRS = [[2, 9], [3, 8], [4, 5]];
// Group 0 is the rectangle, groups 1 to 3 are the pairs, group 4 is the point on the axis.
const GROUPS = new Array(11).fill(-1);
GROUPS[POLE] = 4;
RECTANGLE.forEach((m) => { GROUPS[m] = 0; });
PAIRS.forEach((pair, k) => pair.forEach((m) => { GROUPS[m] = 1 + k; }));

/** The table in coordinates in which the axis is vertical and point 0 is on top. */
function upright() {
  const axis = TABLE[POLE];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c = dot(TABLE[RECTANGLE[0]], axis);
  let e1 = TABLE[RECTANGLE[0]].map((x, k) => x - c * axis[k]);
  const length = Math.hypot(...e1);
  e1 = e1.map((x) => x / length);
  const e2 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
  return Float64Array.from(TABLE.flatMap((p) => [dot(p, e1), dot(p, e2), dot(p, axis)]));
}

export const MINIMIZER = upright();

/** A pole and two regular pentagons at the heights h1 and h2, rotated by pi/5 against each other. */
export function pentagons(h1, h2) {
  const Y = new Float64Array(33);
  Y[2] = 1;
  for (let k = 0; k < 5; k++) {
    const u = (2 * Math.PI * k) / 5, v = u + Math.PI / 5;
    const r1 = Math.sqrt(1 - h1 * h1), r2 = Math.sqrt(1 - h2 * h2);
    Y[3 * (1 + k)] = r1 * Math.cos(u); Y[3 * (1 + k) + 1] = r1 * Math.sin(u); Y[3 * (1 + k) + 2] = h1;
    Y[3 * (6 + k)] = r2 * Math.cos(v); Y[3 * (6 + k) + 1] = r2 * Math.sin(v); Y[3 * (6 + k) + 2] = h2;
  }
  return Y;
}

/** The two heights at which this shape has the least Coulomb energy. */
export const PENTAGON_HEIGHTS = (() => {
  // Start from the icosahedron without one vertex and go down the gradient.
  let h1 = 1 / Math.sqrt(5), h2 = -1 / Math.sqrt(5);
  const e = 1e-6;
  for (let step = 0; step < 400; step++) {
    const g1 = (energy(pentagons(h1 + e, h2), 1) - energy(pentagons(h1 - e, h2), 1)) / (2 * e);
    const g2 = (energy(pentagons(h1, h2 + e), 1) - energy(pentagons(h1, h2 - e), 1)) / (2 * e);
    h1 -= 0.02 * g1;
    h2 -= 0.02 * g2;
  }
  return [h1, h2];
})();

/** The distances from point i to the other points, in increasing order. */
function profile(Y, i) {
  const n = Y.length / 3, distances = [];
  for (let j = 0; j < n; j++) {
    if (j !== i) distances.push(Math.hypot(Y[3 * i] - Y[3 * j], Y[3 * i + 1] - Y[3 * j + 1], Y[3 * i + 2] - Y[3 * j + 2]));
  }
  return distances.sort((a, b) => a - b);
}

// One profile for each group. The profiles of two groups differ by 0.099 or more in some distance.
const PROFILES = [RECTANGLE[0], PAIRS[0][0], PAIRS[1][0], PAIRS[2][0], POLE].map((m) => profile(MINIMIZER, m));
const GROUP_SIZES = [4, 2, 2, 2, 1];

export const problem = {
  n: 11,
  // The theorem is about the Coulomb energy only.
  exponent: { fixed: 1 },
  // The rectangle, the three pairs, and the point on the axis.
  groupColors: ['--upper', '--lower', '--lower', '--lower', '--pole'],
  pointRadius: 0.052,
  // In the minimizer the 27 edges are shorter than 1.29 and all other pairs are further
  // apart than 1.63. The competitor has 25 edges up to 1.13, and then pairs at 1.54.
  lines: { near: 1.36, far: 1.53 },
  randomSeparation: 0.3,

  minimizer: () => MINIMIZER.slice(),
  minimizerGroups: GROUPS,

  /**
   * The groups of a copy Y of the minimizer, which may be turned, reflected and
   * relabelled: every point is recognized by its distances to the other points.
   * Returns null if Y is not such a copy.
   */
  detectGroups(Y) {
    const groups = [], sizes = [0, 0, 0, 0, 0];
    for (let i = 0; i < 11; i++) {
      const p = profile(Y, i);
      const g = PROFILES.findIndex((q) => q.every((d, k) => Math.abs(d - p[k]) < 0.02));
      if (g < 0) return null;
      groups.push(g);
      sizes[g]++;
    }
    return sizes.every((size, g) => size === GROUP_SIZES[g]) ? groups : null;
  },

  competitor: {
    make: () => pentagons(...PENTAGON_HEIGHTS),
    // The pole, the upper pentagon and the lower pentagon.
    groups: [4, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  },
};

// The largest distance between two points of the minimizer that are joined by an edge,
// and the smallest distance between two that are not. Used by the tests.
export const EDGE_GAP = (() => {
  const d = pairDistances(MINIMIZER).map((pair) => pair[2]).sort((a, b) => a - b);
  return [d[26], d[27]];
})();
