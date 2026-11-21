// A line that shows how far the energy has been above the minimum during the
// last few seconds. It lies flat on the baseline at the minimum.

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Trace {
  constructor(canvas, seconds = 10) {
    this.canvas = canvas;
    this.span = seconds * 1000;
    this.times = [];
    this.levels = [];
    this.stale = true;
  }

  /** Ask for a repaint, for example after a change of size. */
  invalidate() {
    this.stale = true;
  }

  /** Record the current level, a number in [0, 1] that is 0 at the minimum. Call once per frame. */
  update(now, level) {
    this.times.push(now);
    this.levels.push(level);
    // Keep one sample beyond the left edge so that the line runs out of the picture.
    while (this.times.length > 2 && now - this.times[1] > this.span) {
      this.times.shift();
      this.levels.shift();
    }
    const active = this.levels.some((value) => value > 0);
    if (active || this.stale) this.draw(now);
    this.stale = active;
  }

  draw(now) {
    const canvas = this.canvas;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const base = height - 8, top = 8, right = width - 10;
    const x = (time) => right - ((now - time) / this.span) * right;
    const y = (level) => base - level * (base - top);
    const { times, levels } = this;
    const color = cssVar('--upper');

    ctx.strokeStyle = cssVar('--axis');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, base + 0.5);
    ctx.lineTo(width, base + 0.5);
    ctx.stroke();

    // One unbroken line. Before the first sample it continues at the level of that sample.
    const points = [];
    if (times.length) {
      if (x(times[0]) > 0) points.push([0, y(levels[0])]);
      for (let k = 0; k < times.length; k++) points.push([x(times[k]), y(levels[k])]);
    }

    if (points.length > 1) {
      // A light wash between the line and the baseline.
      ctx.beginPath();
      points.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.lineTo(points[points.length - 1][0], base);
      ctx.lineTo(points[0][0], base);
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      points.forEach(([px, py], k) => (k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // The present value.
    const last = levels.length ? levels[levels.length - 1] : 0;
    ctx.fillStyle = cssVar('--page');
    ctx.beginPath();
    ctx.arc(right, y(last), 7.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(right, y(last), 5, 0, 2 * Math.PI);
    ctx.fill();
  }
}
