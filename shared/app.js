// The page of one problem: the sphere with its points, the line of the energy above
// the minimum, and the bar of controls. Everything that depends on the problem comes
// from its description, see for example 8-S2/src/problem.js. A problem on the
// three-sphere, like 9-S3, also has a picture that can be turned, see chart.js.

import '@fontsource-variable/inter';
import './style.css';

import { SphereScene } from './scene.js';
import { Trace } from './trace.js';
import { space } from './math.js';
import { IDENTITY, between, inverse, pushForward, transform } from './chart.js';
import { picture, sceneOptions } from './display.js';

const $ = (id) => document.getElementById(id);
const DISPLAY_TOLERANCE = 5e-10;
const MIN_SEPARATION = 0.07;
const SNAP = 0.022;
const T_COULOMB = 1 / 3;
const round2 = (value) => Math.round(value * 100) / 100;
const minus = (text) => text.replace('-', '−');

/** Clock of the moves between configurations. */
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** Clock of the relaxation: starts from rest, is fastest early on and settles slowly. */
const settle = (u) => 1 - Math.pow(1 - Math.pow(u, 1.6), 2.4);
const smooth = (u) => u * u * (3 - 2 * u);

export function start(problem) {
  const N = problem.n;
  const D = problem.dim ?? 3;
  const {
    bestMatching, descend, energy, flowStep, forces, perturb, randomConfiguration, referenceForce,
    slerpConfiguration,
  } = space(D);
  const NO_GROUPS = new Array(N).fill(-1);
  // A configuration counts as a minimizer if its energy is this close to the minimum
  // and problem.detectGroups recognizes it.
  const OPTIMAL_TOLERANCE = problem.tolerance ?? 1e-8;
  const fixedExponent = problem.exponent.fixed;
  const S_MAX = problem.exponent.max ?? 0;
  // Motions are timed for eight points. With more points the same motion is a longer path.
  const scale = Math.sqrt(N / 8);
  const view = problem.view;

  // The bar for s: the first third runs linearly from the logarithmic energy (s = 0)
  // to the Coulomb energy (s = 1), the rest grows quadratically up to S_MAX.
  const sliderToS = (t) => round2(t <= T_COULOMB ? t / T_COULOMB : 1 + (S_MAX - 1) * ((t - T_COULOMB) / (1 - T_COULOMB)) ** 2);
  const sToSlider = (s) => (s <= 1 ? s * T_COULOMB : T_COULOMB + (1 - T_COULOMB) * Math.sqrt((s - 1) / (S_MAX - 1)));

  const initial = fixedExponent ?? problem.exponent.initial;
  const state = {
    s: initial,
    minimizer: problem.minimizer(initial),
    eMin: 0,
    competitorExcess: 1,
    fRef: 1,
    Y: problem.minimizer(initial),
    groups: problem.minimizerGroups.slice(),
    // 'optimum': congruent to the minimizer. 'symmetric': the competitor in the position
    // in which problem.competitor makes it. 'free': anything else.
    mode: 'optimum',
    morph: null,
    relax: null,
    dragging: false,
    excess: 0,
    dirty: true,
    // Problems on the three-sphere only: the position of the bar that turns the picture,
    // a running change of it, and the motion that carries the minimizer of the
    // description to the place where the page shows it.
    view: view?.initial ?? 0,
    viewMove: null,
    pose: IDENTITY,
  };

  const F = new Float64Array(D * N);
  const trace = new Trace($('trace'));

  /** The frame of the picture, see chart.js. */
  const frame = () => transform(state.pose, view.frame(state.view));
  /** A configuration of the description at the place where the page shows it. */
  const posed = (Y) => (view ? transform(state.pose, Y) : Y.slice());

  // ---- scene ----------------------------------------------------------------

  let scene = null;
  try {
    scene = new SphereScene($('scene'), {
      ...sceneOptions(problem),
      handlers: {
        onInteract: () => scene.setAutoRotate(false),
        onDragStart: () => {
          state.morph = null;
          state.relax = null;
          state.dragging = true;
        },
        onDrag: (index, x, y, z) => {
          // The place in the picture, as a point of the sphere of the problem.
          const point = view ? inverse(x, y, z, frame(), new Float64Array(4)) : [x, y, z];
          for (let j = 0; j < N; j++) {
            if (j === index) continue;
            let d2 = 0;
            for (let k = 0; k < D; k++) d2 += (point[k] - state.Y[D * j + k]) ** 2;
            if (d2 < MIN_SEPARATION * MIN_SEPARATION) return;
          }
          for (let k = 0; k < D; k++) state.Y[D * index + k] = point[k];
          state.mode = 'free';
          state.dirty = true;
        },
        onDragEnd: () => {
          // The points stay where they were put. Minimize brings them back.
          state.dragging = false;
          state.dirty = true;
        },
      },
    });
  } catch (error) {
    console.error(error);
    $('fallback').hidden = false;
    $('scene').hidden = true;
  }

  // ---- energy ---------------------------------------------------------------

  /** syncSlider = false leaves the handle where the pointer holds it. */
  function setExponent(value, syncSlider = true) {
    const s = fixedExponent ?? Math.max(0, Math.min(S_MAX, round2(value)));
    state.s = s;
    state.minimizer = problem.minimizer(s);
    state.eMin = energy(state.minimizer, s);
    state.competitorExcess = energy(problem.competitor.make(s), s) - state.eMin;
    state.fRef = referenceForce(state.minimizer, s);
    // Follow the minimizer as the exponent changes.
    if (state.mode === 'optimum' && !state.morph) problem.follow?.(state.Y, state.groups, s);
    if (fixedExponent === undefined) {
      const slider = $('s-slider');
      if (syncSlider) slider.value = sToSlider(s);
      // The handle is 16px wide, so its centre runs from 8px to 8px before the end.
      slider.style.setProperty('--p', `calc(8px + (100% - 16px) * ${Number(slider.value)})`);
      $('s-value').textContent = s.toFixed(2);
      document.querySelectorAll('[data-s]').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.s) === s));
      });
    }
    $('energy-name').textContent = problem.energyName
      ?? (s === 0 ? 'Logarithmic energy' : s === 1 ? 'Coulomb energy' : 'Riesz energy');
    if (state.relax) startRelax();
    state.dirty = true;
  }

  // ---- configurations -------------------------------------------------------

  /** Move the points along great circles to the target. final = { mode, groups }. */
  function morphTo(target, final) {
    state.relax = null;
    const permutation = bestMatching(state.Y, target);
    const to = new Float64Array(D * N), groups = [];
    for (let i = 0; i < N; i++) {
      const j = permutation[i];
      for (let k = 0; k < D; k++) to[D * i + k] = target[D * j + k];
      groups.push(final.groups[j]);
    }
    state.mode = 'free';
    state.groups = groups;
    scene?.startGroupTransition(groups);
    state.morph = { from: state.Y.slice(), to, start: performance.now(), duration: 800, final: { ...final, Y: target } };
  }

  function stepMorph(now) {
    const { from, to, start, duration, final } = state.morph;
    const u = Math.min((now - start) / duration, 1);
    const eased = ease(u);
    slerpConfiguration(from, to, eased, state.Y);
    scene?.setGroupBlend(eased);
    if (u >= 1) {
      state.morph = null;
      // Relabel so that the indices are those of the target.
      state.Y = final.mode === 'optimum' ? posed(state.minimizer) : final.Y.slice();
      state.groups = final.groups.slice();
      scene?.setGroups(state.groups);
      state.mode = final.mode;
    }
    state.dirty = true;
  }

  // ---- relaxation -----------------------------------------------------------

  /**
   * The way from the current configuration down to a minimizer, recorded as a path that
   * is parametrized by its length. The path follows the gradient flow in many short
   * steps, so it has no kinks. Playing it back with an eased clock gives a smooth motion
   * whose speed does not depend on the size of the forces, which are tiny near the
   * symmetric competitor.
   */
  function descentPath() {
    const { s } = state;
    const Y = state.Y.slice();
    const frames = [Y.slice()], lengths = [0];
    let mode = state.mode;
    const record = (minimum) => {
      const last = frames[frames.length - 1];
      let d2 = 0;
      for (let k = 0; k < D * N; k++) d2 += (Y[k] - last[k]) ** 2;
      const d = Math.sqrt(d2);
      if (d < minimum) return;
      frames.push(Y.slice());
      lengths.push(lengths[lengths.length - 1] + d);
    };
    const excess = () => energy(Y, s) - state.eMin;
    for (let round = 0; round < 7; round++) {
      // Follow the flow until the forces are small, or until the energy is so close to
      // the minimum that the rest of the way cannot be seen.
      for (let step = 0; step < 60000; step++) {
        const gmax = flowStep(Y, s, 0.01);
        record(0.004 * scale);
        if (gmax < 1e-4 * state.fRef || (step % 50 === 49 && excess() <= 10 * OPTIMAL_TOLERANCE)) break;
      }
      // The rest of the way is too short to be seen. Finish it with the fast solver.
      const solver = { eta: 0.05 };
      for (let pass = 0; pass < 200; pass++) {
        const result = descend(Y, s, solver, 50);
        if (result.stalled || result.gmax < 1e-10 * state.fRef) break;
        // Where the way ends on an exact copy of the minimizer anyway, this is close enough.
        if (problem.pose && excess() <= OPTIMAL_TOLERANCE) break;
      }
      record(1e-12);
      if (excess() <= OPTIMAL_TOLERANCE) break;
      // An equilibrium that is not a minimizer. Leave it by a small move.
      if (mode === 'symmetric' && round === 0 && problem.competitor.twist) {
        // A small twist keeps the symmetry, so the competitor turns into the minimizer as a whole.
        Y.set(problem.competitor.twist(Y));
      } else {
        perturb(Y, 2e-3);
        mode = 'free';
      }
    }
    return { frames, lengths, length: lengths[lengths.length - 1], reachesMinimum: excess() <= OPTIMAL_TOLERANCE };
  }

  function startRelax() {
    state.morph = null;
    if (state.mode === 'optimum') return;
    const path = descentPath();
    // About 1.8 seconds from the competitor, a little more for longer ways and less for short ones.
    const duration = 1000 * (0.6 + 1.3 * Math.pow(path.length / scale, 0.6));
    // The structure of the configuration at the end is known already, so its colours
    // can come in gradually on the way instead of switching on arrival.
    const last = path.frames[path.frames.length - 1];
    const groups = (path.reachesMinimum && problem.detectGroups(last, state.groups)) || null;
    // On the three-sphere the picture turns on the way, so that the minimizer ends up in
    // the same place of the picture as before. A turn of the picture changes no distance.
    const poseTo = (groups && problem.pose?.(last, groups, state.pose)) || null;
    if (poseTo) {
      // The way ends on the exact copy of the minimizer, with the labels of the points as they are.
      const copy = transform(poseTo, state.minimizer), exact = new Float64Array(D * N);
      bestMatching(copy, last).forEach((m, i) => {
        for (let k = 0; k < D; k++) exact[D * m + k] = copy[D * i + k];
      });
      let d2 = 0;
      for (let k = 0; k < D * N; k++) d2 += (exact[k] - last[k]) ** 2;
      path.frames.push(exact);
      path.lengths.push(path.length + Math.sqrt(d2));
      path.length += Math.sqrt(d2);
    }
    state.relax = { ...path, groups, poseFrom: state.pose, poseTo, start: performance.now(), duration, index: 0 };
    scene?.startGroupTransition(groups || state.groups);
    state.dirty = true;
  }

  function stepRelax(now) {
    const relax = state.relax;
    const { frames, lengths } = relax;
    const u = Math.max(0, Math.min((now - relax.start) / relax.duration, 1));
    scene?.setGroupBlend(smooth(u));
    if (relax.poseTo) state.pose = u >= 1 ? relax.poseTo : between(relax.poseFrom, relax.poseTo, smooth(u));
    if (u >= 1 || frames.length === 1) {
      state.Y.set(frames[frames.length - 1]);
      state.relax = null;
      if (relax.groups) state.groups = relax.groups;
      scene?.setGroups(state.groups);
      state.mode = relax.groups ? 'optimum' : 'free';
    } else {
      const target = settle(u) * relax.length;
      let k = relax.index;
      while (k < lengths.length - 2 && lengths[k + 1] < target) k++;
      relax.index = k;
      const span = lengths[k + 1] - lengths[k];
      slerpConfiguration(frames[k], frames[k + 1], span > 0 ? (target - lengths[k]) / span : 1, state.Y);
    }
    state.dirty = true;
  }

  // ---- drawing --------------------------------------------------------------

  function formatExcess(value) {
    return value < 0.0005 ? '<0.001' : `+${value.toFixed(3)}`;
  }

  function refresh() {
    const { Y, s } = state;
    const value = energy(Y, s);
    state.excess = value - state.eMin;
    forces(Y, s, F);
    if (scene) {
      const chart = view ? frame() : null;
      const { positions, faces, edges } = picture(problem, Y, chart);
      scene.setPositions(positions);
      scene.setFaces(faces);
      scene.setEdges(edges);
      scene.setForces(view ? pushForward(Y, F, chart) : F, state.fRef);
    }
    const optimal = state.mode === 'optimum' || state.excess < DISPLAY_TOLERANCE;
    $('energy-value').textContent = Number.isFinite(value) ? minus(value.toFixed(3)) : '∞';
    $('status').dataset.state = optimal ? 'good' : 'warn';
    $('status').querySelector('.status-icon').textContent = optimal ? '✓' : '▲';
    $('status-text').textContent = optimal ? 'minimum' : formatExcess(state.excess);
    $('status').title = optimal ? 'The energy is at its global minimum' : 'Energy above the global minimum';
    $('btn-relax').disabled = Boolean(state.relax) || state.mode === 'optimum';
  }

  /**
   * Height of the energy line in [0, 1). The excess is measured in units of the excess
   * of the competitor, so that the line has the same meaning for every exponent.
   */
  function excessLevel() {
    if (state.mode === 'optimum' || state.excess < DISPLAY_TOLERANCE) return 0;
    const x = state.excess / state.competitorExcess;
    return x / (x + 3);
  }

  // ---- controls -------------------------------------------------------------

  // A handle clicks into place near a mark. This only applies while a pointer moves
  // the handle, so that the arrow keys can still step through.
  function snapping(slider, marks, onInput) {
    let pointerDown = false;
    slider.addEventListener('pointerdown', () => { pointerDown = true; });
    slider.addEventListener('keydown', () => { pointerDown = false; });
    window.addEventListener('pointerup', () => { pointerDown = false; });
    slider.addEventListener('input', () => {
      let t = Number(slider.value);
      const mark = marks.find((m) => Math.abs(t - m) < SNAP);
      if (pointerDown && mark !== undefined) {
        t = mark;
        slider.value = t;
      }
      onInput(t);
    });
  }

  if (fixedExponent === undefined) {
    document.querySelectorAll('[data-s]').forEach((button) => {
      button.addEventListener('click', () => setExponent(Number(button.dataset.s)));
    });
    snapping($('s-slider'), [T_COULOMB], (t) => setExponent(sliderToS(t), false));
  }

  /** The bar that turns the picture of the three-sphere. */
  function setView(t, syncSlider = true) {
    state.view = Math.max(0, Math.min(1, t));
    if (syncSlider) $('view-slider').value = state.view;
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.view) - state.view) < 1e-9));
    });
    state.dirty = true;
  }

  function stepView(now) {
    const { from, to, start: began, duration } = state.viewMove;
    const u = Math.min((now - began) / duration, 1);
    if (u >= 1) state.viewMove = null;
    setView(u >= 1 ? to : from + (to - from) * ease(u));
  }

  if (view) {
    snapping($('view-slider'), view.marks, (t) => {
      state.viewMove = null;
      setView(t, false);
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const to = Number(button.dataset.view);
        state.viewMove = { from: state.view, to, start: performance.now(), duration: 500 + 900 * Math.abs(to - state.view) };
      });
    });
  }

  $('btn-optimum').addEventListener('click', () => {
    morphTo(posed(state.minimizer), { mode: 'optimum', groups: problem.minimizerGroups });
  });
  $('btn-competitor').addEventListener('click', () => {
    morphTo(posed(problem.competitor.make(state.s)), { mode: 'symmetric', groups: problem.competitor.groups });
  });
  $('btn-random').addEventListener('click', () => {
    morphTo(randomConfiguration(N, problem.randomSeparation), { mode: 'free', groups: NO_GROUPS });
  });
  $('btn-relax').addEventListener('click', startRelax);

  // ---- start ----------------------------------------------------------------

  scene?.setAutoRotate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  scene?.setGroups(state.groups);
  scene?.applyColors();
  setExponent(initial);
  if (view) setView(state.view);

  window.addEventListener('resize', () => trace.invalidate());

  if (import.meta.env.DEV) window.__app = { state, scene, trace };

  function frameOfAnimation(now) {
    if (state.viewMove) stepView(now);
    if (state.morph) stepMorph(now);
    else if (state.relax && !state.dragging) stepRelax(now);
    if (state.dirty) {
      state.dirty = false;
      refresh();
    }
    trace.update(now, excessLevel());
    scene?.render();
    requestAnimationFrame(frameOfAnimation);
  }
  requestAnimationFrame(frameOfAnimation);
}
