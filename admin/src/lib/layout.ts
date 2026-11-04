// Minimal server-rendered shell — no build step, no client-side framework.
// Visually matches the main app (Fraunces + Figtree, coral/sun accent) without
// importing frontend/'s theme.ts: separate Workers share no code.
//
// Plain string templates, escaped explicitly: call escapeHtml() on every
// database-sourced string at the point it's interpolated.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} — KidPrompt Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Figtree", system-ui, sans-serif; background: #fff8ef; color: #2a2235; }
      h1, h2 { font-family: "Fraunces", Georgia, serif; font-weight: 600; margin: 0; }
      a { color: #e0603f; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 64px; }
      .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
      .nav { display: flex; gap: 6px; margin-bottom: 22px; flex-wrap: wrap; }
      .nav a { padding: 8px 14px; border-radius: 999px; background: #fff1e0; color: #2a2235; text-decoration: none; font-weight: 600; font-size: 14px; }
      .nav a.active { background: linear-gradient(135deg, #ff7a59, #ffb627); color: #fff; }
      .card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 18px; border: 1px solid #f0e4d4; }
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .stat { background: #fff1e0; border-radius: 12px; padding: 12px 14px; }
      .stat .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6578; }
      .stat .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 14px; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f0e4d4; vertical-align: top; word-break: break-word; }
      th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #6e6578; }
      .muted { color: #6e6578; font-size: 13px; }
      .review { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
      @media (max-width: 800px) { .review { grid-template-columns: 1fr; } }
      iframe.preview { width: 100%; height: 560px; border: 1px solid #f0e4d4; border-radius: 12px; background: #fff; }
      input, textarea, select { font: inherit; padding: 9px 11px; border: 1.5px solid #f0e4d4; border-radius: 10px; width: 100%; }
      button { font: inherit; font-weight: 700; border: none; border-radius: 999px; padding: 9px 16px; cursor: pointer; background: linear-gradient(135deg, #ff7a59, #ffb627); color: #fff; }
      button.ghost { background: #fff1e0; color: #2a2235; }
      button.danger { background: #fdecea; color: #d8433b; }
      .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .error { background: #fdecea; color: #d8433b; padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; }
      .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #fff1e0; }
      .prompts li { margin-bottom: 6px; }
    </style>
  </head>
  <body><div class="wrap">${body}</div></body>
</html>`;
}

export function nav(active: "review" | "live" | "families"): string {
  const link = (key: typeof active, href: string, label: string) =>
    `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`;
  return `<div class="topbar"><h1>KidPrompt Admin</h1>
    <form method="POST" action="/logout"><button class="ghost" type="submit">Log out</button></form></div>
    <div class="nav">${link("review", "/", "Review queue")}${link("live", "/live", "Live games")}${link("families", "/families", "Families & usage")}</div>`;
}

export function when(ms: number | null): string {
  return ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}
