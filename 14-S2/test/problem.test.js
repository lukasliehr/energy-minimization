// Checks the numerics for fourteen points against the values of the proof in
// https://github.com/lukasliehr/Thomson-14-Points. Run with: npm test
import assert from 'node:assert/strict';
import {
  assignment, bestMatching, descend, energy, flowStep, forces, hullEdges, hullFaces, lines, perturb,
  randomConfiguration, referenceForce,
} from '../../shared/math.js';
import { E_STAR, H_STAR, PRISM_HEIGHT, capped, cappedParameters, problem } from '../src/problem.js';

const close = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);
const F = new Float64Array(42);
const X = problem.minimizer(1);

// The height and the minimal energy enclosed in the proof.
close(H_STAR, 0.45536779516246300350924502372107445741075259468695, 1e-15, 'h*');
close(energy(X, 1), 69.306363296626421258489991276382007864282129573759, 1e-12, 'E(X(h*))');
close(energy(X, 1), E_STAR, 1e-12, 'E*');
assert.ok(forces(X, 1, F) < 1e-13, 'X(h*) is a critical point');

// h* is the critical height of the family X(h).
const slope = (h) => (energy(capped(h + 1e-6), 1) - energy(capped(h - 1e-6), 1)) / 2e-6;
assert.ok(slope(H_STAR - 1e-4) < 0 && slope(H_STAR + 1e-4) > 0, 'h* is a minimum of h -> E(X(h))');

// The nine inner products of X(h*) listed in the paper.
const h2 = H_STAR * H_STAR, half = (Math.sqrt(3) / 2) * (1 - h2);
const expected = [-1, H_STAR, -H_STAR, (1 + h2) / 2, (3 * h2 - 1) / 2, 2 * h2 - 1, -h2 + half, -h2, -h2 - half];
for (let i = 0; i < 14; i++) {
  for (let j = i + 1; j < 14; j++) {
    const inner = X[3 * i] * X[3 * j] + X[3 * i + 1] * X[3 * j + 1] + X[3 * i + 2] * X[3 * j + 2];
    assert.ok(expected.some((value) => Math.abs(value - inner) < 1e-12), `inner product ${inner} of points ${i}, ${j}`);
  }
}

// The competitor: the prism with caps is a critical point with more energy, and a saddle.
const prism = problem.competitor.make(1);
close(PRISM_HEIGHT, 0.462397, 1e-6, 'height of the prism');
close(energy(prism, 1) - E_STAR, 0.061987, 1e-6, 'excess of the prism');
assert.ok(forces(prism, 1, F) < 1e-8, 'the prism is a critical point');
const t = 1e-3;
const second = (energy(capped(PRISM_HEIGHT, t), 1) - 2 * energy(prism, 1) + energy(capped(PRISM_HEIGHT, -t), 1)) / (t * t);
assert.ok(second < 0, 'the prism is a saddle along the twist');
const twisted = cappedParameters(problem.competitor.twist(prism));
close(twisted.h, PRISM_HEIGHT, 1e-12, 'the twist keeps the height');
close(twisted.theta, 0.008, 1e-12, 'the twist');

// Hull combinatorics, and the lines that the page draws.
const faces = hullFaces(X);
assert.equal(faces.length, 24);
assert.ok(faces.every((face) => face.length === 3));
assert.equal(hullEdges(faces).length, 36);
const drawn = lines(X, problem.lines);
assert.equal(drawn.length, 36, 'the 36 edges are drawn');
assert.ok(drawn.every((line) => line[2] === 1), 'the edges are fully drawn');
assert.equal(lines(prism, problem.lines).filter((line) => line[2] > 0.1).length, 30, 'the 30 edges of the prism are drawn');

// The colouring of the poles and the hexagons is found again, also after a relabelling.
assert.deepEqual(problem.detectGroups(X, problem.minimizerGroups), problem.minimizerGroups);
const order = [5, 9, 0, 13, 2, 7, 1, 11, 3, 8, 12, 4, 10, 6];
const shuffled = new Float64Array(42);
order.forEach((from, to) => shuffled.set(X.subarray(3 * from, 3 * from + 3), 3 * to));
const found = problem.detectGroups(shuffled, new Array(14).fill(-1));
assert.deepEqual(found, order.map((from) => problem.minimizerGroups[from]));
assert.equal(problem.detectGroups(randomConfiguration(14, 0.28), problem.minimizerGroups), null);

// The matching of two configurations is optimal: compare with all permutations for six points.
for (let trial = 0; trial < 50; trial++) {
  const cost = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => Math.random()));
  const total = assignment(cost).reduce((sum, j, i) => sum + cost[i][j], 0);
  let best = Infinity;
  const permute = (a, k) => {
    if (k === 6) { best = Math.min(best, a.reduce((sum, j, i) => sum + cost[i][j], 0)); return; }
    for (let i = k; i < 6; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      permute(a, k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  permute([0, 1, 2, 3, 4, 5], 0);
  close(total, best, 1e-12, 'assignment');
}
assert.deepEqual(bestMatching(X, X), [...Array(14).keys()]);

// The relaxation of the page, from random starts and from the twisted prism: the flow
// lowers the energy at every step and ends at the energy of X(h*).
const fRef = referenceForce(X, 1);
let worstIncrease = 0, worstExcess = 0, mostSteps = 0;
for (let trial = 0; trial < 30; trial++) {
  const Y = trial === 0 ? problem.competitor.twist(prism) : randomConfiguration(14, problem.randomSeparation);
  let steps = 0;
  for (let round = 0; round < 7; round++) {
    let previous = energy(Y, 1, true);
    while (flowStep(Y, 1, 0.01) >= 1e-4 * fRef && steps < 400000) {
      const current = energy(Y, 1, true);
      worstIncrease = Math.max(worstIncrease, current - previous);
      previous = current;
      steps++;
    }
    const solver = { eta: 0.05 };
    for (let pass = 0; pass < 400; pass++) {
      const result = descend(Y, 1, solver, 50);
      if (result.stalled || result.gmax < 1e-10 * fRef) break;
    }
    if (energy(Y, 1) - E_STAR <= 1e-8) break;
    perturb(Y, 2e-3);
  }
  worstExcess = Math.max(worstExcess, Math.abs(energy(Y, 1) - E_STAR));
  mostSteps = Math.max(mostSteps, steps);
  assert.ok(problem.detectGroups(Y, problem.minimizerGroups), 'the end of the relaxation is a bicapped antiprism');
}
console.table([{ n: 14, mostSteps, worstIncrease: worstIncrease.toExponential(1), worstExcess: worstExcess.toExponential(2) }]);
assert.ok(worstIncrease <= 1e-12, 'flow steps lower the energy');
assert.ok(worstExcess <= 1e-8, 'the relaxation finds X(h*)');
console.log('14-S2: all checks passed');
