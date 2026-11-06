import { C, FONT_DISPLAY, card } from "../theme";

const SECTIONS = [
  {
    title: "Who it's for",
    body: "KidPrompt is a small, family-run space where kids, with a parent or family grown-up, describe games and apps in their own words and an AI builder turns them into real, playable programs.",
  },
  {
    title: "Grown-ups hold the account",
    body: "Only adults sign up, with an email and password. Kids are added as creators with just a nickname and an emoji. We never ask a kid for their name, email, school, age, or photo.",
  },
  {
    title: "Trying it without an account",
    body: "Anyone can build one game with a few free tries before making an account. We keep that game, the words typed to make it, and a random id in a cookie so it can be saved later, plus a scrambled (hashed) form of the network address to limit free tries. Nothing else. Making an account saves the game to it, and only then can it be shared.",
  },
  {
    title: "Every game is reviewed",
    body: "Nothing goes public automatically. When a family presses “Share it”, the KidPrompt grown-up looks at the game before it appears in the Arcade. Changes to a live game are reviewed again before they go live.",
  },
  {
    title: "Games are sandboxed",
    body: "Each game runs in a locked-down sandbox: it can't reach the internet, load outside content, read cookies, or collect anything from players. The builder is also told to keep everything kid-appropriate and original.",
  },
  {
    title: "What we use",
    body: "Games are built with Anthropic's Claude models and hosted on Cloudflare. Projects, prompts, and versions are stored so families can undo changes. Players aren't tracked; we only count plays.",
  },
  {
    title: "Questions or a removal request",
    body: "Email hello@kidprompt.ai and we'll help — including taking down a game or deleting a family account.",
  },
];

export function About() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px" }}>
      <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, margin: "8px 0 20px" }}>How KidPrompt works</h1>
      {SECTIONS.map((s) => (
        <section key={s.title} style={{ ...card, padding: 22, marginBottom: 14 }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: "0 0 6px" }}>{s.title}</h2>
          <p style={{ margin: 0, color: C.sub, lineHeight: 1.6 }}>{s.body}</p>
        </section>
      ))}
    </div>
  );
}
