import { angleDifference, bearing, DriveTracker } from './core.mjs';

// Index cell size affects lookup performance only, never match eligibility.
const CELL_DEGREES = 0.002;
const METRES_PER_DEGREE = Math.PI * 6371000 / 180;
export function pointSegmentDistance(point, a, b) {
  const sx = METRES_PER_DEGREE * Math.cos(point[1] * Math.PI / 180);
  const dx = (b[0] - a[0]) * sx, dy = (b[1] - a[1]) * METRES_PER_DEGREE;
  const px = (point[0] - a[0]) * sx, py = (point[1] - a[1]) * METRES_PER_DEGREE;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / length2)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}
export class RoadMatcher {
  constructor(features, identities, config) {
    this.features = features; this.identities = identities; this.config = config;
    this.cells = new Map();
    features.forEach((feature, identity) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x,y] of feature[3]) {
        minX = Math.min(minX,x); maxX = Math.max(maxX,x);
        minY = Math.min(minY,y); maxY = Math.max(maxY,y);
      }
      for (let x = Math.floor(minX/CELL_DEGREES); x <= Math.floor(maxX/CELL_DEGREES); x++) {
        for (let y = Math.floor(minY/CELL_DEGREES); y <= Math.floor(maxY/CELL_DEGREES); y++) {
          const key = `${x}:${y}`;
          if (!this.cells.has(key)) this.cells.set(key,[]);
          this.cells.get(key).push(identity);
        }
      }
    });
  }
  match(point, heading, previousCode = null) {
    if (!Number.isFinite(heading)) return { state:'heading', road:null };
    const c = this.config, ids = new Set();
    const dx = c.roadMatchDistanceM / (METRES_PER_DEGREE*Math.cos(point[1]*Math.PI/180));
    const dy = c.roadMatchDistanceM / METRES_PER_DEGREE;
    for (let x=Math.floor((point[0]-dx)/CELL_DEGREES);x<=Math.floor((point[0]+dx)/CELL_DEGREES);x++) {
      for (let y=Math.floor((point[1]-dy)/CELL_DEGREES);y<=Math.floor((point[1]+dy)/CELL_DEGREES);y++) {
        for (const id of this.cells.get(`${x}:${y}`)||[]) ids.add(id);
      }
    }
    const byRoad = new Map();
    for (const id of ids) {
      const [roadIndex, limit, featureId, points] = this.features[id];
      let best = Infinity;
      for (let i=1;i<points.length;i++) {
        const meters = pointSegmentDistance(point,points[i-1],points[i]);
        if (meters>c.roadMatchDistanceM+1e-8 || meters>=best) continue;
        const direction = bearing(points[i-1],points[i]);
        if (Math.min(angleDifference(direction,heading),angleDifference((direction+180)%360,heading))>c.roadBearingToleranceDeg+1e-8) continue;
        best = meters;
      }
      const [code,name] = this.identities[roadIndex];
      if (Number.isFinite(best) && (!byRoad.has(code)||best<byRoad.get(code).meters)) {
        byRoad.set(code,{code,name,limit,featureId,meters:best});
      }
    }
    const candidates = [...byRoad.values()].sort((a,b)=>a.meters-b.meters);
    if (!candidates.length) return {state:'unmatched',road:null};
    const best=candidates[0];
    if (candidates.length>1 && candidates[1].meters-best.meters<=c.roadAmbiguityMarginM+1e-8) {
      const retained=byRoad.get(previousCode);
      return retained ? {state:'matched',road:retained,retained:true} : {state:'uncertain',road:null};
    }
    return {state:'matched',road:best};
  }
}
export class RoadDriveTracker extends DriveTracker {
  constructor(signs, config, schoolSigns, features, identities) {
    super(signs,config,schoolSigns);
    this.matcher=new RoadMatcher(features,identities,config);
  }
  reset() {
    super.reset(); this.roadMatch={state:'heading',road:null}; this.previousRoad=null;
  }
  resolveRoad(point) {
    this.roadMatch=this.matcher.match(point,this.heading,this.previousRoad);
    this.previousRoad=this.roadMatch.road?.code??null;
    const road=this.roadMatch.road;
    if (Number.isFinite(road?.limit)) return road;
    // A statutory value must not leak from a previous mapped stretch into an
    // unresolved stretch. Fall back to the existing sign/default rules.
    if (!this.schoolZone && this.sign?.kind==='road') {
      this.limit=this.config.defaultLimitKph; this.sign=null;
    }
    return null;
  }
}
