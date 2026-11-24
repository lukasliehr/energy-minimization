// Energy minimization on spheres: energies, forces, relaxation and a little geometry
// for configurations of n points on the unit sphere of R^dim. A configuration is a
// Float64Array of length dim * n holding the coordinates of the points one after the
// other. space(dim) gives the functions for one dimension. The functions for the
// ordinary sphere, dim = 3, are also exported directly. Everything specific to one
// problem lives in the folder of that problem.

/** Riesz kernel as a function of the squared distance. s = 0 is the logarithmic kernel. */
export function kernel(d2, s) {
  return s === 0 ? -0.5 * Math.log(d2) : Math.pow(d2, -0.5 * s);
}

/** Normalized kernel (d^{-s} - 1)/s, which tends to -log d as s tends to 0. */
export function kernelNorm(d2, s) {
  const l = -0.5 * Math.log(d2);
  return s === 0 ? l : Math.expm1(s * l) / s;
}

const spaces = new Map();

/** The functions for configurations on the unit sphere of R^dim. */
export function space(dim) {
  if (!spaces.has(dim)) spaces.set(dim, functionsFor(dim));
  return spaces.get(dim);
}

function functionsFor(dim) {
  const D = dim;

  function squaredDistance(Y, i, j) {
    let d2 = 0;
    for (let k = 0; k < D; k++) {
      const d = Y[D * i + k] - Y[D * j + k];
      d2 += d * d;
    }
    return d2;
  }

  /** Riesz s-energy E_s(Y). With normalized = true every pair contributes (d^{-s} - 1)/s. */
  function energy(Y, s, normalized = false) {
    const n = Y.length / D;
    let e = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d2 = squaredDistance(Y, i, j);
        e += normalized ? kernelNorm(d2, s) : kernel(d2, s);
      }
    }
    return e;
  }

  /** The pairwise distances as [i, j, distance] triples. */
  function pairDistances(Y) {
    const n = Y.length / D, out = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) out.push([i, j, Math.sqrt(squaredDistance(Y, i, j))]);
    }
    return out;
  }

  /** The distances from point i to the other points, in increasing order. */
  function profile(Y, i) {
    const n = Y.length / D, distances = [];
    for (let j = 0; j < n; j++) {
      if (j !== i) distances.push(Math.sqrt(squaredDistance(Y, i, j)));
    }
    return distances.sort((a, b) => a - b);
  }

  // Work arrays, one set for every number of points.
  const work = new Map();
  function buffers(n) {
    if (!work.has(n)) work.set(n, { F: new Float64Array(D * n), T: new Float64Array(D * n), W: new Float64Array(n) });
    return work.get(n);
  }
  const difference = new Float64Array(D);

  /**
   * Pair forces of the normalized energy summed for each point, without the projection
   * onto the tangent spaces. W, if given, receives the sum of the pair weights of each point.
   */
  function accumulate(Y, s, F, W) {
    const n = Y.length / D, q = 1 + 0.5 * s;
    F.fill(0);
    if (W) W.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let d2 = 0;
        for (let k = 0; k < D; k++) {
          difference[k] = Y[D * i + k] - Y[D * j + k];
          d2 += difference[k] * difference[k];
        }
        const w = Math.pow(d2, -q);
        for (let k = 0; k < D; k++) {
          F[D * i + k] += w * difference[k];
          F[D * j + k] -= w * difference[k];
        }
        if (W) { W[i] += w; W[j] += w; }
      }
    }
  }

  /** Project F onto the tangent spaces at the points of Y. Returns the largest norm. */
  function project(Y, F) {
    const n = Y.length / D;
    let gmax = 0;
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let k = 0; k < D; k++) r += F[D * i + k] * Y[D * i + k];
      let norm2 = 0;
      for (let k = 0; k < D; k++) {
        F[D * i + k] -= r * Y[D * i + k];
        norm2 += F[D * i + k] * F[D * i + k];
      }
      gmax = Math.max(gmax, Math.sqrt(norm2));
    }
    return gmax;
  }

  /** Put every point back on the sphere. */
  function normalize(Y) {
    const n = Y.length / D;
    for (let i = 0; i < n; i++) {
      let norm2 = 0;
      for (let k = 0; k < D; k++) norm2 += Y[D * i + k] * Y[D * i + k];
      const scale = 1 / Math.sqrt(norm2);
      for (let k = 0; k < D; k++) Y[D * i + k] *= scale;
    }
  }

  /** Move every point by step times its force and put it back on the sphere. */
  function move(Y, F, step, out) {
    for (let k = 0; k < Y.length; k++) out[k] = Y[k] + step * F[k];
    normalize(out);
  }

  /**
   * Tangential force on each point, that is, minus the gradient of the normalized
   * energy projected onto the tangent spaces of the sphere. Returns the largest norm.
   */
  function forces(Y, s, F) {
    accumulate(Y, s, F, null);
    return project(Y, F);
  }

  /** Magnitude of the force between the two closest points of Y. It sets the scale of the arrows. */
  function referenceForce(Y, s) {
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
  function descend(Y, s, state, iterations, maxMove = Infinity) {
    const { F, T } = buffers(Y.length / D);
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
  function flowStep(Y, s, maxMove) {
    const { F, W } = buffers(Y.length / D);
    accumulate(Y, s, F, W);
    const gmax = project(Y, F);
    let wmax = 0;
    for (let i = 0; i < W.length; i++) wmax = Math.max(wmax, W[i]);
    // The second derivatives of the energy are bounded by a multiple of (1 + 2q) wmax.
    const q = 1 + 0.5 * s;
    move(Y, F, Math.min(0.5 / (4 * (1 + 2 * q) * wmax), maxMove / gmax), Y);
    return gmax;
  }

  /** A standard normal random number. */
  function gauss() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  }

  /** n uniformly random points on the sphere, rejecting configurations with very close pairs. */
  function randomConfiguration(n, minDistance = 0.35) {
    const Y = new Float64Array(D * n);
    for (let attempt = 0; attempt < 400; attempt++) {
      for (let k = 0; k < Y.length; k++) Y[k] = gauss();
      normalize(Y);
      if (pairDistances(Y).every((p) => p[2] >= minDistance)) break;
    }
    return Y;
  }

  /** Move every point by a random vector of the given size and put it back on the sphere. */
  function perturb(Y, size) {
    for (let k = 0; k < Y.length; k++) Y[k] += size * (2 * Math.random() - 1);
    normalize(Y);
  }

  /** Permutation p minimizing the total squared distance between from[i] and to[p[i]]. */
  function bestMatching(from, to) {
    const n = from.length / D;
    const cost = [];
    for (let i = 0; i < n; i++) {
      cost.push(new Float64Array(n));
      for (let j = 0; j < n; j++) {
        let d2 = 0;
        for (let k = 0; k < D; k++) {
          const d = from[D * i + k] - to[D * j + k];
          d2 += d * d;
        }
        cost[i][j] = d2;
      }
    }
    return assignment(cost);
  }

  /** Interpolation along great circles between two configurations, point by point. */
  function slerpConfiguration(from, to, t, out) {
    const n = from.length / D;
    const side = new Float64Array(D);
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let k = 0; k < D; k++) dot += from[D * i + k] * to[D * i + k];
      dot = Math.max(-1, Math.min(1, dot));
      const omega = Math.acos(dot);
      if (omega < 1e-6) {
        for (let k = 0; k < D; k++) out[D * i + k] = to[D * i + k];
      } else if (Math.PI - omega < 1e-3) {
        // Antipodal points: go round through a direction perpendicular to the first point.
        let least = 0;
        for (let k = 1; k < D; k++) {
          if (Math.abs(from[D * i + k]) < Math.abs(from[D * i + least])) least = k;
        }
        let norm2 = 0;
        for (let k = 0; k < D; k++) {
          side[k] = (k === least ? 1 : 0) - from[D * i + least] * from[D * i + k];
          norm2 += side[k] * side[k];
        }
        const scale = 1 / Math.sqrt(norm2);
        const c = Math.cos(t * Math.PI), sn = Math.sin(t * Math.PI);
        for (let k = 0; k < D; k++) out[D * i + k] = c * from[D * i + k] + sn * scale * side[k];
      } else {
        const so = Math.sin(omega);
        const wa = Math.sin((1 - t) * omega) / so, wb = Math.sin(t * omega) / so;
        for (let k = 0; k < D; k++) out[D * i + k] = wa * from[D * i + k] + wb * to[D * i + k];
      }
    }
    normalize(out);
    return out;
  }

  /**
   * Two points are joined by a line when they are close. The line is fully drawn up to the
   * distance near and fades out until far, so nothing appears or vanishes abruptly while a
   * point moves. The two distances lie in the gap between the edges of the minimizer and
   * its other pairs. Returns [i, j, weight] triples.
   */
  function lines(Y, { near, far }) {
    const n = Y.length / D, list = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.sqrt(squaredDistance(Y, i, j));
        const u = Math.max(0, Math.min(1, (far - d) / (far - near)));
        const weight = u * u * (3 - 2 * u);
        if (weight > 0.01) list.push([i, j, weight]);
      }
    }
    return list;
  }

  return {
    dim: D, energy, pairDistances, profile, forces, referenceForce, descend, flowStep, randomConfiguration,
    perturb, bestMatching, slerpConfiguration, lines,
  };
}

// The ordinary sphere in three dimensions.
export const {
  energy, pairDistances, profile, forces, referenceForce, descend, flowStep, randomConfiguration, perturb,
  bestMatching, slerpConfiguration, lines,
} = space(3);

/**
 * Faces of the convex hull of points in three dimensions. Each face is a list of vertex
 * indices in cyclic order. Coplanar points are merged into one polygon, so the square
 * antiprism has two squares and eight triangles and the cube has six squares.
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
 * Colour two sets of points on the ordinary sphere, a and b, with the groups 0 and 1.
 * The points keep the groups in current where possible. If that does not decide, the
 * higher set gets group 0. groups holds the colouring of the remaining points and is
 * completed and returned.
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
