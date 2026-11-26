#!/usr/bin/env node
// Replay recorded SpeedLimit trips from Firestore through RoadDriveTracker
// and detect signs close to segments between consecutive GPS fixes that were missed.
//
// Usage:
//   node scripts/speedlimit_verify_trips.mjs [--list] [--trip <prefix>] [--all]
//     [--refresh] [--max-perp 30] [--max-bearing 45] [--include-same-limit]
//     [--json tmp/speedlimit-verify-report.json]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG } from '../sites/speedlimit/static/config.mjs';
import {
  angleDifference,
  bearing,
  distance,
  inSingapore,
  signInCone,
} from '../sites/speedlimit/static/core.mjs';
import { ROAD_FEATURES, ROAD_IDENTITIES } from '../sites/speedlimit/static/network.mjs';
import { pointSegmentDistance, RoadDriveTracker, RoadMatcher } from '../sites/speedlimit/static/roads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadDataSource = fs.readFileSync(path.join(ROOT, 'sites', 'speedlimit', 'static', 'road-data.js'), 'utf8');
const { SCHOOL_SIGNS, SG_POLYGONS, SPEED_SIGNS } = await import(
  `data:text/javascript;base64,${Buffer.from(roadDataSource, 'utf8').toString('base64')}`
);
const PROJECT = 'personalexperiments01';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DEFAULT_CACHE_DIR = path.join(ROOT, 'tmp', 'speedlimit-trips');
const METRES_PER_DEGREE = (Math.PI * 6371000) / 180;

function parseArgs(argv) {
  const opts = {
    list: false,
    trips: [],
    all: false,
    refresh: false,
    maxPerpM: CONFIG.signRadiusM,
    maxBearingDeg: CONFIG.signBearingToleranceDeg,
    includeSameLimit: false,
    cacheDir: DEFAULT_CACHE_DIR,
    jsonOut: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') opts.list = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--refresh') opts.refresh = true;
    else if (arg === '--include-same-limit') opts.includeSameLimit = true;
    else if (arg === '--trip') opts.trips.push(argv[++i]);
    else if (arg === '--max-perp') opts.maxPerpM = Number(argv[++i]);
    else if (arg === '--max-bearing') opts.maxBearingDeg = Number(argv[++i]);
    else if (arg === '--cache-dir') opts.cacheDir = path.resolve(argv[++i]);
    else if (arg === '--json') opts.jsonOut = path.resolve(argv[++i]);
    else if (arg === '-h' || arg === '--help') {
      console.log(`Usage: node scripts/speedlimit_verify_trips.mjs [options]
  --list                  List trips from Firestore/cache and exit
  --trip <id-or-prefix>   Verify matching trip(s) (repeatable)
  --all                   Verify all trips (default if --trip is omitted)
  --refresh               Re-fetch trip data from Firestore, ignoring local cache
  --max-perp <m>          Max perpendicular distance from segment to sign (default: ${CONFIG.signRadiusM})
  --max-bearing <deg>     Max sign bearing vs segment heading difference (default: ${CONFIG.signBearingToleranceDeg})
  --include-same-limit    Include missed signs whose limit already matches active limit
  --cache-dir <dir>       Cache directory (default: tmp/speedlimit-trips)
  --json <path>           Write detailed JSON report`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.list && !opts.trips.length) opts.all = true;
  return opts;
}

let cachedToken = null;
function getAccessToken() {
  if (cachedToken) return cachedToken;
  const bin = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  for (const args of [
    ['auth', 'print-access-token'],
    ['auth', 'application-default', 'print-access-token'],
  ]) {
    try {
      const out = execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }).trim();
      if (out) {
        cachedToken = out;
        return out;
      }
    } catch {
      // Try next auth source.
    }
  }
  throw new Error('Could not obtain a Google Cloud access token. Run `gcloud.cmd auth login`.');
}

