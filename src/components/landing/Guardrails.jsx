import { TrustBadge } from "../agents/finder/ListingCard.jsx";
import { QUILL_LINES } from "../../lib/agents/registry.js";
import { subtitleStyle, titleStyle } from "../onboarding/intakeTheme.js";
import { Button, textOnPage } from "../ui/kit.jsx";
import { PixelStamp } from "../ui/PixelIcons.jsx";
import { BG, BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import { C, CONTAINER, GUTTER, MOBILE_MAX, SANS as LP_SANS, TYPE, useMedia } from "./kit.js";
import { Mockup, Signpost, TwoTone } from "./frames.jsx";
import { BEAKER_SAMPLE } from "./data.js";

// "Some things it will never do." (PLAN.md 4.6): five rules, each beside the
// real piece of UI that keeps it, at 1:1 inside an inert Mockup. No motion.

const RULES = [
  {
    rule: "It won't guess your chances.",
    body: "Schools are sorted by a written rule against your scores, and the advisor never predicts an admission decision.",
    label: "The last lines of College List's \"How we sort schools\" card.",
    Fragment: SortCard,
  },
  {
    rule: "It won't write your essay.",
    body: "Quill points to places in your draft and asks questions. Every word stays yours.",
    label: "The line at the top of Quill's desk.",
    Fragment: QuillLine,
  },
  {
    rule: "It won't make things up.",
    body: "Every scholarship is read from its own page, every fact in an email links to where Beaker found it, and an email address is used only if a page Beaker read shows it.",
    label: "Talon's verified badge, and the source rail's line on where an address came from.",
    Fragment: Sources,
  },
  {
    rule: "It won't send anything for you.",
    body: "Nothing goes out until you press Send and confirm. The Gmail permission can send mail, never read it, and you can always copy the email instead.",
    label: "The top of Beaker's send confirmation.",
    Fragment: SendTop,
  },
  {
    rule: "It won't pad your record.",
    body: "Your advisor helps you describe what you did, not more than you did, and you check everything the interview heard before it's saved.",
    label: "The heading of the interview review.",
    Fragment: ReviewHeader,
  },
];

// ─── The fragments ───────────────────────────────────────────────────────────

/** College List, "How we sort schools": the card's last paragraph (CollegeListPage.jsx HowItWorks). */
function SortCard() {
  const ink = useAgentInk();
  return (
    <div style={{ background: WHITE, borderRadius: RADIUS.card, border: `1px solid ${BORDER}`, boxSizing: "border-box", padding: "14px 18px",
      fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MID, lineHeight: 1.6, maxWidth: "62ch" }}>
      <p style={{ margin: 0 }}>
        A category is a starting point, not a prediction, and you can move any school.{" "}
        <button type="button" style={{ fontFamily: SANS, fontSize: "0.98rem", color: ink.text, fontWeight: 800, background: "none", border: "none",
          padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Talk your list over in Chat.
        </button>
      </p>
    </div>
  );
}

/** Quill's desk, the promise line at the top (EssayHomePage.jsx). */
function QuillLine() {
  return (
    <div style={{ background: BG, borderRadius: RADIUS.card, padding: "16px 18px", boxSizing: "border-box" }}>
      <p style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500,
        lineHeight: 1.5, color: TEXT_MID, maxWidth: "70ch" }}>
        <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind="lock" size={16} /></span>
        <span>{QUILL_LINES.neverWrites}</span>
      </p>
    </div>
  );
}

/** Talon's trust badge with its date (ListingDrawer.jsx), and the source rail's address heading (SourceRail.jsx). */
function Sources() {
  const ink = useAgentInk();
  const src = BEAKER_SAMPLE.sources[0];
  return (
    <div style={{ background: WHITE, borderRadius: RADIUS.card, border: `1px solid ${BORDER}`, boxSizing: "border-box", padding: "16px 20px", fontFamily: SANS }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
        <TrustBadge verified />
        <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED }}>Checked Oct 16</span>
      </div>
      <div style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED }}>Where the address came from</p>
        <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, color: textOnPage(ink), textDecoration: "underline", textUnderlineOffset: 3,
            overflowWrap: "anywhere" }}>
            {src.title} ({src.host})
          </span>
        </p>
      </div>
    </div>
  );
}

