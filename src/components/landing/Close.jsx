import { useId, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import Mascot from "../agents/Mascot.jsx";
import { PixelStone } from "../quest/PixelStone.jsx";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { INPUT_CLASS } from "../ui/kit.jsx";
import { C, CONTAINER, GUTTER, MOBILE_MAX, SANS, SHADOW, go, useMedia, useSettle } from "./kit.js";
import { LpButton, Signpost, SrOnly, TextLink, TwoTone } from "./frames.jsx";

// The closing call to action, in two options, both ending with the waitlist.
// a "Start here": a faithful copy of Quest's own Today callout, with a real
// Get started button in it, today's stone and two future ones under it.
// b "Postcard": Beaker's postal language, a white card with a perforated
// "Free" stamp and Beaker standing on its top edge.
//
// The waitlist insert is the only Supabase call on the landing page.

const H2 = { lead: "Start with what you've already done.", rest: "A short form first. Everything on this page builds from it." };

/** Today's waitlist, kept with its exact logic. */
export function Waitlist() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");   // idle | loading | done | error

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || status === "loading") return;
    setStatus("loading");
    const { error } = await supabase.from("waitlist").insert({ email: trimmed });
    // 23505 = unique_violation: already on the list, treat as success.
    setStatus(!error || error.code === "23505" ? "done" : "error");
  };

  return (
    <div style={{ maxWidth: 540, margin: "64px auto 0", textAlign: "center" }}>
      <h3 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.25rem", color: C.ink, margin: 0, lineHeight: 1.3 }}>
        Interested in a full, paid version?
      </h3>
      <p style={{ fontFamily: SANS, fontWeight: 500, fontSize: "1rem", color: C.mid, lineHeight: 1.6, margin: "8px 0 20px" }}>
        Leave your email and we'll let you know when a subscription is available.
      </p>
      {status === "done" ? (
        <p role="status" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "1rem", color: C.accent, margin: 0 }}>
          You're on the list. We'll be in touch.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <SrOnly as="label" htmlFor={id}>Email</SrOnly>
          <input id={id} type="email" className={INPUT_CLASS} autoComplete="email" required placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ flex: "1 1 240px", height: 48, boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: 500,
              color: C.ink, background: "#ffffff", border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "0 16px" }} />
          <LpButton kind="secondary" size="sm" type="submit" busy={status === "loading"} style={{ minHeight: 48 }}>
            {status === "loading" ? "Joining..." : "Join the waitlist"}
          </LpButton>
        </form>
      )}
      {status === "error" && (
        <p role="alert" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "0.95rem", color: "#b42318", margin: "12px 0 0" }}>
          Something went wrong. Try again.
        </p>
      )}
    </div>
  );
}

// ─── a: Start here ───────────────────────────────────────────────────────────

const FUTURE = { fill: "#e6e3de", edge: "#cfcac2", ink: "#b9b3a8" };

function StartHere({ settled, phone }) {
  return (
    <div style={{ position: "relative", width: phone ? "100%" : "min(340px, 100%)", paddingTop: 60, margin: "0 auto" }}>
      <div style={{ position: "relative", background: "#ffffff", borderRadius: 16, border: `1px solid ${C.soft}`, padding: "14px 16px 16px",
        boxShadow: SHADOW.device }}>
        <div aria-hidden="true" style={{ position: "absolute", right: 24, top: -60 }}>
          <Mascot agent="quill" state="idle" size={64} title="" animate={!settled} />
        </div>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: C.accent }}>Start here</p>
        <p style={{ margin: "4px 0 12px", fontFamily: SANS, fontSize: "1.06rem", fontWeight: 700, color: C.ink, lineHeight: 1.35 }}>
          Tell us your classes, scores and activities
        </p>
        <LpButton size="sm" onClick={() => go("/auth")} style={{ width: "100%", minHeight: 48, fontSize: "1rem" }}>Get started</LpButton>
        <span aria-hidden="true" style={{ position: "absolute", left: "calc(50% - 8px)", bottom: -9, width: 16, height: 16, background: "#ffffff",
          transform: "rotate(45deg)", borderRight: `1px solid ${C.soft}`, borderBottom: `1px solid ${C.soft}` }} />
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: 244, marginTop: 20 }}>
        <div style={{ position: "absolute", left: "calc(50% - 36px)", top: 0 }}>
          <PixelStone cells={18} picture="star" fill="#ffffff" edge={C.accentDark} ink={C.accent} ring="solid" ringColor={C.accent} />
        </div>
        <div style={{ position: "absolute", left: "calc(50% + 52px)", top: 88 }}>
          <PixelStone cells={12} picture="upcoming" fill={FUTURE.fill} edge={FUTURE.edge} ink={FUTURE.ink} />
        </div>
        <div style={{ position: "absolute", left: "calc(50% + 116px)", top: 168 }}>
          <PixelStone cells={12} picture="upcoming" fill={FUTURE.fill} edge={FUTURE.edge} ink={FUTURE.ink} />
        </div>
        <div style={{ position: "absolute", right: "calc(50% + 2px)", top: 112, background: "#ffffff", border: `1px solid ${C.line}`,
          borderRadius: 999, padding: "6px 14px", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: C.muted, whiteSpace: "nowrap" }}>
          Free, no credit card
        </div>
      </div>
    </div>
  );
}

