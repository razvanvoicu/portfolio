// Pure matching/threshold logic, also exercised by node tests.
export function threshold(limit, tolerance) { return limit - tolerance; }
export function isOver(speed, limit, tolerance) {
  return Number.isFinite(speed) && Number.isFinite(limit) && speed > threshold(limit, tolerance);
}
export function distance(a, b) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos((a[1] + b[1]) / 2 * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * 6371000;
}
function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inSingapore(point, polygons) {
  return polygons.some(polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(ring => inRing(point, ring)));
}
export function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}
export function bearing(a, b) {
  const rad = Math.PI / 180, lat1 = a[1] * rad, lat2 = b[1] * rad;
  const lon = (b[0] - a[0]) * rad;
  return (Math.atan2(Math.sin(lon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon)) / rad + 360) % 360;
}
export function averageBearing(values) {
  const rad = Math.PI / 180;
  const x = values.reduce((sum, value) => sum + Math.cos(value * rad), 0);
  const y = values.reduce((sum, value) => sum + Math.sin(value * rad), 0);
  // A cancelling vector (e.g. a reversal) has no meaningful average.
  return Math.hypot(x, y) < 1e-10 ? values.at(-1) : (Math.atan2(y, x) / rad + 360) % 360;
}
export function qualifyingSign(point, signs, heading, config) {
  if (!Number.isFinite(heading)) return null;
  let best = null;
  for (const sign of signs) {
    if (!Number.isFinite(sign[3]) || angleDifference(sign[3], heading) > config.signBearingToleranceDeg + 1e-8) continue;
    const meters = distance(point, sign);
    if (meters <= config.signRadiusM + 1e-8 && (!best || meters < best.meters)) best = { limit: sign[2], meters, id: sign[4] };
  }
  return best;
}
export class DriveTracker {
  constructor(signs, config) { this.signs = signs; this.config = config; this.reset(); }
  reset() {
    this.positions = []; this.headings = []; this.travelled = 0;
    this.heading = null; this.sign = null; this.limit = this.config.defaultLimitKph;
    this.turned = false;
  }
  update(point) {
    const c = this.config, last = this.positions.at(-1);
    this.turned = false;
    if (!last) { this.positions.push([...point]); return; }
    const moved = distance(last, point);
    if (moved + 1e-8 < c.minMovementM) return;
    this.travelled += moved;
    this.positions.push([...point]);
    this.positions = this.positions.slice(-c.positionHistoryLength);
    const directions = this.positions.slice(1).map((p, i) => bearing(this.positions[i], p));
    this.heading = averageBearing(directions);
    this.headings = this.headings.filter(item => this.travelled - item.at <= c.turnHistoryDistanceM + 1e-8);
    this.turned = this.headings.some(item => angleDifference(item.heading, this.heading) + 1e-8 >= c.turnAngleDeg);
    if (this.turned) {
      this.limit = c.defaultLimitKph; this.sign = null;
      // Begin a new road's smoothing/history with the latest actual movement.
      this.positions = this.positions.slice(-2);
      this.heading = directions.at(-1);
      this.headings = [];
    }
    this.headings.push({ heading: this.heading, at: this.travelled });
    const sign = qualifyingSign(point, this.signs, this.heading, c);
    if (sign) { this.sign = sign; this.limit = sign.limit; }
  }
}
export function shouldSound(speed, limit, tolerance, config) {
  return limit >= config.minimumAudibleLimitKph && isOver(speed, limit, tolerance);
}
export function speedKph(coords) {
  if (Number.isFinite(coords.speed) && coords.speed >= 0) return coords.speed * 3.6;
  // Do not turn noisy location deltas into a driving-speed measurement.
  // Browsers without a GPS speed estimate must report unavailable.
  return null;
}
