import { readFileSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Timestamp } from "@google-cloud/firestore";
import { getFirestore } from "../firestore.js";

const CHUNK_SIZE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = value => createHash("sha256").update(value).digest();
const validTime = value => Number.isFinite(value) && Number.isFinite(new Date(value).getTime());
const optionalNumber = value => value === null || Number.isFinite(value);

function readPassword() {
  try {
    return readFileSync(new URL("../../secrets/speedlimitpassword.txt", import.meta.url), "utf8").replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

function validTrip(body) {
  const { tripId, startedAt, stoppedAt, fixCount, chunkIndex, chunkCount, fixes } = body;
  if (!validTime(startedAt) || !validTime(stoppedAt) || stoppedAt < startedAt) return false;
  const prefix = `${new Date(startedAt).toISOString()}_`;
  if (typeof tripId !== "string" || !tripId.startsWith(prefix) || !UUID.test(tripId.slice(prefix.length))) return false;
  if (!Number.isSafeInteger(fixCount) || fixCount < 0 || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 ||
      chunkCount !== Math.max(1, Math.ceil(fixCount / CHUNK_SIZE)) || chunkIndex >= chunkCount) return false;
  const expectedLength = Math.min(CHUNK_SIZE, fixCount - chunkIndex * CHUNK_SIZE);
  return Array.isArray(fixes) && fixes.length === expectedLength && fixes.every(fix =>
    fix && validTime(fix.timestamp) && Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90 &&
    Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180 &&
    ["accuracy", "altitude", "altitudeAccuracy", "heading", "speed"].every(key => optionalNumber(fix[key])));
}

export function createSpeedlimitRoutes({ password = readPassword(), getDatabase = getFirestore } = {}) {
  const routes = new Hono();
  const expectedHash = hash(password);
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  routes.use("*", bodyLimit({ maxSize: 512 * 1024, onError: c => c.json({ error: "Request too large" }, 413) }));
  routes.use("*", async (c, next) => {
    if (!password) return c.json({ error: "Recording password unavailable" }, 503);
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body.password !== "string" || !timingSafeEqual(hash(body.password), expectedHash)) {
      return c.json({ error: "Incorrect password" }, 401);
    }
    c.set("body", body);
    await next();
  });
  routes.post("/validate", c => c.json({ ok: true }));
  routes.post("/trips", async c => {
    const body = c.get("body");
    if (!validTrip(body)) return c.json({ error: "Invalid trip data" }, 400);
    const { tripId, startedAt, stoppedAt, fixCount, chunkIndex, chunkCount } = body;
    // Whitelist fields so the submitted password can never become stored data.
    const fixes = body.fixes.map(fix => Object.fromEntries(
      ["timestamp", "latitude", "longitude", "accuracy", "altitude", "altitudeAccuracy", "heading", "speed"].map(key => [key, fix[key]])
    ));
    try {
      const db = getDatabase();
      const trip = db.collection("SpeedLimit").doc(tripId);
      const batch = db.batch();
      batch.set(trip, {
        startedAt: Timestamp.fromMillis(startedAt), stoppedAt: Timestamp.fromMillis(stoppedAt),
        fixCount, chunkCount, savedChunks: { [String(chunkIndex)]: true },
      }, { merge: true });
      // Stable chunk IDs make a retry safe even if the previous response was lost.
      batch.set(trip.collection("fixes").doc(String(chunkIndex).padStart(6, "0")), { chunkIndex, fixes });
      await batch.commit();
      return c.json({ ok: true, tripId, chunkIndex });
    } catch {
      console.error("speedlimit: trip batch could not be saved");
      return c.json({ error: "Trip could not be saved. Retry the save." }, 503);
    }
  });
  return routes;
}
