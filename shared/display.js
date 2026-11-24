// What the scene draws for a configuration: the places of the points, the faces of the
// polyhedron and the lines. For a problem on the ordinary sphere the points are drawn
// where they are. For a problem on the three-sphere they are drawn inside the ball, see
// chart.js, and the lines are arcs of great circles.

import { hullFaces, space } from './math.js';
import { arc, image } from './chart.js';

/** frame is the frame of the picture, for problems on the three-sphere only. */
export function picture(problem, Y, frame) {
  const pairs = space(problem.dim ?? 3).lines(Y, problem.lines);
  if (!problem.view) return { positions: Y, faces: hullFaces(Y), edges: pairs };
  return {
    positions: image(Y, frame),
    faces: [],
    edges: pairs.map(([i, j, weight]) => [i, j, weight, arc(Y, i, j, frame)]),
  };
}

/** The options of the scene that depend on the problem. */
export function sceneOptions(problem) {
  return {
    count: problem.n,
    groupColors: problem.groupColors,
    pointRadius: problem.pointRadius,
    inside: Boolean(problem.view),
    crossWeight: problem.crossWeight ?? 1,
  };
}
