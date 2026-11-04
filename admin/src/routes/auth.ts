import { Hono } from "hono";
import type { Env } from "../env";
import {
  adminSessionCookieHeader,
  clearAdminSessionCookieHeader,
  createAdminSessionToken,
  getCookie,
  verifyAdminSessionToken,
  verifyPassword,
} from "../lib/auth";
import { escapeHtml, page } from "../lib/layout";

export const auth = new Hono<{ Bindings: Env }>();

export async function requireAdminSession(request: Request, env: Env): Promise<boolean> {
  return verifyAdminSessionToken(getCookie(request, "admin_session"), env.ADMIN_SESSION_SECRET);
}

function loginPage(error?: string) {
  return page(
    "Sign in",
    `
    <div class="topbar"><h1>KidPrompt Admin</h1></div>
    <div class="card" style="max-width:360px;margin:64px auto 0;">
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <form method="POST" action="/login" style="display:flex;flex-direction:column;gap:12px;">
        <input type="email" name="email" placeholder="Email" required autofocus />
        <input type="password" name="password" placeholder="Password" required />
        <button type="submit">Sign in</button>
      </form>
    </div>
  `,
  );
}

auth.get("/login", (c) => c.html(loginPage()));

auth.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");

  const validEmail = email === c.env.ADMIN_EMAIL.trim().toLowerCase();
  const validPassword = validEmail && (await verifyPassword(password, c.env.ADMIN_PASSWORD_SALT, c.env.ADMIN_PASSWORD_HASH));

  if (!validEmail || !validPassword) {
    return c.html(loginPage("Incorrect email or password."), 401);
  }

  const token = await createAdminSessionToken(c.env.ADMIN_SESSION_SECRET);
  c.header("Set-Cookie", adminSessionCookieHeader(token));
  return c.redirect("/");
});

auth.post("/logout", (c) => {
  c.header("Set-Cookie", clearAdminSessionCookieHeader);
  return c.redirect("/login");
});
