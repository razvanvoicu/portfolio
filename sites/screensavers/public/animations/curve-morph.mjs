import { curveSaver } from './curve-saver.mjs';
import { second } from './curve-star.mjs';

// Exported from the Curves app (simple morph, factor animated). The first curve is the
// spiral / bulb / return / tail curve of curve-star.mjs; the second is the same curve
// run backwards and turned half a revolution about the origin.
export function first(t) {
  if (t < 0.4) return second.spiral(t);
  if (t < 0.42500000000000004) return second.bulb(t);
  if (t < 0.9750000000000001) return second.return(t);
  return second.tail(t);
}
export const half = Math.PI;
export function backwards(t) {
  const [x, y] = first(1 - t), c = Math.cos(half), s = Math.sin(half);
  return [c * x - s * y, s * x + c * y];
}
export function morphPoint(t, m) {
  const [x1, y1] = first(t), [x2, y2] = backwards(t);
  return [(1 - m) * x1 + m * x2, (1 - m) * y1 + m * y2];
}

const animations = {
  shift: { enabled: true, duration: '2.72526002971768', phase: 0.8516317489209788 },
  morph: { enabled: true, duration: '14.8317342390151', phase: 0.11495795987551283, min: 0, max: 1 },
  rotation: { speed: 0.0192703950245372, phase: 0.5278236876723035 },
};
const drawing = { startColor: '#eae7a9', endColor: '#9b5631', thickness: '15' };
const canvas = { startColor: '#201d4e', endColor: '#040810' };

export const morph = curveSaver({ name: 'Morph', point: morphPoint, animations, drawing, canvas });