/** The top of Beaker's SendSheet: the question, the details, Not yet and Send now. */
function SendTop() {
  const row = (label, value) => (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <span style={{ flex: "0 0 76px", fontWeight: 800, color: TEXT_MUTED, fontSize: "0.95rem" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: TEXT, fontSize: "1rem", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "1.2rem 1.25rem", boxSizing: "border-box",
      fontFamily: SANS, color: TEXT }}>
      <p style={{ margin: "0 0 14px", fontFamily: SANS, fontWeight: 800, fontSize: "1.35rem", color: TEXT }}>Send this email?</p>
      <div style={{ margin: 0, padding: "4px 14px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, fontFamily: SANS }}>
        {row("From", "Your Gmail")}
        {row("To", BEAKER_SAMPLE.email)}
        {row("Subject", BEAKER_SAMPLE.subject)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        <Button kind="primary" style={{ flex: "1 1 120px" }}>Send now</Button>
        <Button kind="secondary" style={{ flex: "1 1 120px" }}>Not yet</Button>
      </div>
    </div>
  );
}

/** The interview review's heading (IntakeReview.jsx), the title scaled to fit the fragment. */
function ReviewHeader() {
  const ink = useAgentInk();
  return (
    <div style={{ background: BG, borderRadius: RADIUS.card, padding: "18px 20px 20px", boxSizing: "border-box" }}>
      <p style={{ ...titleStyle(ink, false), fontSize: "1.6rem" }}>Here's what we heard</p>
      <p style={subtitleStyle(true)}>
        We filled some of this in from the conversation, so check it before we save. Anything here can be edited now or later.
      </p>
    </div>
  );
}

// ─── The section ─────────────────────────────────────────────────────────────

function Row({ item, phone, first }) {
  const { Fragment } = item;
  return (
    <li style={{ listStyle: "none", margin: 0, borderTop: first ? "none" : `1px solid ${C.line}`, padding: phone ? "28px 0" : "32px 0",
      display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1fr) 360px", gap: phone ? 20 : 40, alignItems: "start" }}>
      <div>
        <h3 style={{ fontFamily: LP_SANS, fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", color: C.ink, margin: 0 }}>
          {item.rule}
        </h3>
        <p style={{ ...TYPE.stepDesc, marginTop: 10, maxWidth: "36rem" }}>{item.body}</p>
      </div>
      <Mockup label={item.label} settled style={{ width: phone ? "100%" : 360, maxWidth: "100%" }}>
        <Fragment />
      </Mockup>
    </li>
  );
}

export default function Guardrails() {
  const phone = useMedia(`(max-width: ${MOBILE_MAX}px)`);
  const split = useMedia("(min-width: 1100px)");
  return (
    <section id="guardrails" aria-label="Guardrails" style={{ background: C.page, padding: `${phone ? 80 : 120}px ${GUTTER}` }}>
      <div style={{ maxWidth: CONTAINER, margin: "0 auto", display: "grid", gridTemplateColumns: split ? "360px minmax(0, 1fr)" : "minmax(0, 1fr)",
        gap: split ? 72 : 32, alignItems: "start" }}>
        <div>
          <Signpost stamp="lock">Guardrails</Signpost>
          <TwoTone as="h2" lead="Some things it will never do." rest="On purpose." style={{ marginTop: 12 }} />
        </div>
        <ul style={{ margin: 0, padding: 0 }}>
          {RULES.map((item, i) => <Row key={item.rule} item={item} phone={phone} first={i === 0} />)}
        </ul>
      </div>
    </section>
  );
}
