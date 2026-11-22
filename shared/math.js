// Energy minimization on the sphere for configurations of n points: energies,
// forces, relaxation and a little geometry. A configuration is a Float64Array of
// length 3n holding (x, y, z) for each point. Everything specific to one value
// of n lives in the folder of that problem.

/** Riesz kernel as a function of the squared distance. s = 0 is the logarithmic kernel. */
export function kernel(d2, s) {
  return s === 0 ? -0.5 * Math.log(d2) : Math.pow(d2, -0.5 * s);
}

/** Normalized kernel (d^{-s} - 1)/s, which tends to -log d as s tends to 0. */
export function kernelNorm(d2, s) {
  const l = -0.5 * Math.log(d2);
  return s === 0 ? l : Math.expm1(s * l) / s;
}

/** Riesz s-energy E_s(Y). With normalized = true every pair contributes (d^{-s} - 1)/s. */
export function energy(Y, s, normalized = false) {
  const n = Y.length / 3;
  let e = 0;
  for (let i = 0; i < n; i++) {
    const xi = Y[3 * i], yi = Y[3 * i + 1], zi = Y[3 * i + 2];
    for (let j = i + 1; j < n; j++) {
      const dx = xi - Y[3 * j], dy = yi - Y[3 * j + 1], dz = zi - Y[3 * j + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      e += normalized ? kernelNorm(d2, s) : kernel(d2, s);
    }
  }
  return e;
}

/** The pairwise distances as [i, j, distance] triples. */
export function pairDistances(Y) {
  const n = Y.length / 3, out = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      out.push([i, j, Math.hypot(Y[3 * i] - Y[3 * j], Y[3 * i + 1] - Y[3 * j + 1], Y[3 * i + 2] - Y[3 * j + 2])]);
    }
  }
  return out;
}

// Work arrays, one set for every number of points.
const work = new Map();
function buffers(n) {
  if (!work.has(n)) work.set(n, { F: new Float64Array(3 * n), T: new Float64Array(3 * n), W: new Float64Array(n) });
  return work.get(n);
}

/**
 * Pair forces of the normalized energy summed for each point, without the projection
 * onto the tangent planes. W, if given, receives the sum of the pair weights of each point.
 */
function accumulate(Y, s, F, W) {
  const n = Y.length / 3, q = 1 + 0.5 * s;
  F.fill(0);
  if (W) W.fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = Y[3 * i] - Y[3 * j], dy = Y[3 * i + 1] - Y[3 * j + 1], dz = Y[3 * i + 2] - Y[3 * j + 2];
      const w = Math.pow(dx * dx + dy * dy + dz * dz, -q);
      F[3 * i] += w * dx; F[3 * i + 1] += w * dy; F[3 * i + 2] += w * dz;
      F[3 * j] -= w * dx; F[3 * j + 1] -= w * dy; F[3 * j + 2] -= w * dz;
      if (W) { W[i] += w; W[j] += w; }
    }
  }
}

/** Project F onto the tangent planes at the points of Y. Returns the largest norm. */
function project(Y, F) {
  const n = Y.length / 3;
  let gmax = 0;
  for (let i = 0; i < n; i++) {
    const r = F[3 * i] * Y[3 * i] + F[3 * i + 1] * Y[3 * i + 1] + F[3 * i + 2] * Y[3 * i + 2];
    F[3 * i] -= r * Y[3 * i]; F[3 * i + 1] -= r * Y[3 * i + 1]; F[3 * i + 2] -= r * Y[3 * i + 2];
    gmax = Math.max(gmax, Math.hypot(F[3 * i], F[3 * i + 1], F[3 * i + 2]));
  }
  return gmax;
}

/** Move every point by step times its force and put it back on the sphere. */
function move(Y, F, step, out) {
  const n = Y.length / 3;
  for (let i = 0; i < n; i++) {
    const x = Y[3 * i] + step * F[3 * i], y = Y[3 * i + 1] + step * F[3 * i + 1], z = Y[3 * i + 2] + step * F[3 * i + 2];
    const norm = 1 / Math.hypot(x, y, z);
    out[3 * i] = x * norm; out[3 * i + 1] = y * norm; out[3 * i + 2] = z * norm;
  }
}

/**
 * Tangential force on each point, that is, minus the gradient of the normalized
 * energy projected onto the tangent planes of the sphere. Returns the largest norm.
 */
