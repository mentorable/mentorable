import { useEffect, useRef, useState } from "react";
import { Button, Card, ChoiceChips, FieldLabel, INPUT_CLASS, LINK_CLASS, Notice, inputStyle, textOnPage } from "../ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../ui/tokens.js";

// The counselor's way in, on /counselor itself: sign in, or create an
// account. It never hands anyone to the student sign-in or to student
// onboarding: a new account's confirmation link comes back to this page.
//
// `api.signIn(email, password)` and `api.signUp(email, password)` are
// Supabase's own calls and answer as it does, with { data, error }.
// `onEntered(user)` runs once someone is signed in.

const MODES = [
  { key: "signin", label: "Sign in" },
  { key: "signup", label: "Create an account" },
];

const OFFLINE = "Can't reach Mentorable right now. Check your connection and try again.";
const MIN_PASSWORD = 6;

const lower = (err) => String(err?.message || "").toLowerCase();
const offline = (msg) => msg.includes("fetch") || msg.includes("network") || msg.includes("connect");
const limited = (err, msg) => err?.status === 429 || msg.includes("rate limit") || msg.includes("rate_limit");

/** A refused sign-up, in plain words. `other: "signin"` offers the sign-in form. */
export function signUpProblem(err) {
  const msg = lower(err);
  if (limited(err, msg)) return { text: "A lot of accounts are being made right now. Wait a minute and try again." };
  if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
    return { text: "An account with this email already exists.", other: "signin" };
  }
  if (offline(msg)) return { text: OFFLINE };
  if (msg.includes("password")) return { text: `Use a password of at least ${MIN_PASSWORD} characters.` };
  if (msg.includes("invalid") && msg.includes("email")) return { text: "Enter a valid email address." };
  return { text: "Couldn't create the account. Try again in a moment." };
}

/** A refused sign-in, in plain words. */
export function signInProblem(err) {
  const msg = lower(err);
  if (offline(msg)) return { text: OFFLINE };
  if (limited(err, msg)) return { text: "Too many tries. Wait a minute and try again." };
  if (msg.includes("not confirmed")) {
    return { text: "Confirm your email first. Open the link we sent when you created the account, then sign in here." };
  }
  if (msg.includes("invalid") || msg.includes("credentials") || msg.includes("password") || msg.includes("email")) {
    return { text: "That email or password is not right. Try again." };
  }
  return { text: "Couldn't sign you in. Try again in a moment." };
}

export default function CounselorAuthCard({ api, onEntered }) {
  const ink = useAgentInk();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);   // { text, other }
  const [sentTo, setSentTo] = useState("");       // the address a confirmation link went to
  const alive = useRef(true);
  const sentRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // The form is gone once the link is sent: move focus to what replaced it.
  useEffect(() => { if (sentTo) sentRef.current?.focus(); }, [sentTo]);

  const signup = mode === "signup";
  const pick = (key) => { setMode(key); setProblem(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const mail = email.trim();
    if (!mail || !password) { setProblem({ text: "Enter your email and your password." }); return; }
    if (signup && password.length < MIN_PASSWORD) {
      setProblem({ text: `Use a password of at least ${MIN_PASSWORD} characters.` });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (signup) {
        const { data, error } = await api.signUp(mail, password);
        if (!alive.current) return;
        if (error) { setProblem(signUpProblem(error)); return; }
        // With email confirmation on, a second sign-up for the same address
        // succeeds quietly and comes back with no identities.
        if (!data?.user || data.user.identities?.length === 0) {
          setProblem({ text: "An account with this email already exists.", other: "signin" });
          return;
        }
        if (data.session) { await onEntered(data.user); return; }
        setSentTo(mail);
      } else {
        const { data, error } = await api.signIn(mail, password);
        if (!alive.current) return;
        if (error) { setProblem(signInProblem(error)); return; }
        if (!data?.user) { setProblem({ text: "Couldn't sign you in. Try again in a moment." }); return; }
        await onEntered(data.user);
      }
    } catch (err) {
      console.warn("[counselor] sign-in failed:", err?.message || err);
      if (alive.current) setProblem({ text: OFFLINE });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const small = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.6 };
  const link = { color: textOnPage(ink), fontWeight: 700 };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: "min(6vh, 3rem)" }}>
      <Card style={{ padding: "1.6rem 1.5rem 1.7rem" }}>
        <h1 style={{ margin: 0, fontFamily: SANS, fontSize: "1.7rem", fontWeight: 800, color: TEXT, lineHeight: 1.2,
          letterSpacing: "-0.02em" }}>
          Mentorable for school counselors
        </h1>
        <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
          This page is for school counselors. Set up your school, give students its join code, and see what each
          student chooses to share with you.
        </p>

        {sentTo ? (
          <div ref={sentRef} tabIndex={-1} style={{ marginTop: 18, outline: "none" }}>
            <Notice tone="success">
              <strong style={{ fontWeight: 800 }}>Check your inbox.</strong>{" "}
              We sent a confirmation link to <span style={{ overflowWrap: "anywhere" }}>{sentTo}</span>. Open it and you
              will come back to this page to set up your school.
            </Notice>
            <Button kind="secondary" onClick={() => { setSentTo(""); setPassword(""); pick("signin"); }} style={{ marginTop: 14 }}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate style={{ marginTop: 18 }}>
            <ChoiceChips label="Sign in or create an account" hideLabel options={MODES} value={mode} onChange={pick} isMobile />

            <div style={{ marginTop: 18 }}>
              <FieldLabel htmlFor="counselor-email">Email</FieldLabel>
              <input id="counselor-email" type="email" className={INPUT_CLASS} value={email} autoComplete="email"
                disabled={busy} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginTop: 14 }}>
              <FieldLabel htmlFor="counselor-password" hint={signup ? `At least ${MIN_PASSWORD} characters.` : undefined}>
                Password
              </FieldLabel>
              <input id="counselor-password" type="password" className={INPUT_CLASS} value={password} disabled={busy}
                autoComplete={signup ? "new-password" : "current-password"} onChange={(e) => setPassword(e.target.value)}
                style={inputStyle} />
            </div>

            {problem && (
              <Notice tone="error" style={{ marginTop: 14 }}
                action={problem.other === "signin" && (
                  <Button kind="secondary" onClick={() => pick("signin")}>Sign in instead</Button>
                )}>
                {problem.text}
              </Notice>
            )}

            <Button kind="primary" type="submit" busy={busy} style={{ width: "100%", marginTop: 18 }}>
              {signup ? "Create account" : "Sign in"}
            </Button>
            {signup && (
              <p style={{ ...small, marginTop: 12 }}>
                By creating an account you agree to the{" "}
                <a href="/terms" className={LINK_CLASS} style={link}>terms</a> and the{" "}
                <a href="/privacy" className={LINK_CLASS} style={link}>privacy policy</a>.
              </p>
            )}
          </form>
        )}
      </Card>

      <p style={{ ...small, margin: "16px 4px 0" }}>
        Students choose what to share, section by section, and can stop at any time. You never see their chats,
        their essays or what they write in check-ins.
      </p>
      <p style={{ ...small, margin: "8px 4px 0" }}>
        Are you a student?{" "}
        <a href="/auth" className={LINK_CLASS} style={link}>Sign in to Mentorable here</a>.
      </p>
    </div>
  );
}
