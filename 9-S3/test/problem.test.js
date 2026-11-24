// Checks the numerics for nine points on the three-sphere against the theorem of
// https://github.com/lukasliehr/Harmonic-Energy-9-Points-S3. Run with: npm test
import assert from 'node:assert/strict';
import { space } from '../../shared/math.js';
import {
  IDENTITY, arc, between, closeness, determinant, image, inverse, orthonormalize, pushForward, transform,
} from '../../shared/chart.js';
import { MINIMIZER, frame, problem, triangles } from '../src/problem.js';

const S3 = space(4);
const close = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);
const X = problem.minimizer();
const F = new Float64Array(36);

// The minimal energy is 35/2, and the minimizer is a critical point on the sphere.
close(S3.energy(X, 2), 35 / 2, 1e-13, 'E(X)');
assert.ok(S3.forces(X, 2, F) < 1e-13, 'X is a critical point');
for (let i = 0; i < 9; i++) close(Math.hypot(...X.subarray(4 * i, 4 * i + 4)), 1, 1e-15, `norm of point ${i}`);

// 5 sides of the pentagon, 4 sides of the square and 20 pairs across, then the diagonals.
const distances = S3.pairDistances(X).map((p) => p[2]).sort((a, b) => a - b);
close(distances[4], 2 * Math.sin(Math.PI / 5), 1e-14, 'side of the pentagon');
close(distances[5], Math.SQRT2, 1e-14, 'first pair at sqrt 2');
close(distances[28], Math.SQRT2, 1e-14, 'last pair at sqrt 2');
close(distances[29], 2 * Math.sin((2 * Math.PI) / 5), 1e-14, 'diagonal of the pentagon');
close(distances[35], 2, 1e-14, 'diagonal of the square');
const drawn = S3.lines(X, problem.lines);
assert.equal(drawn.length, 29);
assert.ok(drawn.every((line) => line[2] === 1));

// The competitor: energy 18, a critical point, 18 edges.
const competitor = problem.competitor.make();
close(S3.energy(competitor, 2), 18, 1e-12, 'energy of the triangles');
assert.ok(S3.forces(competitor, 2, F) < 1e-13, 'the triangles are a critical point');
assert.equal(S3.lines(competitor, problem.lines).length, 18);

// The frames of the picture are orthonormal, and the picture can be inverted.
for (const t of [0, 0.25, 0.5, 0.8, 1]) {
  const f = frame(t);
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += f[4 * a + k] * f[4 * b + k];
      close(dot, a === b ? 1 : 0, 1e-14, `frame(${t}) vectors ${a}, ${b}`);
    }
  }
  const Y = S3.randomConfiguration(9), P = image(Y, f), back = new Float64Array(4);
  for (let i = 0; i < 9; i++) {
    inverse(P[3 * i], P[3 * i + 1], P[3 * i + 2], f, back);
    for (let k = 0; k < 4; k++) close(back[k], Y[4 * i + k], 1e-9, `inverse of the picture at t=${t}`);
  }
}

// At the left end of the bar the pentagon is regular on the circle of radius 1/2 and the
// square is four points with equal gaps on a line through the centre.
{
  const P = image(X, frame(0));
  const at = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let k = 0; k < 5; k++) {
    close(Math.hypot(...at(k)), 0.5, 1e-14, 'radius of the pentagon');
    close(Math.hypot(...at(k).map((x, c) => x - at((k + 1) % 5)[c])), Math.sin(Math.PI / 5), 1e-14, 'side in the picture');
    close(at(k)[1], 0, 1e-14, 'the pentagon lies in a plane');
  }
  const line = [5, 6, 7, 8].map((i) => at(i)[1]).sort((a, b) => a - b);
  [-0.75, -0.25, 0.25, 0.75].forEach((y, k) => close(line[k], y, 1e-14, 'the square on its line'));
  for (const i of [5, 6, 7, 8]) close(Math.hypot(at(i)[0], at(i)[2]), 0, 1e-14, 'the square lies on a line');
}
// At the right end the square is regular and the pentagon is five points with equal gaps.
{
  const P = image(X, frame(1));
  const at = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let k = 0; k < 4; k++) {
    close(Math.hypot(...at(5 + k)), 0.5, 1e-14, 'radius of the square');
    close(Math.hypot(...at(5 + k).map((x, c) => x - at(5 + ((k + 1) % 4))[c])), Math.SQRT1_2, 1e-14, 'side in the picture');
  }
  const line = [0, 1, 2, 3, 4].map((i) => at(i)[0]).sort((a, b) => a - b);
  [-0.8, -0.4, 0, 0.4, 0.8].forEach((x, k) => close(line[k], x, 1e-14, 'the pentagon on its line'));
}
// In the middle no point comes near the boundary of the ball.
{
  const P = image(X, frame(0.5));
  for (let i = 0; i < 9; i++) assert.ok(Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2]) < 0.76);
}

