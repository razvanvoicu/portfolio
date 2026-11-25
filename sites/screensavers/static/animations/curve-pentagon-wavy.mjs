import { curveSaver } from './curve-saver.mjs';

// Curves export: smorph-pentagon-wavy-animation.json (successive morph).
// Preserve the exported segment boundaries, including its floating-point sliver.
// Each row is [end, t0, width, x0, x1, y0, y1], before the exported 0.5 scale.
const segments = [
  [0.1, 0, 0.1, 5.5109105961630896e-15, -42.79754323328191, 90, 58.905764746872634],
  [0.2, 0.1, 0.1, -42.79754323328191, -85.59508646656381, 58.905764746872634, 27.811529493745276],
  [0.30000000000000004, 0.2, 0.10000000000000003, -85.59508646656381, -69.2478795864432, 27.811529493745276, -22.50000000000002],
  [0.4, 0.30000000000000004, 0.09999999999999998, -69.2478795864432, -52.900672706322595, -22.50000000000002, -72.81152949374525],
  [0.5, 0.4, 0.09999999999999998, -52.900672706322595, -1.3375260980330736e-14, -72.81152949374525, -72.81152949374527],
  [0.6, 0.5, 0.09999999999999998, -1.3375260980330736e-14, 52.90067270632256, -72.81152949374527, -72.81152949374528],
  [0.6000000000000001, 0.6000000000000001, 0.09999999999999998, 52.90067270632256, 69.2478795864432, -72.81152949374528, -22.500000000000014],
  [0.7000000000000001, 0.6000000000000001, 0.09999999999999998, 52.90067270632256, 69.2478795864432, -72.81152949374528, -22.500000000000014],
  [0.8, 0.7000000000000001, 0.09999999999999998, 69.2478795864432, 85.59508646656383, -22.500000000000014, 27.811529493745244],
  [0.9, 0.8, 0.09999999999999998, 85.59508646656383, 42.79754323328198, 27.811529493745244, 58.905764746872585],
  [Infinity, 0.9, 0.09999999999999998, 42.79754323328198, 5.5109105961630896e-15, 58.905764746872585, 90],
];

export const wavyCircle = t => {
  const radius = 80 * (1 + 0.15 * Math.sin(24 * t * Math.PI));
  const angle = (2 * t + 0.5) * Math.PI;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
};

export const pentagonWavyPieces = segments.map(([end, t0, width, x0, x1, y0, y1]) => ({
  end,
  from: t => {
    const u = (t - t0) / width;
    return [0.5 * (x0 + u * (x1 - x0)), 0.5 * (y0 + u * (y1 - y0))];
  },
  to: wavyCircle,
}));

export const pentagonWavyAnimations = {
  "shift": {
    "enabled": true,
    "duration": "0.94892181588903",
    "phase": 0.4141584018146195
  },
  "morph": {
    "enabled": true,
    "duration": "5",
    "phase": 0.8265799999998342,
    "min": 0,
    "max": 1
  },
  "successive": {
    "enabled": true,
    "speed1": "9.29476670870114",
    "speed2": "5",
    "position1": 0.32883675047689087,
    "position2": 0.6944970669701598,
    "relative": 0.36566031649326897,
    "swapped": true,
    "trigger": 0.05,
    "midpoint": 0.042686972548259,
    "amplitude": 0.00364973615287614,
    "period": "5",
    "phase": 0.5497599999990719
  },
  "rotation": {
    "speed": 0.00733112330851584,
    "phase": 0.39600273898242166
  }
};

const drawing = {
  "startColor": "#f71808",
  "endColor": "#ecfc03",
  "thickness": "15"
};

const canvas = {
  "grid": false,
  "startColor": "#89a3d7",
  "endColor": "#071227",
  "type": "radial",
  "angle": 0
};

export const pentagonWavy = curveSaver({ name: 'Pentagon wavy', pieces: pentagonWavyPieces,
  animations: pentagonWavyAnimations, drawing, canvas });
