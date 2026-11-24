// The overview: one small turning figure for each problem, which leads to its page.
// To add a problem, import its description here and add a tile to index.html.

import '@fontsource-variable/inter';
import '../shared/style.css';
import './style.css';

import { SphereScene } from '../shared/scene.js';
import { picture, sceneOptions } from '../shared/display.js';
import { problem as eightPoints } from '../8-S2/src/problem.js';
import { problem as elevenPoints } from '../11-S2/src/problem.js';
import { problem as fourteenPoints } from '../14-S2/src/problem.js';
import { problem as ninePointsS3 } from '../9-S3/src/problem.js';

const problems = { '8-S2': eightPoints, '11-S2': elevenPoints, '14-S2': fourteenPoints, '9-S3': ninePointsS3 };
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const overview = document.querySelector('.overview');
const tiles = [...document.querySelectorAll('.tile')];
const scenes = new Map();          // the scene of each tile that has one
let drawing = true;

for (const tile of tiles) {
  // The address in full. A relative one would change its meaning when a page opens,
  // because the window then has the address of that page.
  tile.setAttribute('href', tile.href);
  const canvas = tile.querySelector('canvas');
  const problem = problems[canvas.dataset.problem];
  const minimizer = problem.minimizer(problem.exponent.fixed ?? problem.exponent.initial);
  // A problem on the three-sphere is shown at the starting position of its bar.
  const { positions, faces, edges } = picture(problem, minimizer, problem.view?.frame(problem.view.initial));
  try {
    const scene = new SphereScene(canvas, { ...sceneOptions(problem), interactive: false });
    scene.applyColors();
    scene.setGroups(problem.minimizerGroups);
    scene.setPositions(positions);
    scene.setFaces(faces);
    scene.setEdges(edges);
    scene.setAutoRotate(!calm);
    scenes.set(tile, scene);
  } catch (error) {
    // Without WebGL the tile still shows its label and leads to the page.
    console.error(error);
  }
}

function frame() {
  if (drawing) for (const scene of scenes.values()) scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) window.__overview = { tiles, scenes };

// ---- opening a page ---------------------------------------------------------
//
// A click on a figure opens its page in a frame that lies over the overview. The other
// figures fade. The frame starts so small that the sphere of the page lies exactly on
// the sphere of the figure, seen from the same direction, and grows until the page
// fills the window. Closing the page runs the same motion backwards. The page takes
// part in this, see shared/framed.js.
//
// While a page is open the window has the address of that page. So reloading it, or
// passing the address on, gives the page itself, and the back button of the browser
// closes the page.
//
// The page is fetched already when the pointer goes down on a figure, a moment before
// the click, so that it is there sooner.

const FADE = 110;                  // the other figures go, in milliseconds, as in style.css
const GROW = 400;
const REVEAL = 120;                // the controls of the page appear this long after the frame starts to grow
const SHRINK = 400;
const SETTLE = 480;                // the same when the points of the page have to go back to the minimizer on the way
const SWAP = 80;                   // the figure takes over from the frame
const PATIENCE = 6000;             // a page that is not there by then is loaded in the ordinary way
const UNUSED = 3000;               // a page that was fetched ahead is dropped if no click follows
const EASE = 'cubic-bezier(0.6, 0, 0.2, 1)';
const EASE_OUT = 'cubic-bezier(0.3, 0, 0.1, 1)';   // starts at once and comes to rest softly

const home = window.location.href;
const title = document.title;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
let shown = null;                  // the page that is open: { tile, frame, phase, since, leaving }
let ahead = null;                  // a page that is fetched ahead of the click: { tile, frame }

// With a modifier key the browser opens the page in a new tab or window.
const plain = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

for (const tile of tiles) {
  tile.addEventListener('pointerdown', (event) => {
    if (plain(event)) prepare(tile);
  });
  tile.addEventListener('click', (event) => {
    if (!plain(event)) return;
    event.preventDefault();
    if (shown) return;
    window.history.pushState({ page: true }, '', tile.getAttribute('href'));
    open(tile);
  });
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const type = event.data?.type;
  const from = (entry) => entry && event.source === entry.frame.contentWindow;
  if (type === 'page:ready' && (from(ahead) || from(shown))) (from(ahead) ? ahead : shown).frame.dataset.ready = 'yes';
  if (!from(shown)) return;
  if (type === 'page:ready') arrive(shown);
  if (type === 'page:close') dismiss();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && shown) dismiss();
});
window.addEventListener('popstate', follow);

/** Show what the address of the window says: a page or the overview. */
function follow() {
  const address = window.location.origin + window.location.pathname;
  const tile = tiles.find((candidate) => candidate.getAttribute('href') === address);
  if (tile && !shown) open(tile);
  else if (!tile && shown) leave(shown);
}

