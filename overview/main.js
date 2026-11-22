// The overview: one small turning figure for each problem, which leads to its page.
// To add a problem, import its description here and add a tile to index.html.

import '@fontsource-variable/inter';
import '../shared/style.css';
import './style.css';

import { SphereScene } from '../shared/scene.js';
import { hullFaces, lines } from '../shared/math.js';
import { problem as eightPoints } from '../8-S2/src/problem.js';
import { problem as fourteenPoints } from '../14-S2/src/problem.js';

const problems = { '8-S2': eightPoints, '14-S2': fourteenPoints };
const turning = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scenes = [];

for (const canvas of document.querySelectorAll('canvas[data-problem]')) {
  const problem = problems[canvas.dataset.problem];
  const minimizer = problem.minimizer(problem.exponent.fixed ?? problem.exponent.initial);
  try {
    const scene = new SphereScene(canvas, {
      count: problem.n,
      groupColors: problem.groupColors,
      pointRadius: problem.pointRadius,
      interactive: false,
    });
    scene.applyColors();
    scene.setGroups(problem.minimizerGroups);
    scene.setPositions(minimizer);
    scene.setFaces(hullFaces(minimizer));
    scene.setEdges(lines(minimizer, problem.lines));
    scene.setAutoRotate(turning);
    scenes.push(scene);
  } catch (error) {
    // Without WebGL the tile still shows its label and leads to the page.
    console.error(error);
  }
}

function frame() {
  for (const scene of scenes) scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