export function forces(Y, s, F) {
  accumulate(Y, s, F, null);
  return project(Y, F);
}

/** Magnitude of the force between the two closest points of Y. It sets the scale of the arrows. */
export function referenceForce(Y, s) {
  let d2 = Infinity;
  for (const [, , d] of pairDistances(Y)) d2 = Math.min(d2, d * d);
  return Math.pow(d2, -(1 + 0.5 * s)) * Math.sqrt(d2);
}

/**
 * Projected gradient descent on the sphere with a backtracking line search.
 * state = { eta } carries the step size between calls. maxMove bounds the
 * displacement of any point in one iteration.
 * Returns { gmax, stalled }. stalled means that no further decrease is resolvable.
 */
export function descend(Y, s, state, iterations, maxMove = Infinity) {
  const { F, T } = buffers(Y.length / 3);
  let E0 = energy(Y, s, true);
  let gmax = 0;
  for (let it = 0; it < iterations; it++) {
    gmax = forces(Y, s, F);
    if (!(gmax > 1e-12)) return { gmax, stalled: true };
    let g2 = 0;
    for (let k = 0; k < F.length; k++) g2 += F[k] * F[k];
    let eta = Math.min(state.eta, maxMove / gmax);
    let accepted = false;
    for (let tries = 0; tries < 50; tries++) {
      move(Y, F, eta, T);
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

/**
 * One explicit Euler step of the gradient flow of the normalized energy on the sphere.
 * The step is short compared with the stiffness of the configuration, so the iterates
 * follow the flow smoothly instead of jumping from one side of a valley to the other,
 * as a line search does. No point moves further than maxMove.
 * Returns the largest tangential force before the step.
 */
export function flowStep(Y, s, maxMove) {
  const { F, W } = buffers(Y.length / 3);
  accumulate(Y, s, F, W);
  const gmax = project(Y, F);
  let wmax = 0;
  for (let i = 0; i < W.length; i++) wmax = Math.max(wmax, W[i]);
  // The second derivatives of the energy are bounded by a multiple of (1 + 2q) wmax.
  const q = 1 + 0.5 * s;
  move(Y, F, Math.min(0.5 / (4 * (1 + 2 * q) * wmax), maxMove / gmax), Y);
  return gmax;
}

/** n uniformly random points on the sphere, rejecting configurations with very close pairs. */
export function randomConfiguration(n, minDistance = 0.35) {
  const Y = new Float64Array(3 * n);
  for (let attempt = 0; attempt < 400; attempt++) {
    for (let i = 0; i < n; i++) {
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
  const n = Y.length / 3;
  for (let i = 0; i < n; i++) {
    const x = Y[3 * i] + size * (2 * Math.random() - 1);
    const y = Y[3 * i + 1] + size * (2 * Math.random() - 1);
    const z = Y[3 * i + 2] + size * (2 * Math.random() - 1);
    const norm = 1 / Math.hypot(x, y, z);
    Y[3 * i] = x * norm; Y[3 * i + 1] = y * norm; Y[3 * i + 2] = z * norm;
  }
}

/**
 * Faces of the convex hull. Each face is a list of vertex indices in cyclic order.
 * Coplanar points are merged into one polygon, so the square antiprism has two squares
 * and eight triangles and the cube has six squares.
 */
export function hullFaces(Y, eps = 1e-5) {
  const n = Y.length / 3;
  const faces = new Map();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const ax = Y[3 * j] - Y[3 * i], ay = Y[3 * j + 1] - Y[3 * i + 1], az = Y[3 * j + 2] - Y[3 * i + 2];
        const bx = Y[3 * k] - Y[3 * i], by = Y[3 * k + 1] - Y[3 * i + 1], bz = Y[3 * k + 2] - Y[3 * i + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        nx /= len; ny /= len; nz /= len;
        const offset = nx * Y[3 * i] + ny * Y[3 * i + 1] + nz * Y[3 * i + 2];
        let above = 0, below = 0;
        const on = [];
        for (let m = 0; m < n && !(above && below); m++) {
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
      const key = i * 4096 + j;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  return edges;
}

/**
 * Permutation p that minimizes the sum of cost[i][p[i]], by the Hungarian algorithm.
 * cost is a square matrix.
 */
export function assignment(cost) {
  const n = cost.length;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const match = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    match[0] = i;
    let j0 = 0;
    const slack = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = match[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const reduced = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (reduced < slack[j]) { slack[j] = reduced; way[j] = j0; }
        if (slack[j] < delta) { delta = slack[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[match[j]] += delta; v[j] -= delta; } else slack[j] -= delta;
      }
      j0 = j1;
    } while (match[j0] !== 0);
    do {
      const j1 = way[j0];
      match[j0] = match[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const p = new Array(n);
  for (let j = 1; j <= n; j++) p[match[j] - 1] = j - 1;
  return p;
}

/** Permutation p minimizing the total squared distance between from[i] and to[p[i]]. */
export function bestMatching(from, to) {
  const n = from.length / 3;
  const cost = [];
  for (let i = 0; i < n; i++) {
    cost.push(new Float64Array(n));
    for (let j = 0; j < n; j++) {
      const dx = from[3 * i] - to[3 * j], dy = from[3 * i + 1] - to[3 * j + 1], dz = from[3 * i + 2] - to[3 * j + 2];
      cost[i][j] = dx * dx + dy * dy + dz * dz;
    }
  }
  return assignment(cost);
}

/** Spherical interpolation between two configurations, point by point. */
export function slerpConfiguration(from, to, t, out) {
  const n = from.length / 3;
  for (let i = 0; i < n; i++) {
    const ax = from[3 * i], ay = from[3 * i + 1], az = from[3 * i + 2];
    const bx = to[3 * i], by = to[3 * i + 1], bz = to[3 * i + 2];
    const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    const omega = Math.acos(dot);
    let x, y, z;
    if (omega < 1e-6) {
      x = bx; y = by; z = bz;
    } else if (Math.PI - omega < 1e-3) {
      // Antipodal points: rotate about an arbitrary perpendicular axis.
      let px = -ay, py = ax;
      if (Math.hypot(px, py) < 1e-6) { px = 1; py = 0; }
      const pn = 1 / Math.hypot(px, py);
      const c = Math.cos(t * Math.PI), sn = Math.sin(t * Math.PI);
      x = c * ax + sn * px * pn; y = c * ay + sn * py * pn; z = c * az;
    } else {
      const so = Math.sin(omega);
      const wa = Math.sin((1 - t) * omega) / so, wb = Math.sin(t * omega) / so;
      x = wa * ax + wb * bx; y = wa * ay + wb * by; z = wa * az + wb * bz;
    }
    const norm = 1 / Math.hypot(x, y, z);
    out[3 * i] = x * norm; out[3 * i + 1] = y * norm; out[3 * i + 2] = z * norm;
  }
  return out;
}

/** Root of an increasing function on [lo, hi] by bisection. */
export function bisect(f, lo, hi) {
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Colour two sets of points, a and b, with the groups 0 and 1. The points keep the groups
 * in current where possible. If that does not decide, the higher set gets group 0.
 * groups holds the colouring of the remaining points and is completed and returned.
 */
export function assignSides(Y, a, b, current, groups = new Array(Y.length / 3).fill(-1)) {
  const agreement = (t, u) => t.filter((m) => current[m] === 0).length + u.filter((m) => current[m] === 1).length;
  const height = (set) => set.reduce((sum, m) => sum + Y[3 * m + 2], 0);
  const kept = agreement(a, b), swapped = agreement(b, a);
  if (swapped > kept || (swapped === kept && height(b) > height(a))) [a, b] = [b, a];
  a.forEach((m) => { groups[m] = 0; });
  b.forEach((m) => { groups[m] = 1; });
  return groups;
}

/**
 * Two points are joined by a line when they are close. The line is fully drawn up to the
 * distance near and fades out until far, so nothing appears or vanishes abruptly while a
 * point moves. The two distances lie in the gap between the edges of the minimizer and
 * its other pairs. Returns [i, j, weight] triples.
 */
export function lines(Y, { near, far }) {
  const n = Y.length / 3, list = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(Y[3 * i] - Y[3 * j], Y[3 * i + 1] - Y[3 * j + 1], Y[3 * i + 2] - Y[3 * j + 2]);
      const u = Math.max(0, Math.min(1, (far - d) / (far - near)));
      const weight = u * u * (3 - 2 * u);
      if (weight > 0.01) list.push([i, j, weight]);
    }
  }
  return list;
}
