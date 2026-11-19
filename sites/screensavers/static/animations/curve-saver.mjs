import { Wander } from '../wander.mjs';

const TAU = Math.PI * 2;
const STEPS_PER_UNIT = 1200;

// Weight of the second curve: 0 outside the interval from s1 to s2, rising to 1 over e.
export function weight(t, s1, s2, e) {
  const start = s1 - Math.floor(s1), end = s2 - Math.floor(s2);
  const distance = (end - start + 1) % 1, offset = (t - start + 1) % 1;
  return distance === 0 || offset >= distance ? 0 : Math.min(1, Math.min(offset / e, (distance - offset) / e));
}

// pieces: [{ end, from(t), to(t) }]; each covers t up to (excluding) end, and blends from -> to.
export function curvePoint(pieces, t, s1, s2, e) {
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

export const morphAt = (phase, min, max) => min + (max - min) * (1 - Math.cos(TAU * phase)) / 2;

// The Curves app rotates the whole morph about the origin by phase turns; phase falls at speed turns per second.
export const advanceRotation = (phase, elapsedMs, speed) => speed === 0 ? phase : wrap(phase - speed * (elapsedMs / 1000));
export function rotatePoint([x, y], angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * x - s * y, s * x + c * y];
}

// Same triangular colour ramp as the Curves app: start colour at both ends, end colour in the middle.
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function colorAt(colors, t) {
  const position = t <= 0.5 ? 2 * t : 2 * (1 - t);
  return `rgb(${colors.start.map((a, i) => Math.round(a + (colors.end[i] - a) * position)).join(' ')})`;
}

// spec, as exported from the Curves app (thickness is in pixels of its 800 px preview canvas):
//   { name, drawing: { startColor, endColor, thickness }, canvas, animations: { shift, rotation (optional), ... } }
// plus, for a successive morph, pieces: [{ end, from(t), to(t) }] and animations.successive,
// or, for a simple morph, point(t, m) and animations.morph. Like the app, only the animation
// that belongs to the morph type is applied.
export function curveSaver(spec) {
  return { name: spec.name, create: () => new CurveSaver(spec) };
}

const REFERENCE_WIDTH = 800;

class CurveSaver {
  constructor(spec) {
    this.spec = spec;
    this.colors = { start: channels(spec.drawing.startColor), end: channels(spec.drawing.endColor) };
    this.wander = new Wander();
    this.shift = { ...spec.animations.shift };
    this.morphing = Boolean(spec.point);
    this.successive = { ...spec.animations.successive };
    this.morph = { ...spec.animations.morph };
    this.rotation = { speed: 0, phase: 0, ...spec.animations.rotation };
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
    if (this.morphing) this.morph.phase = advance(this.morph.phase, dt * 1000, Number(this.morph.duration));
    else advanceSuccessive(this.successive, dt * 1000);
    this.rotation.phase = advanceRotation(this.rotation.phase, dt * 1000, this.rotation.speed);
  }

  // The curve for the current animation state, as a function of t.
  curveFunction() {
    const { spec } = this;
    if (this.morphing) {
      const { min, max, phase } = this.morph, m = morphAt(phase, min, max);
      return t => spec.point(t, m);
    }
    const { position1, position2, midpoint, amplitude, phase } = this.successive;
    const e = oscillation(midpoint, amplitude, phase);
    return t => curvePoint(spec.pieces, t, position1, position2, e);
  }

  draw(ctx) {
    const { width, height } = this, { drawing, canvas } = this.spec;
    const background = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2);
    background.addColorStop(0, canvas.startColor);
    background.addColorStop(1, canvas.endColor);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const curveAt = this.curveFunction(), shift = this.shift.phase, angle = this.rotation.phase * TAU;
    const scale = this.side / 200;
    ctx.save();
    ctx.translate(this.wander.x, this.wander.y);
    ctx.lineWidth = Number(drawing.thickness) * this.side / REFERENCE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Shifting the starting point to S splits the curve into [S, 1] followed by [0, S].
    const runs = shift > 0 ? [[shift, 1, 0], [0, shift, 1 - shift]] : [[0, 1, 0]];
    for (const [from, to, offset] of runs) {
      const steps = Math.max(2, Math.ceil(STEPS_PER_UNIT * (to - from)));
      let previous = null;
      for (let i = 0; i <= steps; i++) {
        const t = i === steps ? to : from + (to - from) * i / steps;
        const [x, y] = rotatePoint(curveAt(t), angle);
        if (!Number.isFinite(x) || !Number.isFinite(y)) { previous = null; continue; }
        const current = { x: x * scale, y: -y * scale, u: offset + (t - from) };
        if (previous) {
          const gradient = ctx.createLinearGradient(previous.x, previous.y, current.x, current.y);
          gradient.addColorStop(0, colorAt(this.colors, previous.u));
          gradient.addColorStop(1, colorAt(this.colors, current.u));
          ctx.strokeStyle = gradient;
          ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
        }
        previous = current;
      }
    }
    ctx.restore();
  }
}
