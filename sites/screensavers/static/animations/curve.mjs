import { Wander } from '../wander.mjs';
import { segments, animations, drawing, canvas, referenceWidth } from './curve-spec.mjs';

const TAU = Math.PI * 2;
const STEPS_PER_UNIT = 1200;

const radial = (r, theta) => [r * Math.cos(theta), r * Math.sin(theta)];
// The second curve, by name, as exported from the Curves app (t runs from 0 to 1).
export const second = {
  spiral: t => radial(20 + 60 * (t / 0.4), 6 * Math.PI * (t / 0.4)),
  bulb: t => {
    const angle = 2 * Math.PI * ((1 - (t - 0.4) / 0.025) / 2);
    return [0.05 * 100 * Math.cos(angle) + 85, 0.05 * 100 * Math.sin(angle)];
  },
  return: t => {
    const u = 1 - (t - 0.42500000000000004) / 0.55;
    return radial(10 + 80 * u, 8 * Math.PI * u);
  },
  tail: t => {
    const angle = 2 * Math.PI * (((t - 0.9750000000000001) / 0.02499999999999991 - -1) / 2);
    return [0.05 * 100 * Math.cos(angle) + 15, 0.05 * 100 * Math.sin(angle)];
  },
};

function first([kind, ...values]) {
  if (kind === 'c') {
    const [radius, turns] = values;
    return () => [radius * Math.cos(TAU * turns), radius * Math.sin(TAU * turns)];
  }
  const [t0, width, x0, x1, y0, y1] = values;
  return t => {
    const f = (t - t0) / width;
    return [x0 + f * (x1 - x0), y0 + f * (y1 - y0)];
  };
}
const pieces = segments.map(([end, from, to]) => ({ end, from: first(from), to: second[to] }));

// Weight of the second curve: 0 outside the interval from s1 to s2, rising to 1 over e.
export function weight(t, s1, s2, e) {
  const start = s1 - Math.floor(s1), end = s2 - Math.floor(s2);
  const distance = (end - start + 1) % 1, offset = (t - start + 1) % 1;
  return distance === 0 || offset >= distance ? 0 : Math.min(1, Math.min(offset / e, (distance - offset) / e));
}

export function curvePoint(t, s1, s2, e) {
  const piece = pieces.find(p => t < p.end);
  const w = weight(t, s1, s2, e);
  const [ax, ay] = piece.from(t), [bx, by] = piece.to(t);
  return [(1 - w) * ax + w * bx, (1 - w) * ay + w * by];
}

// The following motion rules are copied from sites/curves/static/animation.js.
const wrap = value => value - Math.floor(value);
const advance = (phase, elapsedMs, durationSeconds) => (phase + elapsedMs / (durationSeconds * 1000)) % 1;
export const oscillation = (midpoint, amplitude, phase) => midpoint + amplitude * Math.sin(TAU * phase);
export function advanceSuccessive(animation, elapsedMs) {
  const v1 = 1 / Number(animation.speed1), v2 = 1 / Number(animation.speed2), elapsed = elapsedMs / 1000;
  const original = wrap(animation.position2 - animation.position1), lower = animation.trigger, upper = 1 - lower, width = upper - lower;
  let d = original, remaining = elapsed, velocity = animation.swapped ? v1 - v2 : v2 - v1;
  if ((d < lower && velocity < 0) || (d > upper && velocity > 0)) { animation.swapped = !animation.swapped; velocity = -velocity; }
  if (velocity !== 0 && (d < lower || d > upper)) {
    const boundary = d < lower ? lower : upper, time = (boundary - d) / velocity;
    if (remaining < time) { d += velocity * remaining; remaining = 0; } else { d = boundary; remaining -= time; }
  }
  if (velocity !== 0 && remaining > 0) {
    const phase = wrap(((velocity > 0 ? d - lower : 2 * width - (d - lower)) + Math.abs(velocity) * remaining) / (2 * width)) * 2 * width;
    d = lower + (phase <= width ? phase : 2 * width - phase);
    const positive = phase < width;
    animation.swapped = positive !== (v2 - v1 > 0);
  }
  animation.position1 = wrap(animation.position1 + (v1 + v2) * elapsed / 2 - (d - original) / 2);
  animation.position2 = wrap(animation.position1 + d);
  animation.relative = d;
  animation.phase = advance(animation.phase, elapsedMs, Number(animation.period));
}

// Same triangular colour ramp as the Curves app: start colour at both ends, end colour in the middle.
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const startRgb = channels(drawing.startColor), endRgb = channels(drawing.endColor);
export function colorAt(t) {
  const position = t <= 0.5 ? 2 * t : 2 * (1 - t);
  return `rgb(${startRgb.map((a, i) => Math.round(a + (endRgb[i] - a) * position)).join(' ')})`;
}

export const curve = { name: 'Curve', create: () => new CurveSaver() };

class CurveSaver {
  constructor() {
    this.wander = new Wander();
    this.shift = { ...animations.shift };
    this.successive = { ...animations.successive };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.side = Math.min(width, height) * 0.8;
    this.wander.resize(width, height, this.side);
  }

  update(dt) {
    this.wander.update(dt);
    this.shift.phase = advance(this.shift.phase, dt * 1000, Number(this.shift.duration));
    advanceSuccessive(this.successive, dt * 1000);
  }

  draw(ctx) {
    const { width, height } = this;
    const background = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2);
    background.addColorStop(0, canvas.startColor);
    background.addColorStop(1, canvas.endColor);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const { position1, position2, midpoint, amplitude, phase } = this.successive;
    const e = oscillation(midpoint, amplitude, phase), shift = this.shift.phase;
    const scale = this.side / 200;
    ctx.save();
    ctx.translate(this.wander.x, this.wander.y);
    ctx.lineWidth = drawing.thickness * this.side / referenceWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Shifting the starting point to S splits the curve into [S, 1] followed by [0, S].
    const runs = shift > 0 ? [[shift, 1, 0], [0, shift, 1 - shift]] : [[0, 1, 0]];
    for (const [from, to, offset] of runs) {
      const steps = Math.max(2, Math.ceil(STEPS_PER_UNIT * (to - from)));
      let previous = null;
      for (let i = 0; i <= steps; i++) {
        const t = i === steps ? to : from + (to - from) * i / steps;
        const [x, y] = curvePoint(t, position1, position2, e);
        if (!Number.isFinite(x) || !Number.isFinite(y)) { previous = null; continue; }
        const current = { x: x * scale, y: -y * scale, u: offset + (t - from) };
        if (previous) {
          const gradient = ctx.createLinearGradient(previous.x, previous.y, current.x, current.y);
          gradient.addColorStop(0, colorAt(previous.u));
          gradient.addColorStop(1, colorAt(current.u));
          ctx.strokeStyle = gradient;
          ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
        }
        previous = current;
      }
    }
    ctx.restore();
  }
}
