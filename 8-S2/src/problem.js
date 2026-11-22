// Eight points on the sphere, after arXiv:2609.22077. The minimizer of the Riesz
// s-energy is the square antiprism X(a_s). Its competitor is the cube.

import { assignSides, bisect, hullFaces } from '../../shared/math.js';

const SQRT2 = Math.SQRT2;
const QUARTER = Math.PI / 4;
const SQUARES = [0, 0, 0, 0, 1, 1, 1, 1];

/** Packing limit of the optimal height as s tends to infinity. */
export const A_INFINITY = (2 * SQRT2 - 1) / 7;
/** Closed form of the optimal height for the logarithmic energy. */
export const A_LOG = (2 * Math.sqrt(58) - 13) / 7;

/** Left-hand side of the stationarity equation F(s, a) = 0, divided by d_A^{-q}. */
export function stationarity(s, a) {
  const q = 1 + 0.5 * s;
  const dA = 2 * (1 - a);
  const dB = 4 * (1 - a);
  const dC = 2 - SQRT2 + (2 + SQRT2) * a;
  const dD = 2 + SQRT2 + (2 - SQRT2) * a;
  return 16 + 16 * Math.pow(dA / dB, q)
    - 8 * (2 + SQRT2) * Math.pow(dA / dC, q)
    - 8 * (2 - SQRT2) * Math.pow(dA / dD, q);
}

/** The unique root a_s in (0, 1) of the stationarity equation. */
export function optimalA(s) {
  return bisect((a) => stationarity(s, a), 0, 1);
}

/**
 * Two parallel squares at heights +sqrt(a) and -sqrt(a), the lower one rotated by theta.
 * theta = pi/4 gives the square antiprism X(a), and prism(1/3, 0) is the cube.
 */
export function prism(a, theta = QUARTER) {
  const r = Math.sqrt(1 - a), h = Math.sqrt(a);
  const Y = new Float64Array(24);
  for (let j = 0; j < 4; j++) {
    const u = (j * Math.PI) / 2;
    Y[3 * j] = r * Math.cos(u); Y[3 * j + 1] = r * Math.sin(u); Y[3 * j + 2] = h;
    const v = theta + u;
    Y[3 * (j + 4)] = r * Math.cos(v); Y[3 * (j + 4) + 1] = r * Math.sin(v); Y[3 * (j + 4) + 2] = -h;
  }
  return Y;
}

/** Recover (a, theta) from a configuration produced by prism and moved symmetrically. */
export function prismParameters(Y) {
  const a = Y[2] * Y[2];
  let theta = Math.atan2(Y[13], Y[12]) - Math.atan2(Y[1], Y[0]);
  const period = Math.PI / 2;
  theta = ((theta % period) + period) % period;
  return { a, theta };
}

/** If the hull has exactly two disjoint quadrilateral faces, return them. */
export function findSquares(faces) {
  const quads = faces.filter((f) => f.length === 4);
  if (quads.length !== 2) return null;
  if (quads[0].some((m) => quads[1].includes(m))) return null;
  return quads;
}

/**
 * Change the height of an antiprism in arbitrary orientation. top and bottom are
 * the index sets of the two squares. The twist and the orientation are kept.
 */
export function setAntiprismHeight(Y, top, bottom, a) {
  let nx = 0, ny = 0, nz = 0;
  for (const m of top) { nx += Y[3 * m]; ny += Y[3 * m + 1]; nz += Y[3 * m + 2]; }
  for (const m of bottom) { nx -= Y[3 * m]; ny -= Y[3 * m + 1]; nz -= Y[3 * m + 2]; }
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) return false;
  nx /= nl; ny /= nl; nz /= nl;
  const r = Math.sqrt(1 - a), h = Math.sqrt(a);
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    for (const m of side === 0 ? top : bottom) {
      const along = Y[3 * m] * nx + Y[3 * m + 1] * ny + Y[3 * m + 2] * nz;
      let px = Y[3 * m] - along * nx, py = Y[3 * m + 1] - along * ny, pz = Y[3 * m + 2] - along * nz;
      const pl = Math.hypot(px, py, pz);
      if (pl < 1e-9) return false;
      px /= pl; py /= pl; pz /= pl;
      Y[3 * m] = r * px + sign * h * nx;
      Y[3 * m + 1] = r * py + sign * h * ny;
      Y[3 * m + 2] = r * pz + sign * h * nz;
    }
  }
  return true;
}

export const problem = {
  n: 8,
  // The antiprism X(a_s) is the minimizer for every s >= 0. The bar goes up to s = 24.
  exponent: { initial: 1, max: 24 },
  // Group 0 is the upper square, group 1 the lower one.
  groupColors: ['--upper', '--lower'],
  pointRadius: 0.055,
  // In the antiprism and in the cube the edges are shorter than 1.30 and all other
  // pairs are further apart than 1.63, for every exponent s.
  lines: { near: 1.38, far: 1.58 },
  randomSeparation: 0.35,

  minimizer: (s) => prism(optimalA(s)),
  minimizerGroups: SQUARES,

  /** Move an antiprism Y, in any orientation, to the height that is optimal for s. */
  follow(Y, groups, s) {
    const top = [], bottom = [];
    groups.forEach((g, m) => (g === 0 ? top : bottom).push(m));
    setAntiprismHeight(Y, top, bottom, optimalA(s));
  },

  /** The two squares of an antiprism Y as a colouring, or null if Y has no two disjoint square faces. */
  detectGroups(Y, current) {
    const squares = findSquares(hullFaces(Y));
    return squares && assignSides(Y, squares[0], squares[1], current);
  },

  competitor: {
    make: () => prism(1 / 3, 0),
    groups: SQUARES,
    /** A small twist keeps the symmetry, so the cube turns into the antiprism as a whole. */
    twist(Y) {
      const { a, theta } = prismParameters(Y);
      return prism(a, theta < QUARTER ? theta + 0.008 : theta - 0.008);
    },
  },
};
