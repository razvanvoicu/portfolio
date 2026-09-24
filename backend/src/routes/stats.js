import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { FieldValue } from "@google-cloud/firestore";
import { getFirestore } from "../firestore.js";

// Opaque per-browser identifier: either a fresh randomUUID(), or one we
// already handed out (read back from the cookie or from localStorage via the
// request body). Reject anything that doesn't look like one of ours before
// using it as a Firestore document ID.
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,100}$/;

export const statsRoutes = new Hono();

function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function clientIp(c) {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Cookies can only be scoped to the exact host, or to a parent domain of it.
// "qr.raz.sg" (3 labels) can share a cookie at "raz.sg" with its siblings.
// "qr.raz" (2 labels, local dev) has no shareable parent, so we leave the
// cookie host-only rather than send an invalid/rejected Domain attribute.
function cookieDomain(host) {
  const labels = host.split(".");
  return labels.length >= 3 ? labels.slice(-2).join(".") : null;
}

async function readBodyKey(c) {
  try {
    const body = await c.req.json();
    if (body && typeof body.key === "string") return body.key;
  } catch {
    // Empty or non-JSON body is fine; treat as "no key supplied".
  }
  return null;
}

statsRoutes.get("/healthz", (c) => c.text("ok"));

statsRoutes.post("/visit", async (c) => {
  const siteHost = c.req.header("x-site-host") || c.req.header("host") || "unknown";
  const cookieKey = parseCookie(c.req.header("cookie"), "sid");
  const bodyKey = await readBodyKey(c);

  const candidate = cookieKey || bodyKey;
  const key = candidate && KEY_PATTERN.test(candidate) ? candidate : randomUUID();

  // Best-effort: a Firestore hiccup should never break the page that called us.
  try {
    const db = getFirestore();
    const appRef = db.collection("SiteAccess").doc(siteHost);
    const browserRef = appRef.collection("browsers").doc(key);
    await Promise.all([
      appRef.set({ host: siteHost, lastSeen: FieldValue.serverTimestamp() }, { merge: true }),
      browserRef.set(
        {
          lastSeen: FieldValue.serverTimestamp(),
          accesses: FieldValue.arrayUnion({ ip: clientIp(c), at: new Date() }),
        },
        { merge: true }
      ),
    ]);
  } catch (error) {
    console.error("stats: failed to record visit for", siteHost, error);
  }

  const domain = cookieDomain(siteHost);
  const attrs = ["Path=/", "Max-Age=31536000", "HttpOnly", "SameSite=Lax"];
  if (domain) attrs.push(`Domain=${domain}`);
  if (c.req.header("x-forwarded-proto") === "https") attrs.push("Secure");
  c.header("Set-Cookie", `sid=${encodeURIComponent(key)}; ${attrs.join("; ")}`);

  return c.json({ key });
});
