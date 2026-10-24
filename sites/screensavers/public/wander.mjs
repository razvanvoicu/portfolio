const TAU = 2 * Math.PI;
const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class Wander {
  constructor(random = Math.random) {
    this.random = random;
    this.heading = random() * TAU;
    this.target = this.heading;
    this.speed = 7.5;
  }

  resize(width, height, side) {
    this.minX = this.minY = side / 2;
    this.maxX = width - side / 2;
    this.maxY = height - side / 2;
    this.x = Math.max(this.minX, Math.min(this.maxX, this.x ?? width / 2));
    this.y = Math.max(this.minY, Math.min(this.maxY, this.y ?? height / 2));
  }

  update(dt) {
    const left = this.x - this.minX, right = this.maxX - this.x;
    const top = this.y - this.minY, bottom = this.maxY - this.y;
    const margin = Math.min(left, right, top, bottom);
    // Scale the turning radius down for small windows. At full speed the
    // radius is less than a quarter of the mandatory steering margin.
    const guard = Math.min(45, (this.maxX - this.minX) / 4, (this.maxY - this.minY) / 4);
    const turnRate = Math.max(0.7, this.speed * 4 / guard);
    const outward = (left < guard && Math.cos(this.heading) < 0)
      || (right < guard && Math.cos(this.heading) > 0)
      || (top < guard && Math.sin(this.heading) < 0)
      || (bottom < guard && Math.sin(this.heading) > 0);
    if (outward) {
      // Aim away from the nearby sides, including both sides at corners.
      const dx = left < guard ? 1 : right < guard ? -1 : 0;
      const dy = top < guard ? 1 : bottom < guard ? -1 : 0;
      const inward = Math.atan2(dy, dx);
      // Each steering target is strictly less than a right angle away.
      this.target = this.heading + Math.max(-1.4, Math.min(1.4, angleDifference(inward, this.heading)));
    } else if (this.random() < 1 - Math.exp(-(0.12 + 0.9 * Math.exp(-margin / guard)) * dt)) {
      this.target = this.heading + (this.random() * 2 - 1) * 1.4;
    }
    this.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, angleDifference(this.target, this.heading)));
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
    // Also contain the fixture immediately after a resize or numeric rounding.
    this.x = Math.max(this.minX, Math.min(this.maxX, this.x));
    this.y = Math.max(this.minY, Math.min(this.maxY, this.y));
  }
}
