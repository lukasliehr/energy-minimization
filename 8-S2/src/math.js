// Mathematics of the eight-point energy problem.
// A configuration is a Float64Array of length 24 holding (x, y, z) for each point.
// Notation follows arXiv:2609.22077.

export const N = 8;
export const PAIRS = (N * (N - 1)) / 2;
const SQRT2 = Math.SQRT2;

/** Packing limit of the optimal height as s tends to infinity. */
export const A_INFINITY = (2 * SQRT2 - 1) / 7;
/** Closed form of the optimal height for the logarithmic energy. */
export const A_LOG = (2 * Math.sqrt(58) - 13) / 7;

/** Riesz kernel as a function of the squared distance. */
export function kernel(d2, s) {
  return s === 0 ? -0.5 * Math.log(d2) : Math.pow(d2, -0.5 * s);
}

/** Normalized kernel (d^{-s} - 1)/s, which tends to -log d as s tends to 0. */
export function kernelNorm(d2, s) {
  const l = -0.5 * Math.log(d2);
  return s === 0 ? l : Math.expm1(s * l) / s;
}

/** Riesz s-energy E_s(Y). With normalized = true it returns (E_s(Y) - 28)/s. */
export function energy(Y, s, normalized = false) {
  let e = 0;
  for (let i = 0; i < N; i++) {
    const xi = Y[3 * i], yi = Y[3 * i + 1], zi = Y[3 * i + 2];
    for (let j = i + 1; j < N; j++) {
      const dx = xi - Y[3 * j], dy = yi - Y[3 * j + 1], dz = zi - Y[3 * j + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      e += normalized ? kernelNorm(d2, s) : kernel(d2, s);
    }
  }
  return e;
}

/** The 28 pairwise distances, written into out as [i, j, distance] triples. */
export function pairDistances(Y, out = []) {
  out.length = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = Y[3 * i] - Y[3 * j], dy = Y[3 * i + 1] - Y[3 * j + 1], dz = Y[3 * i + 2] - Y[3 * j + 2];
      out.push([i, j, Math.sqrt(dx * dx + dy * dy + dz * dz)]);
    }
  }
  return out;
}

/**
 * Tangential force on each point, that is, minus the gradient of the normalized
 * energy projected onto the tangent planes of the sphere. Returns the largest norm.
 */
export function forces(Y, s, F) {
  const q = 1 + 0.5 * s;
  F.fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = Y[3 * i] - Y[3 * j], dy = Y[3 * i + 1] - Y[3 * j + 1], dz = Y[3 * i + 2] - Y[3 * j + 2];
      const w = Math.pow(dx * dx + dy * dy + dz * dz, -q);
      F[3 * i] += w * dx; F[3 * i + 1] += w * dy; F[3 * i + 2] += w * dz;
      F[3 * j] -= w * dx; F[3 * j + 1] -= w * dy; F[3 * j + 2] -= w * dz;
    }
  }
  let gmax = 0;
  for (let i = 0; i < N; i++) {
    const r = F[3 * i] * Y[3 * i] + F[3 * i + 1] * Y[3 * i + 1] + F[3 * i + 2] * Y[3 * i + 2];
    F[3 * i] -= r * Y[3 * i]; F[3 * i + 1] -= r * Y[3 * i + 1]; F[3 * i + 2] -= r * Y[3 * i + 2];
    gmax = Math.max(gmax, Math.hypot(F[3 * i], F[3 * i + 1], F[3 * i + 2]));
  }
  return gmax;
}

/** Magnitude of the force between two nearest neighbours of the optimal antiprism. */
export function referenceForce(s, a) {
  const dA = 2 * (1 - a);
  return Math.pow(dA, -(1 + 0.5 * s)) * Math.sqrt(dA);
}

const scratchF = new Float64Array(3 * N);
const scratchT = new Float64Array(3 * N);

/**
 * Projected gradient descent on the sphere with a backtracking line search.
 * state = { eta } carries the step size between calls. maxMove bounds the
 * displacement of any point in one iteration, which keeps the animation smooth.
 * Returns { gmax, stalled }. stalled means that no further decrease is resolvable.
 */
export function descend(Y, s, state, iterations, maxMove = Infinity) {
  const F = scratchF, T = scratchT;
  let E0 = energy(Y, s, true);
  let gmax = 0;
  for (let it = 0; it < iterations; it++) {
    gmax = forces(Y, s, F);
    if (!(gmax > 1e-12)) return { gmax, stalled: true };
    let g2 = 0;
    for (let k = 0; k < 3 * N; k++) g2 += F[k] * F[k];
    let eta = Math.min(state.eta, maxMove / gmax);
    let accepted = false;
    for (let tries = 0; tries < 50; tries++) {
      for (let i = 0; i < N; i++) {
        const x = Y[3 * i] + eta * F[3 * i], y = Y[3 * i + 1] + eta * F[3 * i + 1], z = Y[3 * i + 2] + eta * F[3 * i + 2];
        const n = 1 / Math.hypot(x, y, z);
        T[3 * i] = x * n; T[3 * i + 1] = y * n; T[3 * i + 2] = z * n;
      }
      const E1 = energy(T, s, true);
      if (E1 <= E0 - 1e-4 * eta * g2 && E1 < E0) {
        Y.set(T);
        E0 = E1;
        state.eta = eta * 1.6;
        accepted = true;
        break;
      }
      eta *= 0.5;
    }
    if (!accepted) return { gmax, stalled: true };
  }
  return { gmax, stalled: false };
}

