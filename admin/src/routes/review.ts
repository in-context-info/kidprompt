import { Hono } from "hono";
import type { Env } from "../env";
import { escapeHtml, nav, page, when } from "../lib/layout";
import { costUsd, PREVIEW_CSP } from "../lib/shared";

export const review = new Hono<{ Bindings: Env }>();

interface QueueRow {
  id: string;
  title: string;
  slug: string;
  emoji: string;
  kind: string;
  owner_email: string;
  owner_name: string;
  nickname: string | null;
  submitted_at: number | null;
  is_live: number;
}

review.get("/", async (c) => {
  const queue = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.slug, p.emoji, p.kind, p.owner_email, u.name AS owner_name, cr.nickname, p.submitted_at,
       p.published_html IS NOT NULL AS is_live
     FROM projects p JOIN users u ON u.email = p.owner_email LEFT JOIN creators cr ON cr.id = p.creator_id
     WHERE p.status = 'submitted' ORDER BY p.submitted_at`,
  ).all<QueueRow>();

  const stats = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM creators"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM projects"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE published_html IS NOT NULL"),
    c.env.DB.prepare("SELECT COALESCE(SUM(plays), 0) AS n FROM projects"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM token_usage WHERE email NOT LIKE 'guest:%' AND created_at > ?").bind(Date.now() - 86_400_000),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM token_usage WHERE email LIKE 'guest:%' AND created_at > ?").bind(Date.now() - 86_400_000),
  ]);
  const n = (i: number) => (stats[i].results[0] as { n: number }).n;

  const rows = queue.results
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.emoji)} <a href="/review/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a>
          ${r.is_live ? '<span class="pill">update to live game</span>' : ""}</td>
        <td>${escapeHtml(r.nickname ?? "—")}</td>
        <td>${escapeHtml(r.owner_name)}<div class="muted">${escapeHtml(r.owner_email)}</div></td>
        <td class="muted">${when(r.submitted_at)}</td>
      </tr>`,
    )
    .join("");

  return c.html(
    page(
      "Review queue",
      `${nav("review")}
      <div class="card"><div class="stat-grid">
        ${[
          ["Families", n(0)],
          ["Kid creators", n(1)],
          ["Projects", n(2)],
          ["Live games", n(3)],
          ["Total plays", n(4)],
          ["Family builds (24h)", n(5)],
          ["Guest builds (24h)", n(6)],
        ]
          .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
          .join("")}
      </div></div>
      <div class="card"><h2>Waiting for review (${queue.results.length})</h2>
        ${
          queue.results.length
            ? `<div class="table-wrap"><table><tr><th>Project</th><th>Kid</th><th>Family</th><th>Submitted</th></tr>${rows}</table></div>`
            : '<p class="muted">Nothing to review. 🎉</p>'
        }
      </div>`,
    ),
  );
});

