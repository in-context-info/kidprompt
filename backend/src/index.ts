import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./env";
import { auth } from "./routes/auth";
import { creators } from "./routes/creators";
import { projects } from "./routes/projects";
import { publicRoutes } from "./routes/public";
import { play } from "./routes/play";
import { guest } from "./routes/guest";

const api = new Hono<{ Bindings: Env }>().basePath("/api");
api.route("/", auth);
api.route("/", creators);
api.route("/", projects);
api.route("/", publicRoutes);
api.route("/", guest);

// Malformed JSON throws before any zod hook runs — normalize it to the API's
// {error} shape. Everything else is logged and answered as a JSON 500 rather
// than escaping the Worker as a bare 1101 page.
api.onError((err, c) => {
  if (err instanceof HTTPException && err.status === 400) return c.json({ error: "Invalid request body." }, 400);
  console.error("Unhandled API error", err);
  return c.json({ error: "Something went wrong." }, 500);
});
api.notFound((c) => c.json({ error: "Not found." }, 404));

const playApp = new Hono<{ Bindings: Env }>().basePath("/play");
playApp.route("/", play);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(request, env, ctx);
    if (url.pathname.startsWith("/play/")) return playApp.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
