// The three-sphere S^3 drawn as a solid ball.
//
// A frame consists of four orthonormal vectors of R^4, stored one after the other in a
// Float64Array of length 16: the centre c of the picture and the three directions that
// become the x-, y- and z-axis. A point y of S^3 at the angle theta from c is drawn at
// the distance theta / pi from the centre of the ball, in the direction in which y lies
// as seen from c. So distances from c are true to scale, great circles through c are
// straight lines through the centre of the ball, and the point opposite to c is spread
// over the whole boundary of the ball.
//
// A motion of S^3 is a 4 x 4 orthogonal matrix, stored row by row in a Float64Array of
// length 16.

/** The picture of the points of Y, a Float64Array with three coordinates for each point. */
export function image(Y, frame, out = new Float64Array((3 * Y.length) / 4)) {
  for (let i = 0; i < Y.length / 4; i++) imagePoint(Y, 4 * i, frame, out, 3 * i);
  return out;
}

function imagePoint(Y, o, frame, out, p) {
  let c = 0, x = 0, y = 0, z = 0;
  for (let k = 0; k < 4; k++) {
    c += Y[o + k] * frame[k];
    x += Y[o + k] * frame[4 + k];
    y += Y[o + k] * frame[8 + k];
    z += Y[o + k] * frame[12 + k];
  }
  const sine = Math.hypot(x, y, z);
  if (sine < 1e-12) {
    // The centre itself, or the point opposite to it, which has no direction: put it on top.
    out[p] = 0; out[p + 1] = 0; out[p + 2] = c < 0 ? 1 : 0;
    return;
  }
  const scale = Math.atan2(sine, c) / (Math.PI * sine);
  out[p] = scale * x; out[p + 1] = scale * y; out[p + 2] = scale * z;
}

/** The point of S^3 that is drawn at the place (x, y, z) of the ball, written to out at offset o. */
export function inverse(x, y, z, frame, out, o = 0) {
  const r = Math.hypot(x, y, z);
  const theta = Math.PI * Math.min(r, 0.999);
  const c = Math.cos(theta), scale = r > 1e-12 ? Math.sin(theta) / r : 0;
  for (let k = 0; k < 4; k++) {
    out[o + k] = c * frame[k] + scale * (x * frame[4 + k] + y * frame[8 + k] + z * frame[12 + k]);
  }
  return out;
}

/**
 * The picture of the shorter arc of the great circle from point i to point j of Y: a
 * list of pieces, each a list of numbers x, y, z, x, y, z, ... The arc has two pieces if
 * it passes through the boundary of the ball. It leaves the ball there and comes back
 * in at the opposite place.
 */
export function arc(Y, i, j, frame, segments = 32) {
  let dot = 0;
  for (let k = 0; k < 4; k++) dot += Y[4 * i + k] * Y[4 * j + k];
  const omega = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sine = Math.sin(omega);
  const y = new Float64Array(4), p = new Float64Array(3);
  const pieces = [[]];
  let last = null;
  for (let m = 0; m <= segments; m++) {
    const t = m / segments;
    const wa = sine > 1e-9 ? Math.sin((1 - t) * omega) / sine : 1 - t;
    const wb = sine > 1e-9 ? Math.sin(t * omega) / sine : t;
    let norm2 = 0;
    for (let k = 0; k < 4; k++) {
      y[k] = wa * Y[4 * i + k] + wb * Y[4 * j + k];
      norm2 += y[k] * y[k];
    }
    const scale = 1 / Math.sqrt(norm2);
    for (let k = 0; k < 4; k++) y[k] *= scale;
    imagePoint(y, 0, frame, p, 0);
    const r = Math.hypot(p[0], p[1], p[2]);
    if (r > 0.9995) continue;                       // the boundary itself has no place
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 0.5) {
      // Through the boundary: end this piece on the boundary and start the next one there.
      const lr = Math.hypot(last[0], last[1], last[2]);
      pieces[pieces.length - 1].push(last[0] / lr, last[1] / lr, last[2] / lr);
      pieces.push([p[0] / r, p[1] / r, p[2] / r]);
    }
    pieces[pieces.length - 1].push(p[0], p[1], p[2]);
    last = [p[0], p[1], p[2]];
  }
  return pieces.filter((piece) => piece.length >= 6);
}

