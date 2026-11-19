import { curveSaver } from './curve-saver.mjs';
import { flower } from './curve-pentagram.mjs';

// Exported from the Curves app ("curves-animation" file "sineflower-morph", successive morph).
// First curve: the polar flower. Second curve: a circle of radius 80, a single piece over t = 0..1.
const circle = t => [80 * Math.cos((2 * t + 0.5) * Math.PI), 80 * Math.sin((2 * t + 0.5) * Math.PI)];
export const sineflowerPieces = [{ end: Infinity, from: flower, to: circle }];

const animations = {
  shift: { enabled: true, duration: '3.36647887323944', phase: 0.3086139469977485 },
  successive: {
    enabled: true,
    speed1: '4.52206216338979',
    speed2: '5.60181039517228',
    position1: 0.7983039452486442,
    position2: 0.501056513263602,
    relative: 0.7027525680149578,
    swapped: false,
    trigger: 0.115781584582441,
    midpoint: 0.287932861808665,
    amplitude: 0.0780027579344011,
    period: '5.25089221984297',
    phase: 0.7431999728119625,
  },
  rotation: { speed: 0.0192703950245372, phase: 0.9957944218056966 },
};
const drawing = { startColor: '#eae7a9', endColor: '#9b5631', thickness: '15' };
const canvas = { startColor: '#201d4e', endColor: '#040810' };

export { circle };
export const sineflower = curveSaver({ name: 'Sineflower', pieces: sineflowerPieces, animations, drawing, canvas });
