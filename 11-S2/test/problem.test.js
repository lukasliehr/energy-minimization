// Checks the numerics for eleven points against the statement of the proof in
// https://github.com/lukasliehr/Thomson-11-Points. Run with: npm test
import assert from 'node:assert/strict';
import {
  bestMatching, descend, energy, flowStep, forces, hullEdges, hullFaces, lines, perturb, randomConfiguration,
  referenceForce,
} from '../../shared/math.js';
import { EDGE_GAP, MINIMIZER, PENTAGON_HEIGHTS, pentagons, problem } from '../src/problem.js';

const F = new Float64Array(33);
const X = problem.minimizer(1);
const E = energy(X, 1);

// The energy lies in the interval of the theorem, and the table is a critical point.
assert.ok(E > 40.59644951 && E <= 40.59645051, `E = ${E}`);
assert.ok(Math.abs(E - 40.5964505082) < 1e-9, `E = ${E}`);
assert.ok(forces(X, 1, F) < 1e-12, 'the table is a critical point');
for (let i = 0; i < 11; i++) {
  assert.ok(Math.abs(Math.hypot(X[3 * i], X[3 * i + 1], X[3 * i + 2]) - 1) < 1e-14, `point ${i} is on the sphere`);
}

// Upright: point 0 is on top, and a rotation of 180 degrees about the vertical axis
// maps the configuration to itself.
assert.ok(Math.abs(X[2] - 1) < 1e-14);
const turned = Float64Array.from(X, (x, k) => (k % 3 === 2 ? x : -x));
const image = bestMatching(turned, X);
let worst = 0;
for (let i = 0; i < 11; i++) {
  for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(turned[3 * i + k] - X[3 * image[i] + k]));
}
assert.ok(worst < 1e-9, `the half turn is a symmetry up to ${worst}`);
assert.ok(image.every((j, i) => problem.minimizerGroups[j] === problem.minimizerGroups[i]), 'the half turn keeps the groups');

// The hull is an icosahedron with one edge contracted: 18 triangles, 27 edges, one point
// with six neighbours, two with four and eight with five.
const faces = hullFaces(X);
assert.equal(faces.length, 18);
const edges = hullEdges(faces);
assert.equal(edges.length, 27);
const degree = new Array(11).fill(0);
edges.forEach(([i, j]) => { degree[i]++; degree[j]++; });
assert.deepEqual(degree.slice().sort(), [4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6]);
assert.equal(degree[0], 6, 'the point on the axis has six neighbours');

// The lines that the page draws are these edges, fully drawn.
assert.ok(EDGE_GAP[0] < problem.lines.near && problem.lines.far < EDGE_GAP[1], `gap ${EDGE_GAP}`);
const drawn = lines(X, problem.lines);
assert.equal(drawn.length, 27);
assert.ok(drawn.every((line) => line[2] === 1));

// The competitor: a critical point with more energy and 25 edges.
const competitor = problem.competitor.make(1);
assert.ok(forces(competitor, 1, F) < 1e-7, 'the pentagons are a critical point');
assert.ok(Math.abs(energy(competitor, 1) - E - 0.018667) < 1e-6, `excess ${energy(competitor, 1) - E}`);
assert.ok(Math.abs(PENTAGON_HEIGHTS[0] - 0.394275) < 1e-6 && Math.abs(PENTAGON_HEIGHTS[1] + 0.588965) < 1e-6);
assert.equal(lines(competitor, problem.lines).length, 25);
assert.equal(hullEdges(hullFaces(pentagons(...PENTAGON_HEIGHTS))).length, 25);

// The groups are found again after a relabelling and a reflection.
assert.deepEqual(problem.detectGroups(X), problem.minimizerGroups);
const order = [5, 9, 0, 2, 7, 1, 10, 3, 8, 4, 6];
const shuffled = new Float64Array(33);
order.forEach((from, to) => {
  shuffled[3 * to] = -X[3 * from + 1]; shuffled[3 * to + 1] = X[3 * from + 2]; shuffled[3 * to + 2] = X[3 * from];
});
assert.deepEqual(problem.detectGroups(shuffled), order.map((from) => problem.minimizerGroups[from]));
assert.equal(problem.detectGroups(competitor), null);
assert.equal(problem.detectGroups(randomConfiguration(11, 0.3)), null);
assert.ok(MINIMIZER !== X, 'minimizer() returns a copy');

// The relaxation of the page, from random starts and from the disturbed competitor: the
// flow lowers the energy at every step and ends at the minimizer.
const fRef = referenceForce(X, 1);
let worstIncrease = 0, worstExcess = 0, mostSteps = 0;
for (let trial = 0; trial < 40; trial++) {
  const Y = trial === 0 ? competitor.slice() : randomConfiguration(11, problem.randomSeparation);
  if (trial === 0) perturb(Y, 2e-3);
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
    if (energy(Y, 1) - E <= 1e-8) break;
    perturb(Y, 2e-3);
  }
  worstExcess = Math.max(worstExcess, Math.abs(energy(Y, 1) - E));
  mostSteps = Math.max(mostSteps, steps);
  assert.ok(problem.detectGroups(Y), 'the end of the relaxation is a copy of the minimizer');
}
console.table([{ n: 11, mostSteps, worstIncrease: worstIncrease.toExponential(1), worstExcess: worstExcess.toExponential(2) }]);
assert.ok(worstIncrease <= 1e-12, 'flow steps lower the energy');
assert.ok(worstExcess <= 1e-8, 'the relaxation finds the minimizer');
console.log('11-S2: all checks passed');
