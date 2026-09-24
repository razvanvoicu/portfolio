import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { statsRoutes } from "./routes/stats.js";

// Firestore's client can reject internal (retry/auth) promises that aren't
// reachable from our own try/catch around the write. This is a best-effort
// stats sink: it must never take the whole backend down.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

const app = new Hono();
app.route("/stats", statsRoutes);

// Not PORT: Cloud Run/nginx already own that (nginx listens on 8080 as the
// container's public port). This backend is only reachable through nginx's
// internal reverse proxy, on its own dedicated port.
const port = Number(process.env.BACKEND_PORT) || 8081;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`backend listening on :${info.port}`);
});
