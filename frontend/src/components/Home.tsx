import { useEffect, useState } from "react";
import { api, type GalleryItem, type Me } from "../api";
import { Link } from "../router";
import { C, FONT_DISPLAY, button, card } from "../theme";

const STEPS = [
  { emoji: "💡", title: "Dream it", text: "A kid types an idea, like “a cat that jumps over rainbow clouds and collects stars.”" },
  { emoji: "🪄", title: "Build it", text: "KidPrompt turns the words into a real game or app in about a minute. Then keep asking for changes." },
  { emoji: "🚀", title: "Share it", text: "A grown-up checks it, and it goes live on kidprompt.ai for family and friends to play." },
];

const IDEAS = ["🐱 Rainbow cat jumper", "🧮 Times-table racing", "🎨 Drawing pad with stickers", "🐠 Feed-the-fish clicker", "🌋 Volcano quiz"];

export function Home({ me }: { me: Me | null | undefined }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [sort, setSort] = useState<"new" | "popular">("new");

  useEffect(() => {
    api<{ items: GalleryItem[] }>(`gallery?sort=${sort}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [sort]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px" }}>
      <section style={{ textAlign: "center", padding: "48px 0 36px" }}>
        <div style={{ fontSize: 56, display: "inline-block", animation: "wiggle 2.4s ease-in-out infinite" }}>🎮</div>
        <h1
          className="kp-hero-title"
          style={{ fontFamily: FONT_DISPLAY, fontSize: 56, lineHeight: 1.05, margin: "12px 0 14px", fontWeight: 700 }}
        >
          Kids make games
          <br />
          <span style={{ color: C.coral }}>with their words.</span>
        </h1>
        <p style={{ fontSize: 19, color: C.sub, maxWidth: 560, margin: "0 auto 26px", lineHeight: 1.5 }}>
          Describe a game or app, watch it come to life, then share it with family and friends. A grown-up stays in the
          loop the whole time.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to={me ? "/studio" : "/try"} style={{ ...button("primary"), padding: "14px 26px", fontSize: 17 }}>
            {me ? "Go to my studio" : "Try it now — no account needed"}
          </Link>
          <a href="#gallery" style={{ ...button("ghost"), padding: "14px 26px", fontSize: 17, textDecoration: "none" }}>
            Play kids' games
          </a>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
          {IDEAS.map((idea) => (
            <span
              key={idea}
              style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 14px", fontSize: 14 }}
            >
              {idea}
            </span>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 56 }}>
        {STEPS.map((s, i) => (
          <div key={s.title} style={{ ...card, padding: 22 }}>
            <div style={{ fontSize: 34 }}>{s.emoji}</div>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: "8px 0 6px" }}>
              {i + 1}. {s.title}
            </h3>
            <p style={{ margin: 0, color: C.sub, lineHeight: 1.5 }}>{s.text}</p>
          </div>
        ))}
      </section>

      <section id="gallery" style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 32, margin: 0 }}>The Arcade</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {(["new", "popular"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                style={{ ...button(sort === s ? "primary" : "ghost"), padding: "8px 16px", fontSize: 14 }}
              >
                {s === "new" ? "✨ Newest" : "🔥 Most played"}
              </button>
            ))}
          </div>
        </div>
        {items === null ? (
          <p style={{ color: C.sub }}>Loading games…</p>
        ) : items.length === 0 ? (
          <div style={{ ...card, padding: 32, textAlign: "center", marginTop: 18 }}>
            <div style={{ fontSize: 40 }}>🌱</div>
            <p style={{ color: C.sub, margin: "8px 0 0" }}>No games here yet. Be the first to make one!</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
              marginTop: 18,
            }}
          >
            {items.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const CARD_TINTS = ["#FFE3D6", "#FFF0C7", "#DCEFFF", "#E9E0FF", "#D6F5E8"];

function GameCard({ game }: { game: GalleryItem }) {
  const tint = CARD_TINTS[game.slug.length % CARD_TINTS.length];
  return (
    <Link
      to={`/g/${game.slug}`}
      className="kp-card-link"
      style={{ ...card, display: "block", overflow: "hidden", color: C.ink, transition: "transform 0.15s, box-shadow 0.15s" }}
    >
      <div style={{ background: tint, height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>
        {game.emoji}
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{game.title}</div>
        <div style={{ fontSize: 13, color: C.sub }}>
          by {game.creatorEmoji} {game.creatorNickname} · {game.plays} {game.plays === 1 ? "play" : "plays"}
        </div>
      </div>
    </Link>
  );
}
