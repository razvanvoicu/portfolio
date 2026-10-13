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
export function nearbyLimit(point, signs, accuracy) {
  // A point dataset cannot determine the current road. Use only a local estimate,
  // reject imprecise fixes and conflicting nearby limits; never propagate a sign
  // along a route or assume a default speed when there is no evidence.
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 30) return null;
  const candidates = signs.map(sign => ({ sign, meters: distance(point, sign) }))
    .filter(item => item.meters <= 60 + accuracy).sort((a, b) => a.meters - b.meters);
  if (!candidates.length || candidates[0].meters > 60) return null;
  const values = new Set(candidates.map(item => item.sign[2]));
  if (values.size !== 1) return null;
  return { limit: candidates[0].sign[2], meters: Math.round(candidates[0].meters), id: candidates[0].sign[4] };
}
export function speedKph(coords) {
  if (Number.isFinite(coords.speed) && coords.speed >= 0) return coords.speed * 3.6;
  // Do not turn noisy location deltas into a driving-speed measurement.
  // Browsers without a GPS speed estimate must report unavailable.
  return null;
}
