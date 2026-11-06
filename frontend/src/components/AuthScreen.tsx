import { useState } from "react";
import { api } from "../api";
import { Link, navigate } from "../router";
import { C, FONT_DISPLAY, button, card, input, label } from "../theme";

// Grown-ups only: kids never get their own login. Signup is two steps (details,
// then the emailed code) because the account is not created until the email
// is proven — see backend routes/auth.ts.
export function AuthScreen({ mode, onAuthed }: { mode: "login" | "signup"; onAuthed: () => Promise<void> }) {
  const [step, setStep] = useState<"form" | "code">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A "Try it" game made before signing in comes along: open it.
  const finish = async (res: { claimedProjectId?: string }) => {
    await onAuthed();
    navigate(res.claimedProjectId ? `/studio/${res.claimedProjectId}` : "/studio");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login") {
        await finish(await api<{ claimedProjectId?: string }>("login", { method: "POST", body: { email, password } }));
      } else if (step === "form") {
        await api("signup", { method: "POST", body: { name, email, password } });
        setStep("code");
      } else {
        await finish(await api<{ claimedProjectId?: string }>("signup/confirm", { method: "POST", body: { email, code } }));
      }
    });
  };

  return (
    <div style={{ maxWidth: 420, margin: "32px auto", padding: "0 20px" }}>
      <form onSubmit={submit} style={{ ...card, padding: 28 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 30, margin: "0 0 6px" }}>
          {mode === "login" ? "Welcome back 👋" : step === "code" ? "Check your email 📬" : "Grown-ups, start here"}
        </h1>
        <p style={{ color: C.sub, margin: "0 0 20px", lineHeight: 1.5 }}>
          {mode === "login"
            ? "Log in to your family studio."
            : step === "code"
              ? `We sent a 6-digit code to ${email}.`
              : "Make a free family account. You'll add your kids as creators next — they don't need an email."}
        </p>

        {step === "form" && mode === "signup" && (
          <Field label="Your name">
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
        )}
        {step === "form" && (
          <>
            <Field label="Email">
              <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            <Field label="Password">
              <input
                style={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
                required
              />
            </Field>
          </>
        )}
        {step === "code" && (
          <Field label="Code">
            <input
              style={{ ...input, fontSize: 24, letterSpacing: 8, textAlign: "center" }}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </Field>
        )}

        {error && <p style={{ color: C.danger, margin: "0 0 12px" }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%", padding: 14 }}>
          {busy ? "One sec…" : mode === "login" ? "Log in" : step === "code" ? "Confirm" : "Send my code"}
        </button>
        <p style={{ textAlign: "center", color: C.sub, fontSize: 14, margin: "16px 0 0" }}>
          {mode === "login" ? (
            <>
              New here? <Link to="/signup" style={{ color: C.coral, fontWeight: 600 }}>Make an account</Link>
            </>
          ) : (
            <>
              Already have one? <Link to="/login" style={{ color: C.coral, fontWeight: 600 }}>Log in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={label}>{text}</span>
      {children}
    </label>
  );
}
