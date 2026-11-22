// Checks the numerics for eight points against the values stated in arXiv:2609.22077.
// Run with: npm test
import assert from 'node:assert/strict';
import {
  bestMatching, descend, energy, flowStep, forces, hullEdges, hullFaces, lines, perturb, randomConfiguration,
  referenceForce,
} from '../../shared/math.js';
import {
  A_INFINITY, A_LOG, findSquares, optimalA, prism, prismParameters, problem, setAntiprismHeight,
} from '../src/problem.js';

const close = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);

// Optimal heights and minimal energies from the introduction of the paper.
const a0 = optimalA(0), a1 = optimalA(1);
close(a0, 0.3187923159, 1e-10, 'a_0');
close(a0, A_LOG, 1e-14, 'a_0 closed form');
close(a1, 0.3140893678892018673812332, 1e-14, 'a_1');
close(energy(prism(a0), 0), -10.4280177814, 1e-10, 'E_0');
close(energy(prism(a1), 1), 19.6752878612, 1e-10, 'E_1');
close(optimalA(400), A_INFINITY, 2e-3, 'a_s tends to the packing value');

// The antiprism at a_s is a critical point, and so is the cube.
const F = new Float64Array(24);
for (const s of [0, 1, 2, 6, 20]) {
  assert.ok(forces(problem.minimizer(s), s, F) < 1e-12, `antiprism is critical for s=${s}`);
  assert.ok(forces(problem.competitor.make(s), s, F) < 1e-12, `cube is critical for s=${s}`);
  assert.ok(energy(problem.competitor.make(s), s) > energy(problem.minimizer(s), s), `cube is worse for s=${s}`);
}
close(energy(prism(1 / 3, 0), 1), 19.7407740, 1e-6, 'Coulomb energy of the cube');

// Hull combinatorics, and the lines that the page draws.
const anti = hullFaces(prism(a1));
assert.equal(anti.length, 10);
assert.equal(hullEdges(anti).length, 16);
assert.deepEqual(findSquares(anti).map((f) => f.slice().sort()), [[0, 1, 2, 3], [4, 5, 6, 7]]);
const cube = hullFaces(prism(1 / 3, 0));
assert.equal(cube.length, 6);
assert.equal(hullEdges(cube).length, 12);
for (const s of [0, 1, 6, 24]) {
  const drawn = lines(problem.minimizer(s), problem.lines);
  assert.equal(drawn.length, 16, `the 16 edges are drawn for s=${s}`);
  assert.ok(drawn.every((line) => line[2] === 1), `the edges are fully drawn for s=${s}`);
}
assert.equal(lines(prism(1 / 3, 0), problem.lines).length, 12);

// Family parameters round trip.
const p = prismParameters(prism(0.4, 0.3));
close(p.a, 0.4, 1e-14, 'a round trip');
close(p.theta, 0.3, 1e-14, 'theta round trip');

// Changing the height of an antiprism gives the antiprism of the new height.
const Z = prism(0.2);
setAntiprismHeight(Z, [0, 1, 2, 3], [4, 5, 6, 7], a1);
close(energy(Z, 1), energy(prism(a1), 1), 1e-13, 'setAntiprismHeight');
const W = prism(optimalA(3));
problem.follow(W, problem.minimizerGroups, 1);
close(energy(W, 1), energy(prism(a1), 1), 1e-13, 'follow');

// The colouring of the two squares is found again.
assert.deepEqual(problem.detectGroups(prism(a1), problem.minimizerGroups), problem.minimizerGroups);
assert.equal(problem.detectGroups(randomConfiguration(8), problem.minimizerGroups), null);

// Matching the identity.
assert.deepEqual(bestMatching(prism(a1), prism(a1)), [0, 1, 2, 3, 4, 5, 6, 7]);

// Gradient descent from random starts reaches the antiprism energy.
const report = [];
for (const s of [0, 1, 2, 6, 12, 20]) {
  const target = energy(problem.minimizer(s), s);
  let worst = 0, maxIterations = 0, failures = 0;
  for (let trial = 0; trial < 40; trial++) {
    const Y = randomConfiguration(8);
    const state = { eta: 0.1 };
    let iterations = 0, kicks = 0;
    for (;;) {
      const result = descend(Y, s, state, 50, 0.05);
      iterations += 50;
      if (result.stalled || result.gmax < 1e-9) {
        if (energy(Y, s) - target > 1e-9 && kicks < 5) { perturb(Y, 1e-3); kicks++; continue; }
        break;
      }
      if (iterations > 200000) break;
    }
    const excess = energy(Y, s) - target;
    worst = Math.max(worst, Math.abs(excess));
    maxIterations = Math.max(maxIterations, iterations);
    if (excess > 1e-8) failures++;
  }
  report.push({ s, worstExcess: worst.toExponential(2), maxIterations, failures });
  assert.equal(failures, 0, `descent finds the antiprism for s=${s}`);
}
console.table(report);

// The flow steps used for the animation lower the energy at every step, from random
// starts and from a slightly twisted cube.
const flowReport = [];
for (const s of [0, 1, 6, 24]) {
  const fRef = referenceForce(problem.minimizer(s), s);
  let worstIncrease = 0, mostSteps = 0;
  for (let trial = 0; trial < 12; trial++) {
    const Y = trial === 0 ? problem.competitor.twist(problem.competitor.make(s)) : randomConfiguration(8);
    let previous = energy(Y, s, true), steps = 0;
    while (flowStep(Y, s, 0.01) >= 1e-4 * fRef && steps < 200000) {
      const current = energy(Y, s, true);
      worstIncrease = Math.max(worstIncrease, current - previous);
      previous = current;
      steps++;
    }
    mostSteps = Math.max(mostSteps, steps);
  }
  flowReport.push({ s, mostSteps, worstIncrease: worstIncrease.toExponential(1) });
  assert.ok(worstIncrease <= 1e-12, `flow steps lower the energy for s=${s}`);
  assert.ok(mostSteps < 200000, `flow reaches small forces for s=${s}`);
}
console.table(flowReport);

// Second variation of the cube along the twist: negative means the cube is a saddle.
for (const s of [0, 1, 6]) {
  const h = 1e-3;
  const second = (energy(prism(1 / 3, h), s) - 2 * energy(prism(1 / 3, 0), s) + energy(prism(1 / 3, -h), s)) / (h * h);
  assert.ok(second < 0, `the cube is a saddle for s=${s}`);
}
console.log('8-S2: all checks passed');