async function firestoreGet(url) {
  const token = getAccessToken();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  if (!res.ok) {
    throw new Error(`Firestore HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

function decodeValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const out = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) out[k] = decodeValue(v);
    return out;
  }
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(decodeValue);
  return val;
}

function decodeDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = decodeValue(v);
  return out;
}

async function fetchTripList() {
  const docs = [];
  let pageToken = '';
  while (true) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await firestoreGet(`${FIRESTORE_BASE}/SpeedLimit?${params}`);
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return docs
    .map(doc => {
      const tripId = doc.name.split('/').pop();
      const fields = decodeDoc(doc);
      const saved = fields.savedChunks && typeof fields.savedChunks === 'object' ? Object.keys(fields.savedChunks).length : 0;
      return {
        tripId,
        startedAt: fields.startedAt ?? null,
        stoppedAt: fields.stoppedAt ?? null,
        fixCount: fields.fixCount ?? 0,
        chunkCount: fields.chunkCount ?? 0,
        savedChunks: saved,
      };
    })
    .sort((a, b) => b.tripId.localeCompare(a.tripId));
}

async function fetchTripFixes(tripId) {
  const chunks = [];
  let pageToken = '';
  while (true) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const encodedId = encodeURIComponent(tripId);
    const data = await firestoreGet(`${FIRESTORE_BASE}/SpeedLimit/${encodedId}/fixes?${params}`);
    for (const doc of data.documents || []) {
      const fields = decodeDoc(doc);
      chunks.push({ chunkIndex: fields.chunkIndex ?? 0, fixes: fields.fixes || [] });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return chunks.flatMap(c => c.fixes);
}

function safeCacheName(tripId) {
  return `${tripId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
}

async function loadTrips(opts) {
  fs.mkdirSync(opts.cacheDir, { recursive: true });
  const indexPath = path.join(opts.cacheDir, '_index.json');
  let tripList;
  if (!opts.refresh && fs.existsSync(indexPath)) {
    try {
      tripList = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      tripList = null;
    }
  }
  if (!tripList) {
    tripList = await fetchTripList();
    fs.writeFileSync(indexPath, JSON.stringify(tripList, null, 2));
  }
  if (opts.list) return { tripList, loaded: [] };

  const selected = opts.all
    ? tripList
    : tripList.filter(t => opts.trips.some(q => t.tripId.includes(q)));

  const loaded = [];
  for (const meta of selected) {
    const cachePath = path.join(opts.cacheDir, safeCacheName(meta.tripId));
    let data = null;
    if (!opts.refresh && fs.existsSync(cachePath)) {
      try {
        data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      } catch {
        data = null;
      }
    }
    if (!data) {
      const fixes = await fetchTripFixes(meta.tripId);
      data = { ...meta, fixes };
      fs.writeFileSync(cachePath, JSON.stringify(data));
    }
    loaded.push(data);
  }
  return { tripList, loaded };
}

// Spatial grid over signs so segment queries are fast across all trips.
const SIGN_CELL_DEG = 0.004; // ~440 m
function buildSignIndex(signs) {
  const cells = new Map();
  for (const sign of signs) {
    const cx = Math.floor(sign[0] / SIGN_CELL_DEG);
    const cy = Math.floor(sign[1] / SIGN_CELL_DEG);
    const key = `${cx}:${cy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(sign);
  }
  return cells;
}

function querySignsNearSegment(signIndex, a, b, marginM) {
  const lat = (a[1] + b[1]) / 2;
  const dx = marginM / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  const dy = marginM / METRES_PER_DEGREE;
  const minX = Math.floor((Math.min(a[0], b[0]) - dx) / SIGN_CELL_DEG);
  const maxX = Math.floor((Math.max(a[0], b[0]) + dx) / SIGN_CELL_DEG);
  const minY = Math.floor((Math.min(a[1], b[1]) - dy) / SIGN_CELL_DEG);
  const maxY = Math.floor((Math.max(a[1], b[1]) + dy) / SIGN_CELL_DEG);
  const found = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const bucket = signIndex.get(`${x}:${y}`);
      if (bucket) found.push(...bucket);
    }
  }
  return found;
}

function segmentProjection(a, b, sign) {
  const lat = (a[1] + b[1]) / 2;
  const sx = METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const dx = (b[0] - a[0]) * sx;
  const dy = (b[1] - a[1]) * METRES_PER_DEGREE;
  const px = (sign[0] - a[0]) * sx;
  const py = (sign[1] - a[1]) * METRES_PER_DEGREE;
  const segLen = Math.hypot(dx, dy);
  if (segLen < 1e-6) return { segLen: 0, t: 0, alongM: 0, perpM: Math.hypot(px, py) };
  const t = (px * dx + py * dy) / (segLen * segLen);
  const alongM = t * segLen;
  const perpM = pointSegmentDistance(sign, a, b);
  return { segLen, t, alongM, perpM };
}

function formatSgt(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  return new Date(ms + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' SGT';
}

class InstrumentedTracker extends RoadDriveTracker {
  constructor(...args) {
    super(...args);
    this.events = []; // { travelled, signId, outcome, limit }
  }
  considerSign(sign) {
    const prevCand = this.candidate;
    const applied = super.considerSign(sign);
    const outcome = applied
      ? 'applied'
      : this.candidate && this.candidate.id === sign.id && this.candidate !== prevCand
        ? 'candidate'
        : 'ignored';
    this.events.push({ travelled: this.travelled, signId: sign.id, outcome, limit: sign.limit });
    return applied;
  }
  applySigns(useSignLimit = true) {
    const prevFallbackId = this.fallbackSign?.id ?? null;
    const beforeHandled = new Set(
      [...this.encounters.entries()].filter(([, e]) => e.handled).map(([id]) => id)
    );
    const eventsBefore = this.events.length;
    super.applySigns(useSignLimit);
    // Record signs handled while on a mapped road (stored into fallbackSign without calling considerSign)
    // or school-zone activations.
    const recordedThisCall = new Set(this.events.slice(eventsBefore).map(e => e.signId));
    for (const [id, entry] of this.encounters.entries()) {
      if (entry.handled && !beforeHandled.has(id) && !recordedThisCall.has(id)) {
        if (!entry.sign[5] && !useSignLimit && !this.schoolZone) {
          this.events.push({ travelled: this.travelled, signId: id, outcome: 'fallback-on-mapped', limit: entry.sign[2] });
        } else if (entry.sign[5] === 'school-start' && this.schoolZone) {
          this.events.push({ travelled: this.travelled, signId: id, outcome: 'school-start', limit: this.config.schoolZoneLimitKph });
        } else if (entry.sign[5] === 'school-end' && this.appliedSignId === id) {
          this.events.push({ travelled: this.travelled, signId: id, outcome: 'school-end', limit: this.limit });
        }
      }
    }
    if (this.fallbackSign?.id && this.fallbackSign.id !== prevFallbackId && !recordedThisCall.has(this.fallbackSign.id)) {
      if (!this.events.slice(eventsBefore).some(e => e.signId === this.fallbackSign.id)) {
        this.events.push({ travelled: this.travelled, signId: this.fallbackSign.id, outcome: 'fallback-on-mapped', limit: this.fallbackSign.limit });
      }
    }
  }
}

function filterSignsToTripBbox(signs, fixes, marginDeg = 0.005) {
  if (!fixes.length) return [];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of fixes) {
    if (f.longitude < minLon) minLon = f.longitude;
    if (f.longitude > maxLon) maxLon = f.longitude;
    if (f.latitude < minLat) minLat = f.latitude;
    if (f.latitude > maxLat) maxLat = f.latitude;
  }
  minLon -= marginDeg; maxLon += marginDeg;
  minLat -= marginDeg; maxLat += marginDeg;
  return signs.filter(s => s[0] >= minLon && s[0] <= maxLon && s[1] >= minLat && s[1] <= maxLat);
}

function verifyTrip(trip, signIndex, sharedMatcher, opts) {
  const fixes = trip.fixes || [];
  const tripSpeedSigns = filterSignsToTripBbox(SPEED_SIGNS, fixes);
  const tripSchoolSigns = filterSignsToTripBbox(SCHOOL_SIGNS, fixes);
  const tracker = new InstrumentedTracker(tripSpeedSigns, CONFIG, tripSchoolSigns, [], []);
  tracker.matcher = sharedMatcher;

  let processedFixes = 0;
  let movedFixes = 0;
  let recordedMatches = 0;
  let recordedMismatches = 0;
  const limitMismatches = [];

  // Pending segment candidates to finalize after the whole trip replays
  // (so delayed corner rechecks / next-fix rear-cone catches are checked accurately).
  const pendingChecks = [];

  let prevAccepted = null; // { index, fix, point, travelled }
  let skippedBetween = []; // statuses of non-processed fixes since prevAccepted
  let maxSegLenM = 0;
  let longSegments60 = 0;
  let longSegments120 = 0;

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const point = [fix.longitude, fix.latitude];
    const status = fix.inference?.processingStatus;
    const shouldProcess = status ? status === 'processed' : inSingapore(point, SG_POLYGONS);

    if (!shouldProcess) {
      skippedBetween.push(status || 'outside-singapore');
      continue;
    }
    processedFixes++;

    const prevLimit = tracker.limit;
    const prevTravelled = tracker.travelled;

    tracker.update(point);

    const moved = tracker.travelled - prevTravelled;
    const acceptedMove = moved > 1e-6 || prevAccepted === null;

    // Compare replayed limit vs recorded limit (if recorded).
    if (Number.isFinite(fix.speedLimitKph)) {
      if (tracker.limit === fix.speedLimitKph) {
        recordedMatches++;
      } else {
        recordedMismatches++;
        if (limitMismatches.length < 15) {
          limitMismatches.push({
            fixIndex: i,
            time: formatSgt(fix.timestamp),
            recorded: fix.speedLimitKph,
            recordedSource: fix.inference?.source ?? null,
            replayed: tracker.limit,
            replayedSource: tracker.schoolZone ? 'school-zone' : tracker.sign?.kind === 'road' ? 'mapped-road' : tracker.sign ? 'sign' : 'default',
            replayedCandidate: tracker.candidate?.limit ?? null,
            road: tracker.roadMatch.road?.name || tracker.roadMatch.road?.code || null,
          });
        }
      }
    }

    if (acceptedMove) {
      if (prevAccepted) {
        movedFixes++;
        const a = prevAccepted.point;
        const b = point;
        const segLen = distance(a, b);
        if (segLen > maxSegLenM) maxSegLenM = segLen;
        if (segLen > CONFIG.signConeRangeM) longSegments60++;
        if (segLen > CONFIG.signConeRangeM * 2) longSegments120++;

        const segHeading = bearing(a, b);
        const dtSec = (fix.timestamp - prevAccepted.fix.timestamp) / 1000;
        const nearbySigns = querySignsNearSegment(signIndex, a, b, opts.maxPerpM + 5);

        for (const sign of nearbySigns) {
          // Skip school-end signs (they only act when inside an explicit school speed zone).
          if (sign[5] === 'school-end') continue;
          const signBearing = sign[3];
          if (!Number.isFinite(signBearing)) continue;
          const segBearingDiff = angleDifference(signBearing, segHeading);
          if (segBearingDiff > opts.maxBearingDeg + 1e-8) continue;

          const proj = segmentProjection(a, b, sign);
          // Sign must project onto the segment [A, B] and be within maxPerpM.
          if (proj.t < -1e-6 || proj.t > 1 + 1e-6) continue;
          if (proj.perpM > opts.maxPerpM + 1e-8) continue;

          const distA = distance(a, sign);
          const distB = distance(b, sign);
          const inAheadA = signInCone(a, sign, segHeading, CONFIG, false);
          const inAheadB = signInCone(b, sign, tracker.heading, CONFIG, false);
          const inBehindB = signInCone(b, sign, tracker.heading, CONFIG, true);
          const trackerHeadingDiff = Number.isFinite(tracker.heading) ? angleDifference(signBearing, tracker.heading) : null;
          const encounterNow = tracker.encounters.get(sign[4]);

          pendingChecks.push({
            fixIndexA: prevAccepted.index,
            fixIndexB: i,
            timeA: prevAccepted.fix.timestamp,
            timeB: fix.timestamp,
            dtSec,
            pointA: a,
            pointB: b,
            segLenM: segLen,
            segHeadingDeg: segHeading,
            trackerHeadingDeg: tracker.heading,
            travelledAtB: tracker.travelled,
            skippedCount: skippedBetween.length,
            skippedStatuses: [...new Set(skippedBetween)],
            signId: sign[4],
            signLimitKph: sign[2],
            signBearingDeg: signBearing,
            signLon: sign[0],
            signLat: sign[1],
            signKind: sign[5] || 'speed',
            perpM: proj.perpM,
            alongM: proj.alongM,
            distAM: distA,
            distBM: distB,
            segBearingDiffDeg: segBearingDiff,
            trackerHeadingDiffDeg: trackerHeadingDiff,
            inAheadA,
            inAheadB,
            inBehindB,
            encounterSeen: Boolean(encounterNow),
            encounterHandled: Boolean(encounterNow?.handled),
            activeLimitBefore: prevLimit,
            activeLimitAfter: tracker.limit,
            activeSourceAfter: tracker.schoolZone ? 'school-zone' : tracker.sign?.kind === 'road' ? 'mapped-road' : tracker.sign ? 'sign' : 'default',
            roadNameAfter: tracker.roadMatch.road?.name || tracker.roadMatch.road?.code || null,
            roadLimitAfter: tracker.roadMatch.road?.limit ?? null,
          });
        }
      }
      prevAccepted = { index: i, fix, point, travelled: tracker.travelled };
      skippedBetween = [];
    }
  }

  // Index tracker capture events by signId.
  const eventsBySign = new Map();
  for (const ev of tracker.events) {
    if (!eventsBySign.has(ev.signId)) eventsBySign.set(ev.signId, []);
    eventsBySign.get(ev.signId).push(ev);
  }

  // Filter out signs that WERE captured by the tracker around that passage
  // (including via paired signs or the 30 m corner recheck window on subsequent fixes).
  const missed = [];
  for (const item of pendingChecks) {
    const events = eventsBySign.get(item.signId) || [];
    const wasCaptured = events.some(
      ev => ev.travelled >= item.travelledAtB - item.segLenM - 50 &&
            ev.travelled <= item.travelledAtB + CONFIG.signRecheckDistanceM + 60
    );
    if (wasCaptured) continue;

    // Classify why it was missed.
    let reason;
    const minEndpointDist = Math.min(item.distAM, item.distBM);
    if (minEndpointDist > CONFIG.signConeRangeM + 1e-8) {
      reason = 'BOTH_FIXES_BEYOND_60M_RANGE';
    } else if (!item.inAheadA && !item.inAheadB && !item.inBehindB) {
      reason = 'OUTSIDE_CONE_AT_BOTH_FIXES';
    } else if (item.distBM > CONFIG.signConeRangeM + 1e-8 || !item.inBehindB) {
      reason = 'PASSED_OUTSIDE_REAR_CONE';
    } else if (item.trackerHeadingDiffDeg !== null && item.trackerHeadingDiffDeg > CONFIG.signBearingToleranceDeg + 1e-8) {
      reason = 'SMOOTHED_HEADING_MISMATCH';
    } else {
      reason = 'OTHER_TRACKER_RULE';
    }

    const wouldDifferFromActive = item.signLimitKph !== item.activeLimitAfter;
    const onMappedRoad = item.activeSourceAfter === 'mapped-road';
    const bothTooFar = minEndpointDist > CONFIG.signConeRangeM + 1e-8 || (!item.inAheadA && !item.inBehindB);

    missed.push({
      ...item,
      minEndpointDistM: minEndpointDist,
      reason,
      bothTooFar,
      wouldDifferFromActive,
      onMappedRoad,
    });
  }

  return {
    tripId: trip.tripId,
    startedAt: trip.startedAt,
    stoppedAt: trip.stoppedAt,
    totalFixes: fixes.length,
    processedFixes,
    movedFixes,
    maxSegLenM,
    longSegments60,
    longSegments120,
    recordedMatches,
    recordedMismatches,
    limitMismatches,
    missed,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { tripList, loaded } = await loadTrips(opts);

  if (opts.list) {
    console.log(`Trips (${tripList.length}):`);
    for (const t of tripList) {
      console.log(`  ${t.tripId} | fixes=${t.fixCount} | chunks=${t.savedChunks}/${t.chunkCount}`);
    }
    return;
  }

  const allSigns = [
    ...SPEED_SIGNS,
    ...SCHOOL_SIGNS.filter(s => s[5] === 'school-end' || (s[5] === 'school-start' && s[2] === CONFIG.schoolZoneLimitKph)),
  ];
  const signIndex = buildSignIndex(allSigns);

  const sharedMatcher = new RoadMatcher(ROAD_FEATURES, ROAD_IDENTITIES, CONFIG);
  const reports = [];
  for (const trip of loaded) {
    reports.push(verifyTrip(trip, signIndex, sharedMatcher, opts));
  }

  // Print concise human-readable summary.
  let totalMissedAll = 0;
  let totalBothTooFar = 0;
  let totalImpactful = 0;

  for (const r of reports) {
    const shown = opts.includeSameLimit
      ? r.missed
      : r.missed.filter(m => m.wouldDifferFromActive || m.reason === 'BOTH_FIXES_BEYOND_60M_RANGE' || m.reason === 'PASSED_OUTSIDE_REAR_CONE');
    totalMissedAll += r.missed.length;
    totalBothTooFar += r.missed.filter(m => m.reason === 'BOTH_FIXES_BEYOND_60M_RANGE' || m.reason === 'OUTSIDE_CONE_AT_BOTH_FIXES' || m.reason === 'PASSED_OUTSIDE_REAR_CONE').length;
    totalImpactful += r.missed.filter(m => m.wouldDifferFromActive && !m.onMappedRoad).length;

    const mismatchSummary = r.recordedMatches + r.recordedMismatches > 0
      ? `replay-vs-recorded=${r.recordedMatches}/${r.recordedMatches + r.recordedMismatches}`
      : 'no-recorded-limit';

    console.log(`\n=== ${r.tripId} ===`);
    console.log(
      `fixes=${r.totalFixes} (processed=${r.processedFixes}, moved=${r.movedFixes}) | maxSeg=${r.maxSegLenM.toFixed(1)}m (>60m:${r.longSegments60}, >120m:${r.longSegments120}) | ${mismatchSummary} | missed=${r.missed.length}`
    );

    if (shown.length) {
      for (const m of shown) {
        const impact = m.onMappedRoad
          ? `mapped=${m.roadLimitAfter} (${m.roadNameAfter || '?'})`
          : m.wouldDifferFromActive
            ? `ACTIVE=${m.activeLimitAfter} -> SIGN=${m.signLimitKph} [!DIFF]`
            : `active=${m.activeLimitAfter} (same)`;
        const gapNote = m.skippedCount ? ` [skipped:${m.skippedCount} ${m.skippedStatuses.join(',')}]` : '';
        console.log(
          `  [${m.reason}] fix ${m.fixIndexA}->${m.fixIndexB} (${formatSgt(m.timeB)}, dt=${m.dtSec.toFixed(1)}s${gapNote}) ` +
          `seg=${m.segLenM.toFixed(1)}m | sign ${m.signId} (${m.signLimitKph} km/h @ ${m.signLat.toFixed(5)},${m.signLon.toFixed(5)}) | ` +
          `perp=${m.perpM.toFixed(1)}m dA=${m.distAM.toFixed(1)}m dB=${m.distBM.toFixed(1)}m | ` +
          `brgDiff=${m.segBearingDiffDeg.toFixed(0)}deg (trk=${m.trackerHeadingDiffDeg === null ? 'n/a' : m.trackerHeadingDiffDeg.toFixed(0) + 'deg'}) | ${impact}`
        );
      }
    }
  }

  console.log(`\n--- Summary across ${reports.length} trip(s) ---`);
  console.log(`Total missed segment-close signs (perp <= ${opts.maxPerpM}m, bearing <= ${opts.maxBearingDeg}deg): ${totalMissedAll}`);
  console.log(`  Missed due to endpoint distance / cone geometry: ${totalBothTooFar}`);
  console.log(`  Unmapped-road misses where sign limit != active limit: ${totalImpactful}`);

  if (opts.jsonOut) {
    fs.mkdirSync(path.dirname(opts.jsonOut), { recursive: true });
    fs.writeFileSync(opts.jsonOut, JSON.stringify(reports, null, 2));
    console.log(`Detailed JSON written to ${opts.jsonOut}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
