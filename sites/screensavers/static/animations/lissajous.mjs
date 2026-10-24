import { Wander } from '../wander.mjs';

const TAU = Math.PI * 2;
const TRAIL = 14;
const SAMPLE_STEP = 1 / 240;
const TRANSITION_START = 8;
const TRANSITION_DURATION = 12;
const TRANSITION_END = TRANSITION_START + TRANSITION_DURATION;
const SEGMENT_DURATION = 36;
const smooth = s => s ** 3 * (10 + s * (-15 + 6 * s));
const integral = s => s ** 4 * (2.5 + s * (-3 + s));
const frequencies = ([m, n]) => [2 * m / (m + n), 2 * n / (m + n)];

// Visit all five pillows, then follow the same path back without a reset.
export const pillowRatios = [[7, 8], [8, 9], [9, 10], [7, 11], [9, 14]];

export function createTransition(from, to, initial) {
  const startFrequency = frequencies(from);
  const endFrequency = frequencies(to);
  const endPhase = initial.map((p, i) => p + TAU * (startFrequency[i] * TRANSITION_END
    + (endFrequency[i] - startFrequency[i]) * TRANSITION_DURATION / 2));
  const [m, n] = to;
  const invariant = n * endPhase[0] - m * endPhase[1];
  // For cosine oscillators, retracing occurs at invariant = k*pi.
  // Make the smallest phase correction to finish halfway between them.
  const target = Math.PI / 2 + Math.round((invariant - Math.PI / 2) / Math.PI) * Math.PI;
  const correction = (target - invariant) / (m * m + n * n);
  return { initial: [...initial], startFrequency, endFrequency,
    adjust: [n * correction, -m * correction] };
}

export function transitionPhase(transition, time) {
  const elapsed = time - TRANSITION_START;
  const s = Math.max(0, Math.min(1, elapsed / TRANSITION_DURATION));
  const area = elapsed <= 0 ? 0 : elapsed >= TRANSITION_DURATION
    ? elapsed - TRANSITION_DURATION / 2 : TRANSITION_DURATION * integral(s);
  return transition.initial.map((p, i) => p + TAU * (transition.startFrequency[i] * time
    + (transition.endFrequency[i] - transition.startFrequency[i]) * area)
    + transition.adjust[i] * smooth(s));
}

export class PillowSequence {
  constructor(family) {
    this.family = family;
    this.index = 0;
    this.direction = 1;
    this.start = 0;
    this.transition = createTransition(family[0], family[1], [Math.PI / (2 * family[0][1]), 0]);
  }

  // Called in time order, including the initial trail's negative pre-roll.
  phaseAt(time) {
    while (time >= this.start + SEGMENT_DURATION) {
      const initial = transitionPhase(this.transition, SEGMENT_DURATION).map(p => p % TAU);
      this.index += this.direction;
      if (this.index === this.family.length - 1 || this.index === 0) this.direction *= -1;
      this.start += SEGMENT_DURATION;
      this.transition = createTransition(this.family[this.index], this.family[this.index + this.direction], initial);
    }
    return transitionPhase(this.transition, time - this.start);
  }
}

class Lissajous {
  constructor(family) {
    this.sequence = new PillowSequence(family);
    this.wander = new Wander();
    this.time = 0;
    this.nextSample = -TRAIL;
    this.samples = [];
    this.sampleUntil(0);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.side = Math.min(width, height) * 0.8;
    this.wander.resize(width, height, this.side);
  }

  sampleUntil(time) {
    while (this.nextSample <= time) {
      const phase = this.sequence.phaseAt(this.nextSample);
      this.samples.push({ time: this.nextSample, x: Math.cos(phase[0]), y: Math.cos(phase[1]) });
      this.nextSample += SAMPLE_STEP;
    }
    let expired = 0;
    while (expired < this.samples.length && this.samples[expired].time < time - TRAIL) expired++;
    if (expired) this.samples.splice(0, expired);
  }

  update(dt) {
    this.time += dt;
    this.wander.update(dt);
    this.sampleUntil(this.time);
  }

  draw(ctx) {
    ctx.fillStyle = '#101c29';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.wander.x, this.wander.y);
    const unit = this.side / 500;
    const radius = this.side / 2 - 4 * unit;
    ctx.strokeStyle = '#91bfdf';
    ctx.lineCap = 'round';
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1], b = this.samples[i];
      const freshness = Math.max(0, 1 - (this.time - b.time) / TRAIL);
      ctx.globalAlpha = 0.06 + 0.85 * freshness * freshness;
      ctx.lineWidth = (0.5 + 1.5 * freshness) * unit;
      ctx.beginPath(); ctx.moveTo(a.x * radius, a.y * radius);
      ctx.lineTo(b.x * radius, b.y * radius); ctx.stroke();
    }
    const head = this.samples[this.samples.length - 1];
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e2edf5';
    ctx.beginPath(); ctx.arc(head.x * radius, head.y * radius, 3 * unit, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

export const pillows = { name: 'Pillows', create: () => new Lissajous(pillowRatios) };