const scratchW = new Float64Array(N);

/**
 * One explicit Euler step of the gradient flow of the normalized energy on the sphere.
 * The step is short compared with the stiffness of the configuration, so the iterates
 * follow the flow smoothly instead of jumping from one side of a valley to the other,
 * as a line search does. No point moves further than maxMove.
 * Returns the largest tangential force before the step.
 */
export function flowStep(Y, s, maxMove) {
  const q = 1 + 0.5 * s;
  const F = scratchF, W = scratchW;
  F.fill(0);
  W.fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = Y[3 * i] - Y[3 * j], dy = Y[3 * i + 1] - Y[3 * j + 1], dz = Y[3 * i + 2] - Y[3 * j + 2];
      const w = Math.pow(dx * dx + dy * dy + dz * dz, -q);
      F[3 * i] += w * dx; F[3 * i + 1] += w * dy; F[3 * i + 2] += w * dz;
      F[3 * j] -= w * dx; F[3 * j + 1] -= w * dy; F[3 * j + 2] -= w * dz;
      W[i] += w; W[j] += w;
    }
  }
  let gmax = 0, wmax = 0;
  for (let i = 0; i < N; i++) {
    const r = F[3 * i] * Y[3 * i] + F[3 * i + 1] * Y[3 * i + 1] + F[3 * i + 2] * Y[3 * i + 2];
    F[3 * i] -= r * Y[3 * i]; F[3 * i + 1] -= r * Y[3 * i + 1]; F[3 * i + 2] -= r * Y[3 * i + 2];
    gmax = Math.max(gmax, Math.hypot(F[3 * i], F[3 * i + 1], F[3 * i + 2]));
    wmax = Math.max(wmax, W[i]);
  }
  // The second derivatives of the energy are bounded by a multiple of (1 + 2q) wmax.
  const eta = Math.min(0.5 / (4 * (1 + 2 * q) * wmax), maxMove / gmax);
  for (let i = 0; i < N; i++) {
    const x = Y[3 * i] + eta * F[3 * i], y = Y[3 * i + 1] + eta * F[3 * i + 1], z = Y[3 * i + 2] + eta * F[3 * i + 2];
    const n = 1 / Math.hypot(x, y, z);
    Y[3 * i] = x * n; Y[3 * i + 1] = y * n; Y[3 * i + 2] = z * n;
  }
  return gmax;
}

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
  let lo = 0, hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (stationarity(s, mid) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Two parallel squares at heights +sqrt(a) and -sqrt(a), the lower one rotated by theta.
 * theta = pi/4 gives the square antiprism X(a), and prism(1/3, 0) is the cube.
 */
export function prism(a, theta = Math.PI / 4) {
  const r = Math.sqrt(1 - a), h = Math.sqrt(a);
  const Y = new Float64Array(3 * N);
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
  const quarter = Math.PI / 2;
  theta = ((theta % quarter) + quarter) % quarter;
  return { a, theta };
}

/** Uniformly random points on the sphere, rejecting configurations with very close pairs. */
export function randomConfiguration(minDistance = 0.35) {
  const Y = new Float64Array(3 * N);
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let i = 0; i < N; i++) {
      const z = 2 * Math.random() - 1, phi = 2 * Math.PI * Math.random();
      const r = Math.sqrt(1 - z * z);
      Y[3 * i] = r * Math.cos(phi); Y[3 * i + 1] = r * Math.sin(phi); Y[3 * i + 2] = z;
    }
    if (pairDistances(Y).every((p) => p[2] >= minDistance)) break;
  }
  return Y;
}

/** Move every point by a random tangent vector of the given size. */
export function perturb(Y, size) {
  for (let i = 0; i < N; i++) {
    let x = Y[3 * i] + size * (2 * Math.random() - 1);
    let y = Y[3 * i + 1] + size * (2 * Math.random() - 1);
    let z = Y[3 * i + 2] + size * (2 * Math.random() - 1);
    const n = 1 / Math.hypot(x, y, z);
    Y[3 * i] = x * n; Y[3 * i + 1] = y * n; Y[3 * i + 2] = z * n;
  }
}

/**
 * Faces of the convex hull. Each face is a list of vertex indices in cyclic order.
 * Coplanar points are merged into one polygon, so the antiprism has two squares
 * and eight triangles and the cube has six squares.
 */