function CloseA({ settled, phone }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(12, minmax(0, 1fr))", gap: phone ? 40 : 24, alignItems: "center" }}>
      <div style={{ gridColumn: phone ? "auto" : "1 / span 6" }}>
        <Signpost stamp="flag">Get started</Signpost>
        <TwoTone lead={H2.lead} rest={H2.rest} style={{ marginTop: 16, maxWidth: "22ch" }} />
        <div style={{ marginTop: 24 }}>
          <TextLink tone="ink" onClick={() => go("/auth")}>Log in</TextLink>
        </div>
      </div>
      <div style={{ gridColumn: phone ? "auto" : "7 / span 6" }}>
        <StartHere settled={settled} phone={phone} />
      </div>
    </div>
  );
}

// ─── b: Postcard ─────────────────────────────────────────────────────────────

// The perforated postage stamp, as BoardCard.jsx draws it.
const DOT = "#a9a39a";
const dots = (dir, pos, size) => `linear-gradient(${dir}, ${DOT} 50%, transparent 50%) ${pos} / ${size} repeat-${dir === "90deg" ? "x" : "y"}`;
const PERFORATED = [
  dots("90deg", "left top", "4px 2px"), dots("90deg", "left bottom", "4px 2px"),
  dots("180deg", "left top", "2px 4px"), dots("180deg", "right top", "2px 4px"),
].join(", ") + ", #faf9f5";

function CloseB({ settled, phone }) {
  const beaker = phone ? 96 : 128;
  return (
    <div style={{ position: "relative", width: "min(880px, 100%)", margin: `${beaker - 4}px auto 0`, background: "#ffffff", borderRadius: 16,
      border: `1px solid ${C.line}`, padding: phone ? 28 : 56, boxSizing: "border-box" }}>
      <div aria-hidden="true" style={{ position: "absolute", left: phone ? 16 : 40, top: -(beaker - 4) }}>
        <Mascot agent="beaker" state="delivering" size={beaker} title="" animate={!settled} />
      </div>
      <span aria-hidden="true" style={{ position: "absolute", right: phone ? 16 : 28, top: phone ? 16 : 28, display: "inline-flex", alignItems: "center",
        gap: 6, padding: "5px 9px 5px 7px", background: PERFORATED, color: C.mid, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700 }}>
        <PixelStamp kind="letter" size={16} />
        Free
      </span>
      <div style={{ paddingTop: phone ? 36 : 8 }}>
        <TwoTone lead={H2.lead} rest={H2.rest} style={{ maxWidth: "24ch" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginTop: 28 }}>
          <LpButton onClick={() => go("/auth")}>Get started</LpButton>
          <TextLink onClick={() => go("/auth")}>Log in</TextLink>
        </div>
      </div>
    </div>
  );
}

export default function Close({ option = "a" }) {
  const ref = useRef(null);
  const { settled } = useSettle(ref);
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  return (
    <section ref={ref} id="start" aria-label="Get started" style={{ padding: `120px ${GUTTER}` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto" }}>
        {option === "b" ? <CloseB settled={settled} phone={phone} /> : <CloseA settled={settled} phone={phone} />}
        <Waitlist />
      </div>
    </section>
  );
}
