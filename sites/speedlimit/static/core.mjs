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
export function signInCone(point, sign, heading, config, reverse = false) {
  if (!Number.isFinite(heading)) return false;
  const meters = distance(point, sign);
  if (meters > config.signConeRangeM + 1e-8) return false;
  if (meters < 1e-8) return true;
  const halfAngle = config.signConeNearHalfAngleDeg +
    (config.signConeFarHalfAngleDeg - config.signConeNearHalfAngleDeg) * meters / config.signConeRangeM;
  return angleDifference(bearing(point, sign), (heading + (reverse ? 180 : 0)) % 360) <= halfAngle + 1e-8;
}
export class DriveTracker {
  constructor(signs, config, schoolSigns = []) {
    this.signs = [...signs, ...schoolSigns]; this.config = config; this.reset();
  }
  reset() {
    this.positions = []; this.headings = []; this.travelled = 0;
    this.heading = null; this.sign = null; this.limit = this.config.defaultLimitKph;
    this.turned = false;
    this.schoolZone = null;
    this.encounters = new Map();
    this.lastChange = null; this.rejectedSignId = null; this.manualOverride = null;
    this.appliedSignId = null;
  }
  rememberSigns(point, previous) {
    const c = this.config;
    if (!previous) return;
    const movementHeading = bearing(previous, point);
    const moved = distance(previous, point);
    for (const sign of this.signs) {
      const meters = distance(point, sign);
      const along = distance(previous, sign) * Math.cos(angleDifference(bearing(previous, sign), movementHeading) * Math.PI / 180);
      const crossed = along >= -1e-8 && along <= moved + 1e-8;
      const behind = signInCone(point, sign, this.heading, c, true);
      const ahead = signInCone(previous, sign, movementHeading, c) || signInCone(point, sign, this.heading, c);
      let entry = this.encounters.get(sign[4]);
      // A rear-cone fix can recover a candidate skipped by a GPS gap, but only
      // when this movement proves passage. A sign merely behind us cannot apply.
      if (!entry && (ahead || (crossed && behind))) {
        entry = { sign, seenAt: this.travelled, meters, handled: false, passedAt: null };
        this.encounters.set(sign[4], entry);
      }
      if (!entry) continue;
      if (meters <= c.signConeRangeM + 1e-8) entry.seenAt = this.travelled;
      // Project the sign onto this actual GPS movement, not the smoothed heading.
      if (entry.passedAt === null && crossed) {
        entry.passedAt = this.travelled - moved + Math.max(0, along);
      }
      entry.meters = meters;
      entry.behind = behind;
    }
    for (const [id, entry] of this.encounters) {
      if (this.travelled - entry.seenAt > c.signRecheckDistanceM + 1e-8) this.encounters.delete(id);
      else entry.meters = distance(point, entry.sign);
    }
  }
  resolveRoad() { return null; }
  applySigns(numericAllowed = true) {
    const c = this.config;
    if (!Number.isFinite(this.heading)) return;
    const eligible = [...this.encounters.values()].filter(entry => !entry.handled && entry.passedAt !== null && entry.behind && entry.sign[4] !== this.rejectedSignId &&
      Number.isFinite(entry.sign[3]) && angleDifference(entry.sign[3], this.heading) <= c.signBearingToleranceDeg + 1e-8)
      .sort((a, b) => a.passedAt - b.passedAt || Number(Boolean(b.sign[5])) - Number(Boolean(a.sign[5])));
    // Zone markers take precedence over colocated numeric speed signs, so an
    // entry stores the limit BEFORE the accompanying 40 sign changes it.
    for (const zone of eligible) {
      if (zone.handled) continue;
      if (this.rejectedSignId !== null && zone.sign[4] !== this.rejectedSignId) {
        this.rejectedSignId = null; this.manualOverride = null;
      }
      zone.handled = true;
      if (zone.sign[5] === 'school-start' && !this.schoolZone) {
        this.schoolZone = { limit: this.limit, sign: this.sign };
        this.limit = c.schoolZoneLimitKph;
        this.sign = { limit: this.limit, id: zone.sign[4], kind: 'school-start' };
      } else if (zone.sign[5] === 'school-end' && this.schoolZone) {
        this.limit = this.schoolZone.limit; this.sign = this.schoolZone.sign;
        this.schoolZone = null;
      } else if (!zone.sign[5] && !this.schoolZone && numericAllowed &&
          !eligible.some(entry => entry.sign[5] && Math.abs(entry.passedAt - zone.passedAt) < 1e-8)) {
        this.sign = { limit: zone.sign[2], meters: zone.meters, id: zone.sign[4] };
        this.limit = zone.sign[2];
      } else continue;
      this.appliedSignId = zone.sign[4];
    }
  }
  snapshot() { return { limit: this.limit, sign: this.sign, schoolZone: this.schoolZone }; }
  canReject(now = Date.now()) { return this.lastChange !== null && now - this.lastChange.at <= this.config.rejectChangeWindowMs; }
  rejectChange(now = Date.now()) {
    if (!this.canReject(now)) return false;
    const change = this.lastChange;
    Object.assign(this, change.before);
    this.rejectedSignId = change.sourceId;
    this.manualOverride = this.snapshot();
    this.lastChange = null;
    return true;
  }
  update(point, now = Date.now()) {
    const before = this.snapshot();
    this.appliedSignId = null;
    this.advance(point);
    if (this.manualOverride) Object.assign(this, this.manualOverride);
    if (before.limit !== this.limit) this.lastChange = { before, at: now, sourceId: this.appliedSignId ?? `road:${this.sign?.roadCode ?? 'default'}` };
  }
  advance(point) {
    const c = this.config, last = this.positions.at(-1);
    this.turned = false;
    if (!last) { this.positions.push([...point]); this.rememberSigns(point); return; }
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
      if (!this.schoolZone) { this.limit = c.defaultLimitKph; this.sign = null; }
      // A corner sign may already have matched during the turn. Reapply it
      // after the turn reset, provided it is still in the 30 m travel window.
      if (!this.schoolZone) for (const entry of this.encounters.values()) {
        if (!entry.sign[5]) entry.handled = false;
      }
      // Begin a new road's smoothing/history with the latest actual movement.
      this.positions = this.positions.slice(-2);
      this.heading = directions.at(-1);
      this.headings = [];
    }
    this.headings.push({ heading: this.heading, at: this.travelled });
    this.rememberSigns(point, last);
    const road = this.resolveRoad(point);
    const roadLimitKnown = Number.isFinite(road?.limit);
    if (roadLimitKnown && !this.schoolZone) {
      this.limit = road.limit;
      this.sign = { kind: 'road', limit: road.limit, id: road.featureId, roadCode: road.code };
    }
    this.applySigns(!roadLimitKnown);
  }
}
export function shouldSound(speed, limit, tolerance, config) {
  return limit >= config.minimumAudibleLimitKph && isOver(speed, limit, tolerance);
}
export function warningLevel(speed, limit, tolerance, config) {
  if (!isOver(speed, limit, tolerance)) return 'off';
  return speed - threshold(limit, tolerance) <= config.gentleExcessKph ? 'gentle' : 'loud';
}
export function speedKph(coords) {
  if (Number.isFinite(coords.speed) && coords.speed >= 0) return coords.speed * 3.6;
  // Do not turn noisy location deltas into a driving-speed measurement.
  // Browsers without a GPS speed estimate must report unavailable.
  return null;
}
