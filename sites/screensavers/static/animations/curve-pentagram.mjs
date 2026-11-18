import { curveSaver } from './curve-saver.mjs';

// Exported from the Curves app ("curves-animation" file "anim", successive morph).
// First curve: a polar flower. Second curve: a pentagram, five edges of a pentagon
// (each edge turned a further 144 degrees) traced over t = 0..1 in steps of 0.2.
// The exported expression repeats the morph weight in every segment; only what
// differs per segment is kept: its end, and the edge (turn count) of the second curve.
const TAU = Math.PI * 2;
const COS = -0.8090169943749473, SIN = -0.5877852522924732;

export const flower = t => [
  50 * (1 + 0.4 * Math.sin(20 * Math.PI * t)) * Math.cos(2 * t * Math.PI),
  50 * (1 + 0.4 * Math.sin(20 * Math.PI * t)) * Math.sin(2 * t * Math.PI),
];

// Edge `turns` of the pentagram, starting at t = turns / 5.
export function edge(turns, t) {
  const u = (t - turns * 0.2) / 0.2;
  let x = Math.sin(TAU / 5) * 70 * (2 * u - 1), y = Math.cos(TAU / 5) * 70;
  for (let i = 0; i < turns; i++) [x, y] = [COS * x - SIN * y, SIN * x + COS * y];
  return [x, y];
}

// [end, turns]: the segment covers t up to (excluding) end. The sliver ending at
// 0.6000000000000001 comes from rounding in the export and belongs to edge 3.
const segments = [[0.2, 0], [0.4, 1], [0.6, 2], [0.6000000000000001, 3], [0.8, 3], [Infinity, 4]];
export const pentagramPieces = segments.map(([end, turns]) => ({ end, from: flower, to: t => edge(turns, t) }));

const animations = {
  shift: { enabled: true, duration: '3.98218804749854', phase: 0.036258471151697294 },
  successive: {
    enabled: true,
    speed1: '5.8717474531179',
    speed2: '10.4336837323989',
    position1: 0.4068306441139823,
    position2: 0.744227973292481,
    relative: 0.3373973291784988,
    swapped: false,
    trigger: 0.0518272662384011,
    midpoint: 0.328077347349296,
    amplitude: 0.0562701934221512,
    period: '5.25089221984297',
    phase: 0.4734150036339322,
  },
};
const drawing = { startColor: '#58abdf', endColor: '#81df94', thickness: '15' };
const canvas = { startColor: '#2c3a33', endColor: '#090c12' };

export const pentagram = curveSaver({ name: 'Pentagram', pieces: pentagramPieces, animations, drawing, canvas });
