import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Link } from "../router";
import { C, FONT_DISPLAY, button, card, input } from "../theme";

// "Try it" without an account: one free build, then a free family account is
// needed to change it again, save it, or share it. Signing up or logging in moves
// this game into the account (backend lib/guest.ts claimGuestProject).

const STARTERS = [
  "A game where a cat jumps over clouds and collects stars",
  "A quiz about dinosaurs with 10 questions",
  "A drawing app with rainbow brushes and stickers",
  "A racing game with a snail and a turtle",
];

const BUILDING_LINES = ["Mixing the pixels…", "Teaching the buttons to click…", "Painting the background…", "Adding a sprinkle of fun…", "Almost there…"];

interface GuestState {
  project: { title: string; hasHtml: boolean; prompts: string[] } | null;
  buildsLeft: number;
}

interface ChatLine {
  who: "kid" | "builder";
  text: string;
}

export function TryIt() {
  const [state, setState] = useState<GuestState | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildLine, setBuildLine] = useState(0);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = async () => {
    const s = await api<GuestState>("guest");
    setState(s);
    return s;
  };

  useEffect(() => {
    load()
      .then((s) => {
        if (s.project) setChat(s.project.prompts.map((p) => ({ who: "kid" as const, text: p })));
        if (s.buildsLeft <= 0) setNeedsAccount(true);
      })
      .catch(() => setState({ project: null, buildsLeft: 0 }));
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, building]);

  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => setBuildLine((n) => (n + 1) % BUILDING_LINES.length), 3500);
    return () => clearInterval(t);
  }, [building]);

  if (!state) return <p style={{ textAlign: "center", color: C.sub }}>Loading…</p>;

  const hasGame = !!state.project?.hasHtml;

  const build = async (text: string) => {
    const words = text.trim();
    if (!words || building) return;
    setPrompt("");
    setChat((c) => [...c, { who: "kid", text: words }]);
    setBuilding(true);
    try {
      const r = await api<{ message: string; buildsLeft: number }>("guest/build", {
        method: "POST",
        body: { prompt: words, title },
        timeoutMs: 5 * 60 * 1000,
      });
      setChat((c) => [...c, { who: "builder", text: r.message }]);
      await load();
      setPreviewKey((k) => k + 1);
      if (r.buildsLeft <= 0) setNeedsAccount(true);
    } catch (e) {
      setChat((c) => [...c, { who: "builder", text: (e as Error).message }]);
      if (e instanceof ApiError && e.status === 429) setNeedsAccount(true);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "4px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 30, margin: 0, flex: "1 1 260px" }}>
          🎮 {state.project?.title ?? "Try it — no account needed"}
        </h1>
        {!hasGame && <span style={{ color: C.sub, fontWeight: 600 }}>1 free build, no account needed</span>}
        <Link to="/signup" style={button(hasGame ? "primary" : "ghost")}>
          {hasGame ? "💾 Save & share it" : "Make a family account"}
        </Link>
      </div>

      {hasGame && (
        <div
          style={{
            ...card,
            padding: "14px 18px",
            marginBottom: 14,
            background: "linear-gradient(135deg, #FFF1E0, #FFF8D6)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 26 }}>{needsAccount ? "🎉" : "✨"}</span>
          <div style={{ flex: "1 1 280px", lineHeight: 1.45 }}>
            {needsAccount ? (
              <>
                <b>That was your free build!</b> To change it, save it, and share it with family and friends, a grown-up can make a
                free family account. This game comes with you.
              </>
            ) : (
              <>
                <b>Love it?</b> A grown-up can make a free family account to save it and share it. This game comes with you.
              </>
            )}
          </div>
          <Link to="/signup" style={button("primary")}>
            Make a free account
          </Link>
          <Link to="/login" style={{ color: C.sub, fontWeight: 600, fontSize: 14 }}>
            I have one
          </Link>
        </div>
      )}

      <div className="kp-editor" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 16 }}>
        <section style={{ ...card, display: "flex", flexDirection: "column", height: "min(72vh, 740px)", minHeight: 420 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {chat.length === 0 && (
              <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Name your game</label>
                <input
                  style={{ ...input, marginBottom: 16 }}
                  placeholder="e.g. Space Cat Jumper"
                  value={title}
                  maxLength={60}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p style={{ fontWeight: 700, margin: "0 0 10px" }}>What should we build? Try one:</p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    style={{ ...button("ghost"), display: "block", width: "100%", textAlign: "left", borderRadius: 14, marginBottom: 8, fontWeight: 500 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {chat.map((line, i) => (
              <div key={i} style={{ display: "flex", justifyContent: line.who === "kid" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 18,
                    background: line.who === "kid" ? `linear-gradient(135deg, ${C.coral}, ${C.sun})` : C.soft,
                    color: line.who === "kid" ? "#fff" : C.ink,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {line.who === "builder" && "🪄 "}
                  {line.text}
                </div>
              </div>
            ))}
            {building && (
              <div style={{ padding: "10px 14px", borderRadius: 18, background: C.soft, display: "inline-block" }}>
                <span style={{ display: "inline-block", animation: "wiggle 1s ease-in-out infinite" }}>🪄</span> {BUILDING_LINES[buildLine]}
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              build(prompt);
            }}
            style={{ borderTop: `1px solid ${C.line}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  build(prompt);
                }
              }}
              disabled={needsAccount}
              placeholder={needsAccount ? "Make a free account to keep changing it" : hasGame ? "What should change? e.g. make the cat purple" : "Describe your game or app…"}
              rows={3}
              maxLength={2000}
              style={{ ...input, resize: "none" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {needsAccount ? (
                <Link to="/signup" style={button("primary")}>
                  Make a free account to keep going
                </Link>
              ) : (
                <button type="submit" disabled={building || !prompt.trim()} style={button("primary")}>
                  {building ? "Building…" : hasGame ? "Change it ✨" : "Build it ✨"}
                </button>
              )}
            </div>
          </form>
        </section>

        <section style={{ ...card, display: "flex", flexDirection: "column", height: "min(72vh, 740px)", minHeight: 420, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, padding: 10, borderBottom: `1px solid ${C.line}`, alignItems: "center" }}>
            <span style={{ ...button("primary"), padding: "7px 14px", fontSize: 14 }}>▶ Play</span>
            <span style={{ flex: 1 }} />
            {hasGame && (
              <button onClick={() => setPreviewKey((k) => k + 1)} style={{ ...button("ghost"), padding: "7px 12px", fontSize: 14 }}>
                ↻ Restart
              </button>
            )}
          </div>
          {hasGame ? (
            <iframe
              key={previewKey}
              title="Preview"
              src={`/play/guest/current?v=${previewKey}`}
              sandbox="allow-scripts allow-pointer-lock allow-modals"
              style={{ flex: 1, border: "none", width: "100%", background: "#fff" }}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, textAlign: "center", padding: 24 }}>
              <div>
                <div style={{ fontSize: 54 }}>🧱</div>
                Your game will appear here.
                <br />
                Describe it on the left and press <b>Build it</b>!
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
