// A page inside the overview.
//
// The overview opens a page in a frame that lies over it. The frame grows out of the
// figure that was clicked, see overview/main.js. For this the page tells the overview
// when its first picture is drawn, says where its sphere is, takes over the direction
// from which the figure is seen, and shows its controls only when it has nearly arrived.
// While it closes, it goes back to what the figure shows. A page that is opened by its
// own address does none of this.

/** Whether the overview shows this page in its frame. */
function framed() {
  try {
    return window.frameElement?.dataset.role === 'page';
  } catch {
    return false;
  }
}

/**
 * scene is the three-dimensional view of the page, or null if there is none.
 * restore(duration) brings the page back to what it showed at first, see app.js.
 */
export function connect(scene, { restore }) {
  if (!framed()) return;
  const root = document.documentElement;
  const say = (type) => window.parent.postMessage({ type }, window.location.origin);
  root.classList.add('framed', 'arriving');

  // What the overview may ask of the page.
  window.page = {
    /** Centre and radius of the sphere in the window of the page when the view is not zoomed, or null without a picture. */
    circle() {
      if (!scene) return null;
      const box = scene.canvas.getBoundingClientRect(), circle = scene.circle();
      return { x: box.left + circle.x, y: box.top + circle.y, radius: circle.radius };
    },
    direction: () => scene?.direction() ?? null,
    /** Show the sphere from this direction, at once. */
    look(direction) {
      scene?.setDirection(direction);
      scene?.render();
    },
    reveal: () => root.classList.remove('arriving'),
    conceal: () => root.classList.add('arriving'),
    restore,
  };

  // The way back closes the frame. Without this the overview would load inside it.
  document.querySelector('.links .back')?.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    say('page:close');
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') say('page:close');
  });

  // Two frames from now the first picture is on the screen.
  requestAnimationFrame(() => requestAnimationFrame(() => say('page:ready')));
}