/** Close the page because the page asks for it. */
function dismiss() {
  if (window.history.state?.page) {
    window.history.back();         // the address changes, and follow() closes the page
  } else {
    window.history.replaceState(null, '', home);
    leave(shown);
  }
}

/** A frame with the page of a tile. It cannot be seen or used until the page has arrived. */
function frameOf(tile) {
  const frame = document.createElement('iframe');
  frame.className = 'page-frame';
  frame.dataset.role = 'page';
  frame.title = tile.getAttribute('aria-label');
  frame.inert = true;
  frame.src = tile.getAttribute('href');
  document.body.append(frame);
  return frame;
}

/** Fetch the page of a tile ahead of the click that is likely to follow. */
function prepare(tile) {
  if (shown || ahead?.tile === tile) return;
  ahead?.frame.remove();
  const entry = { tile, frame: frameOf(tile) };
  ahead = entry;
  setTimeout(() => {
    if (ahead !== entry) return;
    entry.frame.remove();
    ahead = null;
  }, UNUSED);
}

function open(tile) {
  if (ahead && ahead.tile !== tile) ahead.frame.remove();
  const frame = ahead?.tile === tile ? ahead.frame : frameOf(tile);
  ahead = null;
  const page = { tile, frame, phase: 'loading', since: performance.now(), leaving: false };
  shown = page;
  tile.classList.add('chosen');
  overview.classList.add('away');
  overview.inert = true;
  if (frame.dataset.ready) arrive(page);
  // If the page does not answer, load it in the ordinary way. The window has its address already.
  setTimeout(() => {
    if (shown === page && page.phase === 'loading') window.location.reload();
  }, PATIENCE);
}

/** The transform of the frame that puts the sphere of the page on the sphere of its figure. */
function onFigure({ tile, frame }) {
  const scene = scenes.get(tile), large = frame.contentWindow.page.circle();
  if (calm || !scene || !large) return null;
  const box = tile.querySelector('canvas').getBoundingClientRect(), small = scene.circle();
  const scale = small.radius / large.radius;
  const x = box.left + small.x - scale * large.x, y = box.top + small.y - scale * large.y;
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

/** The page has drawn its first picture: put it on the figure and let it grow. */
async function arrive(page) {
  if (page.phase !== 'loading') return;
  page.phase = 'opening';
  // The other figures have to be gone before the frame covers their places.
  await wait(FADE - (performance.now() - page.since));
  const { tile, frame } = page, inside = frame.contentWindow.page;
  const start = onFigure(page);
  if (start) inside.look(scenes.get(tile).direction());
  frame.style.opacity = '1';
  tile.classList.add('covered');
  drawing = false;
  document.title = frame.contentDocument.title;
  setTimeout(() => inside.reveal(), start ? REVEAL : 0);
  const motion = start
    ? frame.animate([{ transform: start }, { transform: 'none' }], { duration: GROW, easing: EASE_OUT })
    : frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2 * FADE, easing: 'ease' });
  await motion.finished;
  page.phase = 'open';
  frame.style.pointerEvents = 'auto';
  frame.inert = false;
  frame.focus();
  if (page.leaving) leave(page);
}

/** Close the page: the frame shrinks back onto the figure, and the other figures return. */
async function leave(page) {
  if (page.phase === 'opening') {
    page.leaving = true;           // arrive() closes the page as soon as it is open
    return;
  }
  if (page.phase === 'closing') return;
  const { tile, frame } = page, arrived = page.phase === 'open';
  page.phase = 'closing';
  document.title = title;
  if (arrived) {
    const inside = frame.contentWindow.page, scene = scenes.get(tile);
    frame.style.pointerEvents = 'none';
    frame.inert = true;
    inside.conceal();
    drawing = true;
    const end = onFigure(page);
    if (end) {
      // On the way the page goes back to what the figure shows: the minimizer as at the
      // start. So the figure can take over without a jump.
      const settled = inside.restore(SETTLE);
      const motion = frame.animate([{ transform: 'none' }, { transform: end }], { duration: settled ? SETTLE : SHRINK, easing: EASE, fill: 'forwards' });
      await Promise.all([motion.finished, settled]);
      // The figure goes on from the direction in which the page shows the sphere now.
      scene.setDirection(inside.direction());
      scene.render();
    }
    tile.classList.remove('covered');
    await frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: end ? SWAP : 2 * FADE, easing: 'ease', fill: 'forwards' }).finished;
  }
  frame.remove();
  tile.classList.remove('chosen');
  overview.classList.remove('away');
  overview.inert = false;
  tile.focus({ preventScroll: true });
  shown = null;
  follow();                        // the address may have changed in the meantime
}