/**
 * The pictures of tangent vectors: F holds a tangent vector at each point of Y, and out
 * receives for each point a vector of the same length in the direction in which the
 * picture of the point starts to move.
 */
export function pushForward(Y, F, frame, out = new Float64Array((3 * Y.length) / 4)) {
  const moved = new Float64Array(4), p = new Float64Array(3), q = new Float64Array(3);
  for (let i = 0; i < Y.length / 4; i++) {
    const length = Math.hypot(F[4 * i], F[4 * i + 1], F[4 * i + 2], F[4 * i + 3]);
    out[3 * i] = 0; out[3 * i + 1] = 0; out[3 * i + 2] = 0;
    if (!(length > 1e-14)) continue;
    const step = 1e-4 / length;
    let norm2 = 0;
    for (let k = 0; k < 4; k++) {
      moved[k] = Y[4 * i + k] + step * F[4 * i + k];
      norm2 += moved[k] * moved[k];
    }
    for (let k = 0; k < 4; k++) moved[k] /= Math.sqrt(norm2);
    imagePoint(Y, 4 * i, frame, p, 0);
    imagePoint(moved, 0, frame, q, 0);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (!(d > 1e-14) || d > 0.1) continue;          // no direction at the boundary
    for (let k = 0; k < 3; k++) out[3 * i + k] = ((q[k] - p[k]) / d) * length;
  }
  return out;
}

// ---- motions of S^3 -------------------------------------------------------

export const IDENTITY = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The vectors of Y, four coordinates each, moved by the matrix W. Works for frames too. */
export function transform(W, Y, out = new Float64Array(Y.length)) {
  for (let o = 0; o < Y.length; o += 4) {
    const a = Y[o], b = Y[o + 1], c = Y[o + 2], d = Y[o + 3];
    for (let r = 0; r < 4; r++) out[o + r] = W[4 * r] * a + W[4 * r + 1] * b + W[4 * r + 2] * c + W[4 * r + 3] * d;
  }
  return out;
}

/** Make the columns of M orthonormal, by the method of Gram and Schmidt. */
export function orthonormalize(M) {
  for (let c = 0; c < 4; c++) {
    for (let b = 0; b < c; b++) {
      let dot = 0;
      for (let r = 0; r < 4; r++) dot += M[4 * r + c] * M[4 * r + b];
      for (let r = 0; r < 4; r++) M[4 * r + c] -= dot * M[4 * r + b];
    }
    let norm2 = 0;
    for (let r = 0; r < 4; r++) norm2 += M[4 * r + c] * M[4 * r + c];
    const scale = 1 / Math.sqrt(norm2);
    for (let r = 0; r < 4; r++) M[4 * r + c] *= scale;
  }
  return M;
}

/** A motion between W0 (u = 0) and W1 (u = 1). Both must have the same determinant. */
export function between(W0, W1, u) {
  const M = new Float64Array(16);
  for (let k = 0; k < 16; k++) M[k] = (1 - u) * W0[k] + u * W1[k];
  return orthonormalize(M);
}

export function determinant(M) {
  const m = (r, c) => M[4 * r + c];
  const minor = (r0, r1, c0, c1) => m(r0, c0) * m(r1, c1) - m(r0, c1) * m(r1, c0);
  // Expansion along the first two rows.
  return minor(0, 1, 0, 1) * minor(2, 3, 2, 3) - minor(0, 1, 0, 2) * minor(2, 3, 1, 3)
    + minor(0, 1, 0, 3) * minor(2, 3, 1, 2) + minor(0, 1, 1, 2) * minor(2, 3, 0, 3)
    - minor(0, 1, 1, 3) * minor(2, 3, 0, 2) + minor(0, 1, 2, 3) * minor(2, 3, 0, 1);
}

/** The trace of the product of the transpose of A with B: large when A and B are close. */
export function closeness(A, B) {
  let sum = 0;
  for (let k = 0; k < 16; k++) sum += A[k] * B[k];
  return sum;
}
