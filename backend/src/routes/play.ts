import { Hono } from "hono";
import type { Env } from "../env";
import { requireSession } from "./auth";

export const play = new Hono<{ Bindings: Env }>();

// Kid-made html is untrusted code, so it is served with a CSP sandbox: the
// page gets an opaque origin (no cookies, no storage, no same-origin access to
// kidprompt.ai or its API), and connect/img/script sources allow nothing from
// the network — a game can't phone home or pull in outside content, whatever
// its code says. Inline script and style are allowed because every game is
// one self-contained file.
export const PLAY_CSP = [
  "sandbox allow-scripts allow-pointer-lock allow-modals",
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function htmlResponse(html: string, cache: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PLAY_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": cache,
    },
  });
}

const NOT_FOUND = `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h1>🙈</h1><p>This game isn't here (yet!).</p></body></html>`;

// The owner's current draft, for the editor's live preview.
play.get("/draft/:id", async (c) => {
  const email = await requireSession(c);
  if (!email) return htmlResponse(NOT_FOUND, "no-store");
  const row = await c.env.DB.prepare("SELECT html FROM projects WHERE id = ? AND owner_email = ?")
    .bind(c.req.param("id"), email)
    .first<{ html: string }>();
  return htmlResponse(row?.html || NOT_FOUND, "no-store");
});

play.get("/:slug", async (c) => {
  const row = await c.env.DB.prepare("SELECT published_html FROM projects WHERE slug = ? AND published_html IS NOT NULL")
    .bind(c.req.param("slug"))
    .first<{ published_html: string }>();
  if (!row) return htmlResponse(NOT_FOUND, "no-store");
  return htmlResponse(row.published_html, "public, max-age=60");
});
