import { Hono } from "hono";
import type { Env } from "./env";
import { auth, requireAdminSession } from "./routes/auth";
import { review } from "./routes/review";

const app = new Hono<{ Bindings: Env }>();

app.route("/", auth);

// Unauthenticated liveness probe: a trivial D1 round-trip, reveals nothing.
app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true });
  } catch (err) {
    console.error("admin health check D1 probe failed:", err);
    return c.json({ ok: false, error: "db_unavailable" }, 503);
  }
});

// Everything below requires a valid admin session.
app.use("*", async (c, next) => {
  const ok = await requireAdminSession(c.req.raw, c.env);
  if (!ok) return c.redirect("/login");
  await next();
});

app.route("/", review);

export default app;
