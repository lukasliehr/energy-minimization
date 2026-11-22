// The page of one problem: the sphere with its points, the line of the energy above
// the minimum, and the bar of controls. Everything that depends on the number of
// points comes from the description of the problem, see for example 8-S2/src/problem.js.

import '@fontsource-variable/inter';
import './style.css';

import { SphereScene } from './scene.js';
import { Trace } from './trace.js';
import {
  bestMatching, descend, energy, flowStep, forces, hullFaces, lines, perturb, randomConfiguration,
  referenceForce, slerpConfiguration,
} from './math.js';

const $ = (id) => document.getElementById(id);
const OPTIMAL_TOLERANCE = 1e-8;
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

export function start(problem) {
  const N = problem.n;
  const NO_GROUPS = new Array(N).fill(-1);
  const fixedExponent = problem.exponent.fixed;
  const S_MAX = problem.exponent.max ?? 0;
  // Motions are timed for eight points. With more points the same motion is a longer path.
  const scale = Math.sqrt(N / 8);

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
  };

  const F = new Float64Array(3 * N);
  const trace = new Trace($('trace'));

  // ---- scene ----------------------------------------------------------------

  let scene = null;
  try {
    scene = new SphereScene($('scene'), {
      count: N,
      groupColors: problem.groupColors,
      pointRadius: problem.pointRadius,
      handlers: {
        onInteract: () => scene.setAutoRotate(false),
        onDragStart: () => {
          state.morph = null;
          state.relax = null;
          state.dragging = true;
        },
        onDrag: (index, x, y, z) => {
          for (let j = 0; j < N; j++) {
            if (j === index) continue;
            if (Math.hypot(x - state.Y[3 * j], y - state.Y[3 * j + 1], z - state.Y[3 * j + 2]) < MIN_SEPARATION) return;
          }
          state.Y[3 * index] = x; state.Y[3 * index + 1] = y; state.Y[3 * index + 2] = z;
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
    $('energy-name').textContent = s === 0 ? 'Logarithmic energy' : s === 1 ? 'Coulomb energy' : 'Riesz energy';
    if (state.relax) startRelax();
    state.dirty = true;
  }

  // ---- configurations -------------------------------------------------------

  /** Move the points along great circles to the target. final = { mode, groups }. */
  function morphTo(target, final) {
    state.relax = null;
    const permutation = bestMatching(state.Y, target);
    const to = new Float64Array(3 * N), groups = [];
    for (let i = 0; i < N; i++) {
      const j = permutation[i];
      to[3 * i] = target[3 * j]; to[3 * i + 1] = target[3 * j + 1]; to[3 * i + 2] = target[3 * j + 2];
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
      state.Y = final.mode === 'optimum' ? state.minimizer.slice() : final.Y.slice();
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
      for (let k = 0; k < 3 * N; k++) d2 += (Y[k] - last[k]) ** 2;
      const d = Math.sqrt(d2);
      if (d < minimum) return;
      frames.push(Y.slice());
      lengths.push(lengths[lengths.length - 1] + d);
    };
    const excess = () => energy(Y, s) - state.eMin;
    for (let round = 0; round < 7; round++) {
      // Follow the flow until the forces are small.
      for (let step = 0; step < 60000; step++) {
        const gmax = flowStep(Y, s, 0.01);
        record(0.004 * scale);
        if (gmax < 1e-4 * state.fRef) break;
      }
      // The rest of the way is too short to be seen. Finish it with the fast solver.
      const solver = { eta: 0.05 };
      for (let pass = 0; pass < 200; pass++) {
        const result = descend(Y, s, solver, 50);
        if (result.stalled || result.gmax < 1e-10 * state.fRef) break;
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
    state.relax = { ...path, groups, start: performance.now(), duration, index: 0 };
    scene?.startGroupTransition(groups || state.groups);
    state.dirty = true;
  }

  function stepRelax(now) {
    const relax = state.relax;
    const { frames, lengths } = relax;
    const u = Math.max(0, Math.min((now - relax.start) / relax.duration, 1));
    scene?.setGroupBlend(u * u * (3 - 2 * u));
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
      scene.setPositions(Y);
      scene.setFaces(hullFaces(Y));
      scene.setEdges(lines(Y, problem.lines));
      scene.setForces(F, state.fRef);
    }
    const optimal = state.excess < DISPLAY_TOLERANCE;
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
    if (state.excess < DISPLAY_TOLERANCE) return 0;
    const x = state.excess / state.competitorExcess;
    return x / (x + 3);
  }

  // ---- controls -------------------------------------------------------------

  if (fixedExponent === undefined) {
    document.querySelectorAll('[data-s]').forEach((button) => {
      button.addEventListener('click', () => setExponent(Number(button.dataset.s)));
    });
    // Near the Coulomb mark the handle clicks into place. This only applies while a
    // pointer moves the handle, so that the arrow keys can still step through.
    let pointerOnSlider = false;
    $('s-slider').addEventListener('pointerdown', () => { pointerOnSlider = true; });
    $('s-slider').addEventListener('keydown', () => { pointerOnSlider = false; });
    window.addEventListener('pointerup', () => { pointerOnSlider = false; });
    $('s-slider').addEventListener('input', (event) => {
      const slider = event.target;
      let t = Number(slider.value);
      if (pointerOnSlider && Math.abs(t - T_COULOMB) < SNAP) {
        t = T_COULOMB;
        slider.value = t;
      }
      setExponent(sliderToS(t), false);
    });
  }

  $('btn-optimum').addEventListener('click', () => morphTo(state.minimizer, { mode: 'optimum', groups: problem.minimizerGroups }));
  $('btn-competitor').addEventListener('click', () => {
    morphTo(problem.competitor.make(state.s), { mode: 'symmetric', groups: problem.competitor.groups });
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

  window.addEventListener('resize', () => trace.invalidate());

  if (import.meta.env.DEV) window.__app = { state, scene, trace };

  function frame(now) {
    if (state.morph) stepMorph(now);
    else if (state.relax && !state.dragging) stepRelax(now);
    if (state.dirty) {
      state.dirty = false;
      refresh();
    }
    trace.update(now, excessLevel());
    scene?.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