// Arcs: the side of the square that passes through the boundary has two pieces, which
// end on the boundary at opposite places. The other arcs have one piece.
{
  const f = frame(0);
  const counts = drawn.map(([i, j]) => arc(X, i, j, f).length);
  assert.equal(counts.filter((c) => c === 2).length, 1);
  assert.equal(counts.filter((c) => c === 1).length, 28);
  const [i, j] = drawn[counts.indexOf(2)];
  const pieces = arc(X, i, j, f);
  const end = pieces[0].slice(-3), begin = pieces[1].slice(0, 3);
  close(Math.hypot(...end), 1, 1e-12, 'the arc ends on the boundary');
  end.forEach((x, k) => close(x, -begin[k], 1e-6, 'and comes back at the opposite place'));
}

// Tangent vectors keep their length in the picture.
{
  const Y = S3.randomConfiguration(9);
  S3.forces(Y, 2, F);
  const G = pushForward(Y, F, frame(0.5));
  for (let i = 0; i < 9; i++) {
    close(Math.hypot(G[3 * i], G[3 * i + 1], G[3 * i + 2]), Math.hypot(...F.subarray(4 * i, 4 * i + 4)), 1e-9, 'length of an arrow');
  }
}

// The groups and the pose of a copy of the minimizer.
assert.deepEqual(problem.detectGroups(X), problem.minimizerGroups);
assert.equal(problem.detectGroups(competitor), null);
assert.equal(problem.detectGroups(S3.randomConfiguration(9)), null);
{
  const same = problem.pose(X, problem.minimizerGroups, IDENTITY);
  close(closeness(same, IDENTITY), 4, 1e-12, 'the pose of the minimizer itself is the identity');
  for (let trial = 0; trial < 20; trial++) {
    // A random motion, also with determinant -1, and a relabelling.
    const R = orthonormalize(Float64Array.from({ length: 16 }, () => Math.random() - 0.5));
    const order = [...Array(9).keys()].sort(() => Math.random() - 0.5);
    const moved = transform(R, X), Y = new Float64Array(36);
    order.forEach((from, to) => Y.set(moved.subarray(4 * from, 4 * from + 4), 4 * to));
    const groups = problem.detectGroups(Y);
    assert.deepEqual(groups, order.map((from) => problem.minimizerGroups[from]));
    const U = problem.pose(Y, groups, IDENTITY);
    assert.ok(determinant(U) > 0.999, 'the pose has the determinant of the identity');
    // U maps the minimizer onto Y, and the pentagon onto the pentagon.
    const copy = transform(U, X), match = S3.bestMatching(copy, Y);
    for (let i = 0; i < 9; i++) {
      assert.equal(groups[match[i]], problem.minimizerGroups[i]);
      for (let k = 0; k < 4; k++) close(copy[4 * i + k], Y[4 * match[i] + k], 1e-9, 'pose');
    }
    // The way from the identity to U consists of motions.
    const half = between(IDENTITY, U, 0.5);
    close(S3.energy(transform(half, X), 2), 35 / 2, 1e-12, 'a motion keeps the energy');
  }
}

// The relaxation of the page, from random starts and from the disturbed competitor: the
// flow lowers the energy at every step and ends at a copy of the minimizer.
const fRef = S3.referenceForce(X, 2);
let worstIncrease = 0, worstExcess = 0, mostSteps = 0;
for (let trial = 0; trial < 40; trial++) {
  const Y = trial === 0 ? competitor.slice() : S3.randomConfiguration(9, problem.randomSeparation);
  if (trial === 0) S3.perturb(Y, 2e-3);
  let steps = 0;
  for (let round = 0; round < 7; round++) {
    let previous = S3.energy(Y, 2, true);
    while (S3.flowStep(Y, 2, 0.01) >= 1e-4 * fRef && steps < 400000) {
      const current = S3.energy(Y, 2, true);
      worstIncrease = Math.max(worstIncrease, current - previous);
      previous = current;
      steps++;
    }
    const solver = { eta: 0.05 };
    for (let pass = 0; pass < 400; pass++) {
      const result = S3.descend(Y, 2, solver, 50);
      if (result.stalled || result.gmax < 1e-10 * fRef) break;
    }
    if (S3.energy(Y, 2) - 17.5 <= 1e-8) break;
    S3.perturb(Y, 2e-3);
  }
  worstExcess = Math.max(worstExcess, Math.abs(S3.energy(Y, 2) - 17.5));
  mostSteps = Math.max(mostSteps, steps);
  const groups = problem.detectGroups(Y);
  assert.ok(groups, 'the end of the relaxation is a copy of the minimizer');
  // Its pose is a motion, and it carries the minimizer close to the relaxed points.
  const U = problem.pose(Y, groups, IDENTITY), copy = transform(U, X), match = S3.bestMatching(copy, Y);
  close(S3.energy(copy, 2), 35 / 2, 1e-12, 'the pose is a motion');
  for (let i = 0; i < 9; i++) {
    for (let k = 0; k < 4; k++) close(copy[4 * i + k], Y[4 * match[i] + k], 0.05, 'the pose fits the relaxed points');
  }
}
console.table([{ n: 9, mostSteps, worstIncrease: worstIncrease.toExponential(1), worstExcess: worstExcess.toExponential(2) }]);
assert.ok(worstIncrease <= 1e-12, 'flow steps lower the energy');
assert.ok(worstExcess <= 1e-8, 'the relaxation finds the minimizer');
assert.ok(MINIMIZER !== X && triangles().length === 36);
console.log('9-S3: all checks passed');
