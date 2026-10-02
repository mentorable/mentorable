import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  AMBER_TEXT, BEAKER_LINES, BORDER, FPS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, hexToRgbString, lighten,
  readableOn, useInk,
} from "../../brand/brand.js";
import { CLAMP } from "../../kit/motion.js";
import { SCREEN } from "../../kit/PhoneFrame.jsx";
import {
  BackLink, Button, Card, FieldLabel, MascotSays, PixelStamp, SourceLink, TextCaret, inputStyle,
} from "./ui.jsx";
// The rewrite chips and the word count are the app's own (options.js imports
// only the agents registry, so it can come in as it is).
import { TWEAKS, wordCount } from "../../../../src/components/agents/outreach/options.js";

// Beaker's review screen (src/pages/OutreachReviewPage.jsx) as a phone
// shows it: the header, Beaker's line, the email card (To with where the
// address was found, Subject, the body with every claim about the recipient
// highlighted), the rewrite chips, the sources (under the email on a phone),
// the facts to check, the Send card, the confirm sheet, and the page once
// it's sent.

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};
const titleFor = (url, sources) => (sources || []).find((s) => s?.url === url)?.title || "";

// ─── Header and Beaker ──────────────────────────────────────────────────────

/** stageLabel: "Drafted", "Sent"... sentLine: "Sent Oct 2 with Gmail" once it's gone. */
export function ReviewHeader({ contact, stageLabel, sentLine }) {
  const ink = useInk();
  const role = [contact.title, contact.organization].filter(Boolean).join(", ");
  return (
    <div>
      <BackLink color={ink.text} />
      <header style={{ margin: "6px 0 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: "1.8rem", color: ink.title, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {contact.name}
          </h1>
          {stageLabel && (
            <span style={{ fontSize: "0.9rem", fontWeight: 800, color: ink.onSoft, background: ink.soft,
              borderRadius: RADIUS.pill, padding: "4px 12px", whiteSpace: "nowrap" }}>
              {stageLabel}
            </span>
          )}
        </div>
        {role && <p style={{ margin: "4px 0 0", fontSize: "1.05rem", fontWeight: 600, color: TEXT_MUTED }}>{role}</p>}
        {sentLine && <p style={{ margin: "4px 0 0", fontSize: "0.98rem", fontWeight: 700, color: TEXT_MID }}>{sentLine}</p>}
      </header>
    </div>
  );
}

export function ReviewMascot({ state, line, offset = 0 }) {
  return <MascotSays state={state} size={80} offset={offset} style={{ marginBottom: 16 }}>{line}</MascotSays>;
}

// ─── The email card ─────────────────────────────────────────────────────────

/** The To line with an address Beaker verified (RecipientField.jsx). */
export function RecipientField({ to, emailSourceUrl }) {
  const ink = useInk();
  return (
    <div>
      <FieldLabel>To</FieldLabel>
      <div style={{ ...inputStyle, whiteSpace: "nowrap", overflow: "hidden" }}>{to}</div>
      <p style={{ margin: "6px 0 0", fontSize: "0.95rem", lineHeight: 1.55 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: TEXT_MUTED, fontWeight: 600 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: ink.soft, color: ink.onSoft,
            borderRadius: RADIUS.pill, padding: "3px 10px", fontWeight: 800 }}>
            <PixelStamp kind="check" size={16} />
            Verified
          </span>
          <span>Found on <SourceLink>{domainOf(emailSourceUrl)}</SourceLink></span>
        </span>
      </p>
    </div>
  );
}

// ClaimEditor.jsx METRICS: the body's font, size, line height and padding.
const METRICS = {
  fontFamily: SANS, fontSize: "16px", fontWeight: 500, lineHeight: 1.65, whiteSpace: "pre-wrap",
  overflowWrap: "break-word", padding: "14px 16px", boxSizing: "border-box", margin: 0, textAlign: "left",
};

/**
 * The body with its claims marked as the editor marks them: a tint of the
 * accent with an underline, the linked one deeper with a thicker line.
 * runs: [{ t, claim? }] in order (claim: the claim's index). active: the
 * linked claim. caret: { claim, at, since } puts the text caret `at`
 * characters into that claim (where a thumb tapped). focused: the ring.
 */
export function ClaimBody({ runs, active = null, caret = null, focused = false }) {
  const ink = useInk();
  const rest = lighten(ink.accent, 0.72);
  const on = lighten(ink.accent, 0.6);
  const restLine = readableOn(ink.accent, rest, 3);
  const onLine = readableOn(ink.accent, on, 3);
  return (
    <div style={{ position: "relative", background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control,
      overflow: "hidden" }}>
      <div style={{ ...METRICS, minHeight: 260, color: TEXT, borderRadius: RADIUS.control - 2,
        ...(focused ? { outline: `3px solid ${ink.ring}`, outlineOffset: -3 } : null) }}>
        {runs.map((r, i) => {
          if (r.claim == null) return <span key={i}>{r.t}</span>;
          const lit = r.claim === active;
          const text = caret && caret.claim === r.claim
            ? <>{r.t.slice(0, caret.at)}<TextCaret since={caret.since} />{r.t.slice(caret.at)}</>
            : r.t;
          return (
            <mark key={i} data-claim={r.claim} style={{ color: TEXT, background: lit ? on : rest, borderRadius: 3,
              boxShadow: `inset 0 ${lit ? -3 : -2}px 0 ${lit ? onLine : restLine}` }}>
              {text}
            </mark>
          );
        })}
      </div>
    </div>
  );
}

/** The editor card: To, Subject, Email (with the hint and the marked body),
 *  the source of the linked fact (a phone shows it under the editor), and
 *  the save state and word count. */
export function EmailCard({ contact, runs, active = null, caret = null, focused = false, maxWords = 175 }) {
  const activeClaim = active != null ? contact.claims[active] : null;
  const words = wordCount(contact.body);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RecipientField to={contact.email} emailSourceUrl={contact.email_source_url} />
      <div>
        <FieldLabel>Subject</FieldLabel>
        <div style={{ ...inputStyle, whiteSpace: "nowrap", overflow: "hidden" }}>{contact.subject}</div>
      </div>
      <div>
        <FieldLabel>Email</FieldLabel>
        <p style={{ margin: "-2px 0 8px", fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          Highlighted words are facts about {contact.name}. Click one to see its source.
        </p>
        <ClaimBody runs={runs} active={active} caret={caret} focused={focused} />
        {activeClaim && (
          <p style={{ margin: "8px 0 0", fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 800, color: TEXT }}>Source for this fact: </span>
            <SourceLink inline>
              {titleFor(activeClaim.source_url, contact.sources)
                ? `${titleFor(activeClaim.source_url, contact.sources)} (${domainOf(activeClaim.source_url)})`
                : domainOf(activeClaim.source_url)}
            </SourceLink>
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 6 }}>
          <span style={{ minHeight: 24 }} />
          <span style={{ fontSize: "0.93rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: words > maxWords ? AMBER_TEXT : TEXT_MUTED }}>
            {words} / {maxWords} words
          </span>
        </div>
      </div>
    </Card>
  );
}

/** "Rewrite it:" and the app's rewrite chips (ToneChips.jsx, options.TWEAKS). */
export function ToneChips({ left = 3, limit = 3 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: "0.95rem", fontWeight: 800, color: TEXT, marginRight: 2 }}>Rewrite it:</span>
      {TWEAKS.map((t) => (
        <span key={t.key} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "8px 14px",
          borderRadius: RADIUS.pill, fontSize: "0.95rem", fontWeight: 700, background: WHITE, color: TEXT,
          border: `1.5px solid ${BORDER}`, boxSizing: "border-box" }}>
          {t.label}
        </span>
      ))}
      <span style={{ fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
        {left} of {limit} left
      </span>
    </div>
  );
}

// ─── Sources (SourceRail.jsx, in a card under the email on a phone) ─────────

// flowUi.jsx oa-flash: a ring of the accent that grows 10px and fades, over
// 0.9 s, twice. The rail runs it on the fact the editor's caret just linked.
const FLASH_FRAMES = 0.9 * FPS;
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
function flashRing(frame, since, rgb) {
  if (since == null) return undefined;
  const t = frame - since;
  if (t < 0 || t >= FLASH_FRAMES * 2) return undefined;
  const p = interpolate(t % FLASH_FRAMES, [0, FLASH_FRAMES], [0, 1], { ...CLAMP, easing: EASE_OUT });
  return `0 0 0 ${(10 * p).toFixed(2)}px rgba(${rgb},${(0.55 * (1 - p)).toFixed(3)})`;
}

function FactItem({ claim, sources, active, flashSince }) {
  const ink = useInk();
  const frame = useCurrentFrame();
  const title = titleFor(claim.source_url, sources);
  return (
    <li style={{ listStyle: "none", borderRadius: RADIUS.control, background: active ? ink.softer : WHITE,
      border: `1.5px solid ${active ? ink.ring : BORDER}`, padding: 2, minWidth: 0,
      boxShadow: flashRing(frame, flashSince, hexToRgbString(ink.accent)) }}>
      <p style={{ margin: 0, padding: "8px 10px", fontSize: "0.98rem", fontWeight: 600, color: TEXT, lineHeight: 1.5,
        minHeight: 44, boxSizing: "border-box" }}>
        &ldquo;{claim.text}&rdquo;
      </p>
      <p style={{ margin: 0, padding: "0 10px 8px", fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.45 }}>
        Source: <SourceLink>{title ? `${title} (${domainOf(claim.source_url)})` : domainOf(claim.source_url)}</SourceLink>
      </p>
    </li>
  );
}

/** active: the linked fact. flash: { index, since } runs the rail's flash on
 *  that fact from frame `since` (the editor linked it). */
export function SourceRail({ contact, active = null, flash = null }) {
  const ink = useInk();
  const cited = new Set(contact.claims.map((c) => c.source_url));
  const others = contact.sources.filter((s) => !cited.has(s.url) && s.url !== contact.email_source_url);
  return (
    <Card>
      <h2 style={{ margin: 0, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", fontSize: "1.15rem", lineHeight: 1.3 }}>Sources</h2>
      <p style={{ margin: "4px 0 12px", fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.55 }}>
        {`Every fact about ${contact.name} in your email comes from one of these pages. Open each one and check it before you send.`}
      </p>
      <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="sparkle" size={16} /></span>
        Facts in your email
      </h3>
      <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {contact.claims.map((c, i) => (
          <FactItem key={c.text} claim={c} sources={contact.sources} active={active === i}
            flashSince={flash && flash.index === i ? flash.since : null} />
        ))}
      </ul>
      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED }}>Where the address came from</h3>
        <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5 }}>
          <SourceLink>{titleFor(contact.email_source_url, contact.sources) || domainOf(contact.email_source_url)}</SourceLink>
        </p>
      </div>
      {others.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED }}>Other pages Beaker read</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {others.map((s) => (
              <li key={s.url} style={{ fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5 }}>
                <SourceLink>{s.title ? `${s.title} (${domainOf(s.url)})` : domainOf(s.url)}</SourceLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ─── Facts to check before sending (FactsChecklist.jsx) ─────────────────────

/** What Beaker couldn't be sure of, ticked as she checks. A bare section in
 *  the page's column (not a card), between the sources and Send it. */
export function FactsChecklist({ facts = [], checked = [] }) {
  const ink = useInk();
  if (!facts.length) return null;
  const done = facts.filter((f) => checked.includes(f)).length;
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: TEXT }}>Facts to check before sending</h2>
        <span style={{ fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          {done} of {facts.length} checked
        </span>
      </div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {facts.map((fact) => {
          const on = checked.includes(fact);
          return (
            <li key={fact} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: WHITE,
              border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px", minHeight: 44,
              boxSizing: "border-box" }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, marginTop: 1, borderRadius: 6,
                border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: on ? ink.button.bg : WHITE, color: ink.button.fg,
                display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                {on && <PixelStamp kind="check" size={16} />}
              </span>
              <span style={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.5, color: on ? TEXT_MUTED : TEXT_MID,
                overflowWrap: "anywhere" }}>
                {fact}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Send it ────────────────────────────────────────────────────────────────

/** The Send card with Gmail connected: the from-address and today's sends. */
export function SendCard({ gmail, sendsLeft, pressed = false }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: TEXT }}>Send it</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Button kind="primary" pressed={pressed}>Send with Gmail</Button>
        <Button kind="secondary">Copy email</Button>
        <Button kind="secondary">Open in my mail app</Button>
        <Button kind="secondary">Mark as sent</Button>
      </div>
      <p style={{ margin: 0, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
        {`From ${gmail.email}.${sendsLeft ? ` ${sendsLeft.left} of ${sendsLeft.limit} sends left today.` : ""} Sent yourself? Press Mark as sent so your board keeps track.`}
      </p>
    </Card>
  );
}

/** The email as it went (OutreachReviewPage SentCopy). */
export function SentCopy({ subject, body }) {
  return (
    <Card>
      <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, color: TEXT_MUTED }}>Subject</p>
      <p style={{ margin: "2px 0 12px", fontSize: "1.05rem", fontWeight: 700, color: TEXT }}>{subject}</p>
      <p style={{ margin: 0, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{body}</p>
    </Card>
  );
}

// ─── The confirm (SendSheet.jsx in Sheet.jsx: a bottom sheet on a phone) ────

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <dt style={{ flex: "0 0 76px", fontWeight: 800, color: TEXT_MUTED, fontSize: "0.95rem" }}>{label}</dt>
      <dd style={{ margin: 0, flex: 1, minWidth: 0, fontWeight: 600, color: TEXT, fontSize: "1rem", overflowWrap: "anywhere" }}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The sheet over the page, its bottom on the screen's bottom edge (`bottom`,
 * in SCREEN coordinates). It and its backdrop cover the web page, which
 * starts under the status bar. `open`: 0 (off the bottom) to 1 (up). busy:
 * the send is running ("Sending..."). pressed: a thumb on "Send now". With
 * every fact ticked the app shows no warning here, so there is none.
 */
export function SendSheet({ from, to, subject, open = 1, busy = false, pressed = false, bottom, offset = 0 }) {
  const shown = Math.max(0, Math.min(1, open));
  return (
    <div style={{ position: "absolute", left: 0, top: SCREEN.statusBar, width: SCREEN.width, height: bottom - SCREEN.statusBar,
      zIndex: 20, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,20,19,0.45)", opacity: shown }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, transform: `translateY(${(1 - shown) * 100}%)`,
        background: WHITE, borderRadius: "22px 22px 0 0", padding: "10px 18px 24px", boxSizing: "border-box",
        fontFamily: SANS, color: TEXT, boxShadow: "0 30px 80px rgba(0,0,0,0.25)" }}>
        <div style={{ width: 44, height: 5, borderRadius: 99, background: BORDER, margin: "0 auto 14px" }} />
        <h2 style={{ margin: "0 0 14px", fontWeight: 800, fontSize: "1.35rem", color: TEXT }}>Send this email?</h2>
        <MascotSays state="delivering" size={72} offset={offset}>{BEAKER_LINES.sendConfirm}</MascotSays>
        <dl style={{ margin: "16px 0 0", padding: "4px 14px", background: SURFACE, border: `1px solid ${BORDER}`,
          borderRadius: RADIUS.control }}>
          <Row label="From">{from}</Row>
          <Row label="To">{to}</Row>
          <Row label="Subject">{subject}</Row>
        </dl>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <Button kind="primary" busy={busy} pressed={pressed} style={{ flex: "1 1 180px" }}>{busy ? "Sending..." : "Send now"}</Button>
          <Button kind="secondary" style={{ flex: "1 1 180px", opacity: busy ? 0.55 : 1 }}>Not yet</Button>
        </div>
      </div>
    </div>
  );
}

/** The body cut into runs for ClaimBody, from demo paragraphs of
 *  { t, source }: paragraphs joined by a blank line, each sourced run a claim. */
export function runsFromParagraphs(paragraphs) {
  const runs = [];
  let claim = 0;
  paragraphs.forEach((para, p) => {
    if (p > 0) runs.push({ t: "\n\n" });
    para.forEach((r) => runs.push(r.source ? { t: r.t, claim: claim++ } : { t: r.t }));
  });
  return runs;
}
