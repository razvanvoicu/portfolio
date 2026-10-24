import { wheely } from './animations/wheely.mjs';
import { pillows } from './animations/lissajous.mjs';

// Reorder or extend this array to change the screensaver sequence.
export const screensavers = [wheely, pillows];

const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d');
let index = 0;
let animation = screensavers[index].create();
let width, height;
let previous;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  animation.resize(width, height);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  index = (index + step + screensavers.length) % screensavers.length;
  animation = screensavers[index].create();
  animation.resize(width, height);
});
document.addEventListener('visibilitychange', () => { previous = undefined; });

function frame(now) {
  // Substeps keep steering and trails independent of display refresh rate.
  let remaining = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.1);
  previous = now;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    animation.update(dt);
    remaining -= dt;
  }
  animation.draw(context);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
