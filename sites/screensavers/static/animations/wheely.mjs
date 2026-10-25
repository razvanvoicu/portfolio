import { Wander } from '../wander.mjs';

const TAU = Math.PI * 2;
const PERIOD = 9;
const TRAIL_SECONDS = PERIOD * 0.8;
const SAMPLE_INTERVAL = 1 / 60;

export const wheely = { name: 'Wheely', create: () => new Wheely() };

export function rodPoint(angle, fraction) {
  return { x: (1 - fraction) * Math.cos(angle), y: fraction * Math.sin(angle) };
}

class Wheely {
  constructor() {
    this.wander = new Wander();
    this.time = 0;
    this.samples = [];
    this.nextSample = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.side = Math.min(width, height) * 0.8;
    this.wander.resize(width, height, this.side);
  }

  update(dt) {
    this.time += dt;
    this.wander.update(dt);
    while (this.nextSample <= this.time) {
      this.samples.push(this.nextSample);
      this.nextSample += SAMPLE_INTERVAL;
    }
    while (this.samples.length && this.samples[0] < this.time - TRAIL_SECONDS) this.samples.shift();
  }

  draw(ctx) {
    ctx.fillStyle = '#101c29';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.wander.x, this.wander.y);
    // Reserve space for stroke caps and endpoint disks inside the square.
    const unit = this.side / 500;
    const radius = this.side / 2 - 12 * unit;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (ax, ay, bx, by, color, thickness) => {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.strokeStyle = color; ctx.lineWidth = thickness * unit; ctx.stroke();
    };
    const disk = (x, y, r, color) => {
      ctx.beginPath(); ctx.arc(x, y, r * unit, 0, TAU); ctx.fillStyle = color; ctx.fill();
    };
    line(-radius, 0, radius, 0, '#719e96', 2);
    line(0, -radius, 0, radius, '#719e96', 2);
    ctx.beginPath(); ctx.arc(0, 0, radius / 2, 0, TAU);
    ctx.strokeStyle = '#bacb94'; ctx.lineWidth = 2 * unit; ctx.stroke();

    const angle = this.time * TAU / PERIOD;
    const a = rodPoint(angle, 0), b = rodPoint(angle, 1);
    line(a.x * radius, a.y * radius, b.x * radius, b.y * radius, '#c8ddd2', 5);
    for (const p of [a, b]) {
      disk(p.x * radius, p.y * radius, 7, '#7ed6b3');
      disk(p.x * radius, p.y * radius, 3.5, '#edbdc9');
    }
    const middle = rodPoint(angle, 0.5);
    disk(middle.x * radius, middle.y * radius, 6, '#101c29');
    disk(middle.x * radius, middle.y * radius, 2.3, '#c8ddd2');
    for (const fraction of [0.25, 0.75]) {
      for (let i = 1; i < this.samples.length; i++) {
        const t = this.samples[i];
        const freshness = Math.max(0, 1 - (this.time - t) / TRAIL_SECONDS);
        const a = rodPoint(this.samples[i - 1] * TAU / PERIOD, fraction);
        const b = rodPoint(t * TAU / PERIOD, fraction);
        ctx.globalAlpha = 0.12 + 0.88 * freshness;
        line(a.x * radius, a.y * radius, b.x * radius, b.y * radius,
          `hsl(${42 - 20 * freshness} 90% ${83 - 15 * freshness}%)`, 0.8 + 4 * freshness);
      }
    }
    ctx.globalAlpha = 1;
    for (const fraction of [0.25, 0.75]) {
      const p = rodPoint(angle, fraction);
      const tangent = Math.atan2(fraction * Math.cos(angle), -(1 - fraction) * Math.sin(angle));
      ctx.save(); ctx.translate(p.x * radius, p.y * radius); ctx.rotate(tangent);
      ctx.beginPath(); ctx.moveTo(10 * unit, 0); ctx.lineTo(-7 * unit, -5 * unit);
      ctx.lineTo(-3 * unit, 0); ctx.lineTo(-7 * unit, 5 * unit); ctx.closePath();
      ctx.fillStyle = '#f1d47e'; ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
}