review.get("/review/:id", async (c) => {
  const p = await c.env.DB.prepare(
    `SELECT p.*, u.name AS owner_name, cr.nickname, cr.emoji AS creator_emoji
     FROM projects p JOIN users u ON u.email = p.owner_email LEFT JOIN creators cr ON cr.id = p.creator_id
     WHERE p.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{
      id: string;
      title: string;
      slug: string;
      emoji: string;
      kind: string;
      description: string;
      status: string;
      review_note: string | null;
      owner_email: string;
      owner_name: string;
      nickname: string | null;
      creator_emoji: string | null;
      html: string;
      published_html: string | null;
      submitted_at: number | null;
    }>();
  if (!p) return c.html(page("Not found", `${nav("review")}<p>Project not found.</p>`), 404);

  const prompts = await c.env.DB.prepare(
    "SELECT prompt, created_at FROM project_versions WHERE project_id = ? ORDER BY id",
  )
    .bind(p.id)
    .all<{ prompt: string; created_at: number }>();

  const sizeKb = Math.round(new TextEncoder().encode(p.html).length / 1024);
  // Quick red flags for a human to look at — the CSP already blocks the network,
  // this is just so a reviewer notices code that tries.
  const flags = [
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i, "tries to use the network"],
    [/<script[^>]+src=|<link[^>]+href=["']https?:/i, "loads outside files"],
    [/<form|<input[^>]+type=["']?(email|tel|password)/i, "has a form or asks for details"],
    [/https?:\/\//i, "contains a web address"],
  ]
    .filter(([re]) => (re as RegExp).test(p.html))
    .map(([, label]) => `<span class="pill" style="background:#fdecea;color:#d8433b">⚠ ${label}</span>`)
    .join(" ");

  return c.html(
    page(
      `Review ${p.title}`,
      `${nav("review")}
      <div class="row" style="margin-bottom:14px"><h2>${escapeHtml(p.emoji)} ${escapeHtml(p.title)}</h2>
        <span class="pill">${escapeHtml(p.status)}</span> ${p.published_html ? '<span class="pill">live</span>' : ""}</div>
      <div class="review">
        <div><iframe class="preview" src="/preview/${escapeHtml(p.id)}" sandbox="allow-scripts allow-pointer-lock allow-modals"></iframe>
          <p class="muted">${sizeKb} KB · ${escapeHtml(p.kind)} ${flags}</p></div>
        <div>
          <div class="card">
            <div><b>Kid:</b> ${escapeHtml(p.creator_emoji ?? "")} ${escapeHtml(p.nickname ?? "—")}</div>
            <div><b>Family:</b> ${escapeHtml(p.owner_name)} <span class="muted">${escapeHtml(p.owner_email)}</span></div>
            <div class="muted">Submitted ${when(p.submitted_at)}</div>
            ${p.review_note ? `<p><b>Last note:</b> ${escapeHtml(p.review_note)}</p>` : ""}
          </div>
          <div class="card">
            <form method="POST" action="/review/${escapeHtml(p.id)}/approve" style="margin-bottom:10px">
              <label class="muted">Description shown in the Arcade (optional)</label>
              <textarea name="description" rows="2" maxlength="280">${escapeHtml(p.description)}</textarea>
              <button type="submit" style="margin-top:8px;width:100%">✅ Approve & publish</button>
            </form>
            <form method="POST" action="/review/${escapeHtml(p.id)}/reject">
              <label class="muted">What should they change? (shown to the family)</label>
              <textarea name="note" rows="3" maxlength="500" required></textarea>
              <button class="danger" type="submit" style="margin-top:8px;width:100%">Send back with a note</button>
            </form>
            ${
              p.published_html
                ? `<form method="POST" action="/review/${escapeHtml(p.id)}/unpublish" style="margin-top:10px"
                     onsubmit="return confirm('Take this game off the Arcade?')">
                     <button class="ghost" type="submit" style="width:100%">Take the live version down</button></form>
                   <p class="muted"><a href="${escapeHtml(c.env.PUBLIC_ORIGIN)}/g/${escapeHtml(p.slug)}" target="_blank">View live ↗</a></p>`
                : ""
            }
          </div>
          <div class="card"><b>How it was made</b>
            <ol class="prompts">${prompts.results.map((v) => `<li>${escapeHtml(v.prompt)}</li>`).join("") || '<li class="muted">Pasted code, no prompts</li>'}</ol>
          </div>
        </div>
      </div>`,
    ),
  );
});

// The draft html, sandboxed exactly like /play so a reviewer runs it safely.
review.get("/preview/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT html FROM projects WHERE id = ?").bind(c.req.param("id")).first<{ html: string }>();
  return new Response(row?.html || "<p>No code.</p>", {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PREVIEW_CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
});

review.post("/review/:id/approve", async (c) => {
  const body = await c.req.parseBody();
  const description = String(body.description || "").trim().slice(0, 280);
  const now = Date.now();
  // published_html is copied from html at approval time — what was reviewed is
  // exactly what goes live. COALESCE keeps the first publish date on updates.
  await c.env.DB.prepare(
    `UPDATE projects SET status = 'published', published_html = html, description = ?, review_note = NULL,
       published_at = COALESCE(published_at, ?), updated_at = ?
     WHERE id = ? AND status = 'submitted'`,
  )
    .bind(description, now, now, c.req.param("id"))
    .run();
  return c.redirect("/");
});

review.post("/review/:id/reject", async (c) => {
  const body = await c.req.parseBody();
  const note = String(body.note || "").trim().slice(0, 500);
  await c.env.DB.prepare("UPDATE projects SET status = 'rejected', review_note = ? WHERE id = ? AND status = 'submitted'")
    .bind(note || "Please make a few changes and share it again.", c.req.param("id"))
    .run();
  return c.redirect("/");
});

review.post("/review/:id/unpublish", async (c) => {
  await c.env.DB.prepare(
    `UPDATE projects SET published_html = NULL,
       status = CASE WHEN status = 'published' THEN 'draft' ELSE status END
     WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .run();
  return c.redirect("/live");
});

review.get("/live", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.slug, p.emoji, p.plays, p.published_at, cr.nickname, p.owner_email
     FROM projects p LEFT JOIN creators cr ON cr.id = p.creator_id
     WHERE p.published_html IS NOT NULL ORDER BY p.published_at DESC`,
  ).all<{ id: string; title: string; slug: string; emoji: string; plays: number; published_at: number; nickname: string | null; owner_email: string }>();
  const body = rows.results
    .map(
      (r) => `<tr><td>${escapeHtml(r.emoji)} <a href="/review/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a></td>
        <td>${escapeHtml(r.nickname ?? "—")}<div class="muted">${escapeHtml(r.owner_email)}</div></td>
        <td>${r.plays}</td><td class="muted">${when(r.published_at)}</td>
        <td><a href="${escapeHtml(c.env.PUBLIC_ORIGIN)}/g/${escapeHtml(r.slug)}" target="_blank">open ↗</a></td></tr>`,
    )
    .join("");
  return c.html(
    page(
      "Live games",
      `${nav("live")}<div class="card"><h2>Live games (${rows.results.length})</h2>
      <div class="table-wrap"><table><tr><th>Game</th><th>Kid</th><th>Plays</th><th>Published</th><th></th></tr>${body}</table></div></div>`,
    ),
  );
});

review.get("/families", async (c) => {
  const since = Date.now() - 30 * 86_400_000;
  const users = await c.env.DB.prepare(
    `SELECT u.email, u.name, u.status, u.created_at,
       (SELECT COUNT(*) FROM creators WHERE owner_email = u.email) AS kids,
       (SELECT COUNT(*) FROM projects WHERE owner_email = u.email) AS projects
     FROM users u ORDER BY u.created_at DESC`,
  ).all<{ email: string; name: string; status: string; created_at: number; kids: number; projects: number }>();
  const usage = await c.env.DB.prepare(
    `SELECT email, model, COUNT(*) AS builds, SUM(input_tokens) AS input, SUM(output_tokens) AS output
     FROM token_usage WHERE created_at > ? GROUP BY email, model`,
  )
    .bind(since)
    .all<{ email: string; model: string; builds: number; input: number; output: number }>();
  const failures = await c.env.DB.prepare("SELECT reason, COUNT(*) AS n FROM claude_call_failures WHERE created_at > ? GROUP BY reason")
    .bind(since)
    .all<{ reason: string; n: number }>();

  const perUser = new Map<string, { builds: number; cost: number }>();
  let totalCost = 0;
  for (const u of usage.results) {
    const cost = costUsd(u.model, u.input, u.output);
    totalCost += cost;
    const cur = perUser.get(u.email) ?? { builds: 0, cost: 0 };
    perUser.set(u.email, { builds: cur.builds + u.builds, cost: cur.cost + cost });
  }

  const rows = users.results
    .map((u) => {
      const use = perUser.get(u.email);
      const next = u.status === "active" ? "suspended" : "active";
      return `<tr><td>${escapeHtml(u.name)}<div class="muted">${escapeHtml(u.email)}</div></td>
        <td>${u.kids}</td><td>${u.projects}</td><td>${use?.builds ?? 0}</td><td>$${(use?.cost ?? 0).toFixed(2)}</td>
        <td class="muted">${when(u.created_at)}</td>
        <td><form method="POST" action="/families/status"><input type="hidden" name="email" value="${escapeHtml(u.email)}" />
          <input type="hidden" name="status" value="${next}" />
          <button class="${u.status === "active" ? "danger" : "ghost"}" type="submit">${u.status === "active" ? "Pause" : "Reactivate"}</button></form></td></tr>`;
    })
    .join("");

  return c.html(
    page(
      "Families",
      `${nav("families")}
      <div class="card"><div class="stat-grid">
        <div class="stat"><div class="label">AI cost, last 30 days (est., incl. guests)</div><div class="value">$${totalCost.toFixed(2)}</div></div>
        <div class="stat"><div class="label">Failed builds, 30 days</div><div class="value">${failures.results.reduce((s, f) => s + f.n, 0)}</div>
          <div class="muted">${failures.results.map((f) => `${escapeHtml(f.reason)}: ${f.n}`).join(" · ")}</div></div>
      </div></div>
      <div class="card"><h2>Families (${users.results.length})</h2>
      <div class="table-wrap"><table><tr><th>Grown-up</th><th>Kids</th><th>Projects</th><th>Builds (30d)</th><th>Cost (30d)</th><th>Joined</th><th></th></tr>${rows}</table></div></div>`,
    ),
  );
});

review.post("/families/status", async (c) => {
  const body = await c.req.parseBody();
  const status = body.status === "suspended" ? "suspended" : "active";
  await c.env.DB.prepare("UPDATE users SET status = ? WHERE email = ?").bind(status, String(body.email || "")).run();
  return c.redirect("/families");
});