export function hullFaces(Y, eps = 1e-5) {
  const faces = new Map();
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let k = j + 1; k < N; k++) {
        const ax = Y[3 * j] - Y[3 * i], ay = Y[3 * j + 1] - Y[3 * i + 1], az = Y[3 * j + 2] - Y[3 * i + 2];
        const bx = Y[3 * k] - Y[3 * i], by = Y[3 * k + 1] - Y[3 * i + 1], bz = Y[3 * k + 2] - Y[3 * i + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        nx /= len; ny /= len; nz /= len;
        const offset = nx * Y[3 * i] + ny * Y[3 * i + 1] + nz * Y[3 * i + 2];
        let above = 0, below = 0;
        const on = [];
        for (let m = 0; m < N; m++) {
          const dist = nx * Y[3 * m] + ny * Y[3 * m + 1] + nz * Y[3 * m + 2] - offset;
          if (dist > eps) above++;
          else if (dist < -eps) below++;
          else on.push(m);
        }
        if (above > 0 && below > 0) continue;
        const key = on.join(',');
        if (faces.has(key)) continue;
        // Orient the normal away from the remaining points.
        const sign = above > 0 ? -1 : 1;
        faces.set(key, orderFace(Y, on, sign * nx, sign * ny, sign * nz));
      }
    }
  }
  return [...faces.values()];
}

function orderFace(Y, indices, nx, ny, nz) {
  let cx = 0, cy = 0, cz = 0;
  for (const m of indices) { cx += Y[3 * m]; cy += Y[3 * m + 1]; cz += Y[3 * m + 2]; }
  cx /= indices.length; cy /= indices.length; cz /= indices.length;
  // Orthonormal basis (u, v) of the face plane with u x v = n.
  let ux = Y[3 * indices[0]] - cx, uy = Y[3 * indices[0] + 1] - cy, uz = Y[3 * indices[0] + 2] - cz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
  return indices
    .map((m) => {
      const px = Y[3 * m] - cx, py = Y[3 * m + 1] - cy, pz = Y[3 * m + 2] - cz;
      return [m, Math.atan2(px * vx + py * vy + pz * vz, px * ux + py * uy + pz * uz)];
    })
    .sort((p, q) => p[1] - q[1])
    .map((p) => p[0]);
}

/** Edges of the convex hull as [i, j] pairs with i < j. */
export function hullEdges(faces) {
  const seen = new Set();
  const edges = [];
  for (const face of faces) {
    if (face.length < 3) continue;
    for (let k = 0; k < face.length; k++) {
      const i = Math.min(face[k], face[(k + 1) % face.length]);
      const j = Math.max(face[k], face[(k + 1) % face.length]);
      const key = i * N + j;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  return edges;
}

/** If the hull has exactly two disjoint quadrilateral faces, return them. */
export function findSquares(faces) {
  const quads = faces.filter((f) => f.length === 4);
  if (quads.length !== 2) return null;
  if (quads[0].some((m) => quads[1].includes(m))) return null;
  return quads;
}

/**
 * Permutation p minimizing the total squared distance between from[i] and to[p[i]].
 * Brute force over the 8! permutations with pruning.
 */
export function bestMatching(from, to) {
  const cost = [];
  for (let i = 0; i < N; i++) {
    cost.push([]);
    for (let j = 0; j < N; j++) {
      const dx = from[3 * i] - to[3 * j], dy = from[3 * i + 1] - to[3 * j + 1], dz = from[3 * i + 2] - to[3 * j + 2];
      cost[i].push(dx * dx + dy * dy + dz * dz);
    }
  }
  let best = Infinity, bestPerm = null;
  const perm = new Array(N).fill(-1), used = new Array(N).fill(false);
  const search = (i, total) => {
    if (total >= best) return;
    if (i === N) { best = total; bestPerm = perm.slice(); return; }
    for (let j = 0; j < N; j++) {
      if (used[j]) continue;
      used[j] = true; perm[i] = j;
      search(i + 1, total + cost[i][j]);
      used[j] = false;
    }
  };
  search(0, 0);
  return bestPerm;
}

/** Spherical interpolation between two configurations, point by point. */
export function slerpConfiguration(from, to, t, out) {
  for (let i = 0; i < N; i++) {
    const ax = from[3 * i], ay = from[3 * i + 1], az = from[3 * i + 2];
    const bx = to[3 * i], by = to[3 * i + 1], bz = to[3 * i + 2];
    const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    const omega = Math.acos(dot);
    let x, y, z;
    if (omega < 1e-6) {
      x = bx; y = by; z = bz;
    } else if (Math.PI - omega < 1e-3) {
      // Antipodal points: rotate about an arbitrary perpendicular axis.
      let px = -ay, py = ax, pz = 0;
      if (Math.hypot(px, py) < 1e-6) { px = 1; py = 0; }
      const pn = 1 / Math.hypot(px, py, pz);
      const c = Math.cos(t * Math.PI), sn = Math.sin(t * Math.PI);
      x = c * ax + sn * px * pn; y = c * ay + sn * py * pn; z = c * az + sn * pz * pn;
    } else {
      const so = Math.sin(omega);
      const wa = Math.sin((1 - t) * omega) / so, wb = Math.sin(t * omega) / so;
      x = wa * ax + wb * bx; y = wa * ay + wb * by; z = wa * az + wb * bz;
    }
    const n = 1 / Math.hypot(x, y, z);
    out[3 * i] = x * n; out[3 * i + 1] = y * n; out[3 * i + 2] = z * n;
  }
  return out;
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
