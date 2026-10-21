import { memo, useLayoutEffect, useRef } from "react";
import RecordPanel, { sectionsFromRecord } from "../../onboarding/RecordPanel.jsx";
import { miniLabelStyle, pillStyle, squareChoiceStyle, subtitleStyle, titleStyle } from "../../onboarding/intakeTheme.js";
import { Button, Card, StampTile, Tip, inputStyle, textOnPage } from "../../ui/kit.jsx";
import { BG, BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { C, SHADOW, clamp01, seg, smooth, typed, useReduce } from "../kit.js";
import { AppSidebar, Cursor, MobileTabBar } from "../frames.jsx";
import { INTERVIEW, LIBRARY_ROW, RESUME_IMAGE, STUDENT, STUDENT_RECORD } from "../data.js";

// The Record story's screen (PLAN.md 6.4.1): the text interview, the review
// of what it heard, and the Portfolio, each a pure function of (step, t).
//
//   step 0  Talk it through    the first question, the answer typed and sent, the next question
//   step 1  Check what it heard the review; the role field corrected to "Programming lead"
//   step 2  Keep it in one place the Portfolio's ECs tab; Export resume pressed (the sheet is `Paper`);
//                               the Library help desk row the hero's advisor added scrolls into view
//
// Desktop fills the laptop's 860 x 538 screen; mobile fills a 340 to 360 box at the app's own
// phone layouts. Strings are the app's (TextInterview, IntakeReview, PortfolioPage, kit); the
// draft values are the real extraction's (onboarding_generated.json extract_fields).

const DOT_CSS = `
@keyframes lp-rec-dot { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes lp-rec-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-record]")) {
  const el = document.createElement("style");
  el.dataset.lpRecord = "";
  el.textContent = DOT_CSS;
  document.head.appendChild(el);
}

// The real interview lines, in order: question, answer, question.
const Q1 = INTERVIEW[0]?.text || "";
const A1 = INTERVIEW[1]?.text || "";
const Q2 = INTERVIEW[2]?.text || "";
const MAX_EXCHANGES = 12;
const PANEL_SECTIONS = sectionsFromRecord(STUDENT_RECORD);

// What extraction drafted for the first activity (the student corrects the role).
const DRAFT_THEME = "Builds software that solves problems for the people around them";
const DRAFT_FTC = {
  title: "FIRST Tech Challenge team",
  position: "Programmer",
  organization: "FIRST Tech Challenge",
  description: "Wrote the robot's autonomous code; now teach Java to the team's new members.",
  grade_levels: [],
  timing: "school_year",
};
const ROLE_FIXED = "Programming lead";
const TIMINGS = [
  { value: "school_year", label: "School year" },
  { value: "summer", label: "Summer" },
  { value: "all_year", label: "All year" },
];
const AWARD_LEVELS = { school: "School", regional: "Regional", state: "State", national: "National", international: "International" };

const HIDDEN_ANCHOR = { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" };

/**
 * The mobile screen's own width, as a zero-height in-flow sibling of the
 * absolutely positioned root: the app's phone layout is 340 to 360 wide, and
 * a card that shrink-wraps its content (a centred flex item) would otherwise
 * collapse a `width: 100%` ScreenCard to nothing. Inert where the frame
 * already has a width (a Phone, or a card in a sized column).
 */
export function MobileSizer() {
  // The page's 16px gutters and the card's 1px border on each side: 358 wide at 390, 360 at most.
  return <span aria-hidden="true" style={{ display: "block", width: "calc(100vw - 34px)", maxWidth: 358, height: 0 }} />;
}

/** The three "typing" dots the interviewer shows before a question. */
function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "6px 0" }}>
      {[0, 1, 2].map((d) => (
        <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: TEXT_MUTED,
          animation: `lp-rec-dot 1.1s ease-in-out ${d * 0.18}s infinite` }} />
      ))}
    </span>
  );
}

/** A blinking text caret at the end of a field being typed into. */
function Caret({ height = 18 }) {
  return (
    <span aria-hidden="true" style={{ display: "inline-block", width: 2, height, background: TEXT, verticalAlign: "text-bottom",
      marginLeft: 1, animation: "lp-rec-caret 1s steps(1) infinite" }} />
  );
}

/** A field recreated as a box in the kit's input look (the mockup is inert, so it is never typed into). */
function Field({ value, placeholder, focused, ring, selected, selectColor, caret, style, anchor, multiline }) {
  const empty = !value;
  return (
    <div data-lp-anchor={anchor} style={{ ...inputStyle, color: empty ? TEXT_MUTED : TEXT, whiteSpace: multiline ? "pre-wrap" : "nowrap",
      overflow: "hidden", textOverflow: "ellipsis", outline: focused ? `3px solid ${ring}` : "none", outlineOffset: 1, ...style }}>
      {empty ? placeholder : selected ? <span style={{ background: selectColor }}>{value}</span> : value}
      {caret && <Caret />}
    </div>
  );
}

const Logo = () => {
  const ink = useAgentInk();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: TEXT, letterSpacing: "-0.04em" }}>mentorable</span>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ink.accent, display: "inline-block", flexShrink: 0 }} />
    </div>
  );
};

const Panel = memo(function Panel() {
  return <RecordPanel sections={PANEL_SECTIONS} sticky={false} />;
});

// ─── Step 0: the text interview ──────────────────────────────────────────────

function Interview({ t, mobile, active }) {
  const ink = useAgentInk();
  const scroller = useRef(null);
  const sent = t >= 0.6;
  const dots = t >= 0.65 && t < 0.75;
  const q2 = t >= 0.75;
  const draft = sent ? "" : typed(A1, seg(t, 0.05, 0.55));
  const focused = t >= 0.04 && !sent;
  const typing = t >= 0.05 && t < 0.55;
  const pressed = (t >= 0.02 && t < 0.05) || (t >= 0.57 && t < 0.62);
  const exchanges = sent ? 1 : 0;

  // The conversation keeps its newest line in view, as the app does.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const bubble = (
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "4px 0 16px" }}>
      <div style={{ maxWidth: "85%", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 500, lineHeight: 1.6, padding: "12px 16px",
        borderRadius: RADIUS.card, background: ink.soft, color: TEXT, border: `1px solid ${ink.soft}`, whiteSpace: "pre-wrap",
        overflowWrap: "anywhere" }}>
        {A1}
      </div>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "2rem 0 1.5rem", boxSizing: "border-box" }}>
      <div style={{ display: "flex", gap: "2.5rem", alignItems: "stretch", width: "100%", maxWidth: 1240, margin: "0 auto",
        padding: mobile ? "0 1rem" : "0 1.5rem", boxSizing: "border-box", flex: 1, minHeight: 0 }}>
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <Logo />
          <p style={{ ...titleStyle(ink, mobile), fontSize: mobile ? "1.9rem" : "2.3rem" }}>Tell us more about what you do</p>
          <p style={{ ...subtitleStyle(mobile), marginBottom: "1.4rem" }}>
            Quick questions about the activities and awards you listed. Short answers are fine.
          </p>

          <div ref={scroller} style={{ flex: 1, overflowY: "auto", minHeight: 160, paddingRight: 4 }}>
            <Tip name="Mentorable" stamp="chat" tone="default" style={{ marginBottom: 12, paddingRight: mobile ? 0 : "10%" }}>
              <span style={{ whiteSpace: "pre-wrap" }}>{Q1}</span>
            </Tip>
            {sent && bubble}
            {dots && (
              <Tip name="Mentorable" stamp="chat" tone="default" style={{ marginBottom: 12, paddingRight: mobile ? 0 : "10%" }}>
                <Dots />
              </Tip>
            )}
            {q2 && (
              <Tip name="Mentorable" stamp="chat" tone="default" style={{ marginBottom: 12, paddingRight: mobile ? 0 : "10%" }}>
                <span style={{ whiteSpace: "pre-wrap" }}>{Q2}</span>
              </Tip>
            )}
          </div>

          <div style={{ paddingTop: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <Field anchor="rec-input" value={draft} placeholder="Type your answer…" focused={focused} ring={ink.ring} caret={typing} multiline
                style={{ flex: 1, width: "auto", minWidth: 0, fontSize: "1.05rem", padding: "12px 14px", minHeight: 50 }} />
              <Button kind="primary" disabled={!draft} data-lp-anchor="rec-send"
                style={{ minHeight: 50, padding: "10px 22px", flexShrink: 0, transform: pressed && t > 0.5 ? "translateY(1px)" : undefined,
                  filter: pressed && t > 0.5 ? "brightness(0.93)" : undefined }}>
                Send
              </Button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13, gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
                {exchanges} of {MAX_EXCHANGES} answers
              </span>
              <Button kind="secondary" disabled={exchanges === 0}>I'm done, wrap up</Button>
            </div>
          </div>

          {active && <Cursor anchor={t < 0.5 ? "rec-input" : "rec-send"} press={pressed} show variant={mobile ? "tap" : "arrow"} />}
        </div>

        {!mobile && (
          <div style={{ flex: "0 0 340px", width: "100%", maxWidth: 340, overflow: "hidden" }}>
            <Panel />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: the review ──────────────────────────────────────────────────────

function Review({ t, mobile, active, opacity }) {
  const ink = useAgentInk();
  const scroller = useRef(null);
  const role = t < 0.42 ? DRAFT_FTC.position : typed(ROLE_FIXED, seg(t, 0.42, 0.7));
  const selected = t >= 0.35 && t < 0.42;
  const focused = t >= 0.3;
  const typing = t >= 0.42 && t < 0.7;
  const pressed = t >= 0.27 && t < 0.32;
  const anchor = t >= 0.2 && t < 0.8 ? "rec-role" : "rec-review-away";
  const ftc = DRAFT_FTC;

  // The page scrolls so the field being corrected sits in the middle of the screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = el.querySelector('[data-lp-anchor="rec-role"]');
    const want = target ? Math.max(0, target.offsetTop - el.clientHeight * 0.42) : 0;
    el.scrollTop = Math.round(want * smooth(seg(t, 0.06, 0.22)));
  });

  const block = { border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "12px 14px 14px", background: SURFACE };
  const section = (title, hint, body) => (
    <div style={{ marginBottom: "1.6rem" }}>
      <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.2rem", color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3, margin: `0 0 ${hint ? 4 : 12}px` }}>
        {title}
      </p>
      {hint && <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: ink.text, lineHeight: 1.55, margin: "0 0 12px" }}>{hint}</p>}
      {body}
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity, background: BG }}>
      <div ref={scroller} style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ position: "relative", padding: mobile ? "1.5rem 0 3rem" : "2.5rem 0 3rem" }}>
          <div style={{ width: "100%", maxWidth: 820, margin: "0 auto", padding: mobile ? "0 1rem" : "0 1.5rem", boxSizing: "border-box" }}>
            <p style={titleStyle(ink, mobile)}>Here's what we heard</p>
            <p style={{ ...subtitleStyle(mobile), marginBottom: "1.6rem" }}>
              We filled some of this in from the conversation, so check it before we save. Anything here can be edited now or later.
            </p>
            <span data-lp-anchor="rec-review-away" style={{ ...HIDDEN_ANCHOR, right: 0, top: 0 }} />

            <Card style={{ padding: mobile ? "1.2rem 1.1rem 0.2rem" : "1.6rem 1.6rem 0.4rem" }}>
              {section("Your through-line", "What we think connects your activities. Reword it if we read it wrong.",
                <Field value={DRAFT_THEME} multiline style={{ minHeight: 76 }} />)}

              {section("What you told us about",
                "We wrote these up in Common App format. Hours and roles were inferred from the conversation, so fix anything that's off.",
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={block}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 11 }}>
                      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, minWidth: 0, overflowWrap: "anywhere" }}>{ftc.title}</span>
                      <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED, minHeight: 40, display: "inline-flex",
                        alignItems: "center", padding: "0 8px", margin: "-6px -8px -6px 0", flexShrink: 0 }}>Remove</span>
                    </div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <span style={miniLabelStyle}>Your role</span>
                        <Field anchor="rec-role" value={role} focused={focused} ring={ink.ring} selected={selected} selectColor={ink.soft} caret={typing} />
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <span style={miniLabelStyle}>Organization</span>
                        <Field value={ftc.organization} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={miniLabelStyle}>Description</span>
                        <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
                          {ftc.description.length}/150
                        </span>
                      </div>
                      <Field value={ftc.description} multiline style={{ minHeight: 76 }} />
                    </div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <span style={miniLabelStyle}>Hours / week</span>
                        <Field value="" placeholder="" />
                      </div>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <span style={miniLabelStyle}>Weeks / year</span>
                        <Field value="" placeholder="" />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <span style={miniLabelStyle}>Grades involved</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[9, 10, 11, 12].map((g) => (
                          <span key={g} style={{ ...squareChoiceStyle(ink, ftc.grade_levels.includes(g), 44), display: "inline-flex",
                            alignItems: "center", justifyContent: "center" }}>{g}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span style={miniLabelStyle}>When</span>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {TIMINGS.map((tm) => (
                          <span key={tm.value} style={{ ...pillStyle(ink, ftc.timing === tm.value), fontSize: "0.95rem", padding: "0 14px",
                            display: "inline-flex", alignItems: "center" }}>{tm.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>)}

              {section("What's missing", "Honest gaps between where you are and where you're aiming.",
                <Field value="No research or internship experience yet" />)}
            </Card>
          </div>
          {active && <Cursor anchor={anchor} press={pressed} show variant={mobile ? "tap" : "arrow"} />}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: the Portfolio, ECs / Awards tab ─────────────────────────────────

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const iconBtn = { flexShrink: 0, width: 44, height: 44, color: TEXT_MUTED, display: "inline-flex", alignItems: "center",
  justifyContent: "center", borderRadius: RADIUS.control };

/** One activity, as PortfolioPage's ActivityCard shows it closed. */
function ActivityRow({ a, flash }) {
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    (a.grade_levels || []).length ? `${(a.grade_levels || []).length === 1 ? "Grade" : "Grades"} ${(a.grade_levels || []).join(", ")}` : null,
  ].filter(Boolean);
  return (
    <Card style={{ padding: 0, marginBottom: 10, borderRadius: RADIUS.control, overflow: "hidden",
      backgroundColor: flash ? C.softer : WHITE, transition: flash ? "none" : "background-color 1200ms ease-out" }}>
      <div style={{ padding: "8px 8px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT, overflowWrap: "anywhere" }}>
            {a.title}
          </div>
          <span style={iconBtn}><PencilIcon /></span>
          <span style={iconBtn}><XIcon /></span>
        </div>
        <div style={{ paddingRight: 6 }}>
          {meta.length > 0 && (
            <div style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5 }}>{meta.join(" · ")}</div>
          )}
          {a.description && (
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "7px 0 0" }}>{a.description}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** One award row (title, level, year), as the Awards section lists them. */
function AwardRow({ w }) {
  const label = { fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT, display: "block", marginBottom: 6 };
  return (
    <Card style={{ padding: "12px 14px", marginBottom: 10, borderRadius: RADIUS.control, position: "relative", paddingRight: 54 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}><span style={label}>Award</span><Field value={w.title} /></div>
        <div style={{ flex: "1 1 130px" }}><span style={label}>Level</span><Field value={AWARD_LEVELS[w.level] || "Level"} /></div>
        <div style={{ flex: "1 1 90px" }}><span style={label}>Year</span><Field value={String(w.year || "")} placeholder="2025" /></div>
      </div>
      <span style={{ ...iconBtn, position: "absolute", top: 4, right: 4 }}><XIcon /></span>
    </Card>
  );
}

function SectionHeader({ title, stamp, count, hint, action, mobile }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: hint ? 8 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <StampTile kind={stamp} />
          <p style={{ margin: 0, fontFamily: SANS, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", fontSize: "1.3rem", lineHeight: 1.3 }}>
            {title}
            {count > 0 && (
              <span style={{ fontWeight: 700, fontSize: "1rem", color: TEXT_MUTED, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{count}</span>
            )}
          </p>
        </div>
        <Button kind="secondary" style={{ padding: "8px 14px", width: mobile ? undefined : undefined }}><PlusIcon />{action}</Button>
      </div>
      {hint && (
        <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55, margin: "0 0 16px", maxWidth: "62ch" }}>{hint}</p>
      )}
    </>
  );
}

function Portfolio({ t, mobile, opacity }) {
  const ink = useAgentInk();
  const scroller = useRef(null);
  const rowIn = t >= 0.75;
  const flash = rowIn && t < 0.9;
  const pressed = t >= 0.38 && t < 0.45;
  const resumeIn = mobile && t >= 0.45;
  const activities = rowIn ? [...STUDENT.activities, LIBRARY_ROW] : STUDENT.activities;
  const ecCount = activities.length + STUDENT.awards.length;
  const acCount = STUDENT.courses.length + STUDENT.test_scores.length;

  // With the new row in, the page scrolls to the end of Activities to show it.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (!rowIn) { el.scrollTop = 0; return; }
    const end = el.querySelector('[data-lp-mark="activities-end"]');
    const max = end ? Math.max(0, end.offsetTop - el.clientHeight + 28) : 0;
    el.scrollTop = Math.round(max * smooth(seg(t, 0.75, 0.9)));
  });

  const pill = (label, n, on) => (
    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", borderRadius: RADIUS.pill, padding: mobile ? "4px 8px" : "0 14px",
      minHeight: 44, lineHeight: 1.2, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: mobile ? undefined : 44, border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE,
      color: on ? ink.onSoft : TEXT_MID }}>
      {label}{n > 0 && <span style={{ marginLeft: 7, fontVariantNumeric: "tabular-nums" }}>{n}</span>}
    </span>
  );

  const content = (
    <div style={{ maxWidth: 880, margin: "0 auto", width: "100%" }}>
      <div style={{ margin: "0 0 1.75rem" }}>
        <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: mobile ? "2.1rem" : "2.5rem", color: ink.title, letterSpacing: "-0.03em",
          margin: "0 0 0.5rem", lineHeight: 1.1 }}>Portfolio</p>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: mobile ? "1.05rem" : "1.15rem", color: TEXT_MUTED, lineHeight: 1.6, maxWidth: "62ch" }}>
          Your grades, scores, classes, activities and awards, all in one place. Your advisor in{" "}
          <span style={{ color: textOnPage(ink), fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>Chat</span>{" "}
          reads all of it, so the more you fill in, the more specific its advice.
        </p>
      </div>
      <span data-lp-anchor="rec-pf-away" style={{ ...HIDDEN_ANCHOR, right: 0, top: 0 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div style={{ flex: mobile ? "1 1 100%" : "0 1 auto", minWidth: 0 }}>
          <div style={mobile ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 } : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pill("Academics", acCount, false)}
            {pill("ECs / Awards", ecCount, true)}
          </div>
        </div>
        <Button kind="secondary" data-lp-anchor="rec-export"
          style={{ ...(mobile ? { width: "100%" } : null), transform: pressed ? "translateY(1px)" : undefined, filter: pressed ? "brightness(0.93)" : undefined }}>
          <DownloadIcon />
          Export resume
        </Button>
      </div>

      {resumeIn && (
        <div style={{ marginBottom: "1.25rem", opacity: seg(t, 0.45, 0.6) }}>
          <img src={RESUME_IMAGE.src} width={RESUME_IMAGE.w} height={RESUME_IMAGE.h} alt="" draggable={false}
            style={{ display: "block", width: "100%", height: "auto", background: WHITE, borderRadius: 4, boxShadow: SHADOW.device }} />
        </div>
      )}

      <Card style={{ padding: "1.3rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <StampTile kind="resume" />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: TEXT, margin: "0 0 4px" }}>Have a resume or brag sheet?</p>
              <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.55, margin: 0 }}>
                Upload it and we'll pull out your activities and awards. You review everything before it's added.
              </p>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", width: mobile ? "100%" : undefined }}>
            <Button kind="primary" style={mobile ? { width: "100%" } : undefined}>Upload</Button>
            <p style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, textAlign: "center", margin: "7px 0 0",
              fontVariantNumeric: "tabular-nums" }}>2 left</p>
          </div>
        </div>
      </Card>

      <Card style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
        <SectionHeader title="Activities" stamp="rocket" count={activities.length} action="Add activity" mobile={mobile}
          hint="Clubs, sports, jobs, projects, volunteering, research. Open one to fill in your role, hours and what you actually did." />
        {activities.map((a, i) => (
          <ActivityRow key={a.id || a.title} a={a} flash={flash && i === activities.length - 1} />
        ))}
        <span data-lp-mark="activities-end" style={{ display: "block", height: 0 }} />
      </Card>

      <Card style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
        <SectionHeader title="Awards and honors" stamp="trophy" count={STUDENT.awards.length} action="Add award" mobile={mobile}
          hint="Anything you were recognised for, at any level." />
        {STUDENT.awards.map((w) => <AwardRow key={w.id} w={w} />)}
      </Card>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity, background: BG, display: "flex" }}>
      {!mobile && <AppSidebar active="portfolio" streak={3} lit={false} level={1} width={200} />}
      <div ref={scroller} style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ position: "relative", padding: mobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem", boxSizing: "border-box" }}>
          {content}
          <Cursor anchor={t < 0.3 ? "rec-pf-away" : "rec-export"} press={pressed} show variant={mobile ? "tap" : "arrow"} />
        </div>
      </div>
      {mobile && <MobileTabBar active="portfolio" streak={3} lit={false} />}
    </div>
  );
}

// ─── The screen ──────────────────────────────────────────────────────────────

export default function RecordScreen({ step = 0, t = 0, layout = "desktop" }) {
  const mobile = layout === "mobile";
  const s = Math.max(0, Math.min(2, Math.floor(Number(step) || 0)));
  const tt = clamp01(t);
  const showInterview = s === 0 || (s === 1 && tt < 0.2);
  const showReview = s === 1 || (s === 2 && tt < 0.1);
  return (
    <>
      {mobile && <MobileSizer />}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: BG, fontFamily: SANS, color: TEXT }}>
        {showInterview && <Interview t={s === 0 ? tt : 1} mobile={mobile} active={s === 0} />}
        {showReview && <Review t={s === 1 ? tt : 1} mobile={mobile} active={s === 1} opacity={s === 1 ? seg(tt, 0, 0.2) : 1} />}
        {s === 2 && <Portfolio t={tt} mobile={mobile} opacity={seg(tt, 0, 0.1)} />}
      </div>
    </>
  );
}

/**
 * The resume sheet, rendered by the frame owner in Laptop's `paper` anchor
 * (the lid's bottom-right corner, painted behind the lid). It comes out from
 * behind the lid at step 2, t .45 to .7; under reduced motion it is simply
 * there at step 2.
 *
 * place "side": it slides out past the lid's right edge (240px of it shows).
 * place "top", where the page has no room beside the laptop: it rises out of
 * the lid's top edge by `rise` px, its right edge 24px in from the lid's
 * right edge.
 */
const LID_H = 558;   // Laptop's lid: a 538 screen in a 10px bezel
const SHEET_W = 360;

export function Paper({ step = 0, t = 0, place = "side", rise = 120 }) {
  const reduce = useReduce();
  if (Math.floor(Number(step) || 0) < 2) return null;
  const p = reduce ? 1 : smooth(seg(clamp01(t), 0.45, 0.7));
  const sheet = { position: "absolute", width: SHEET_W, maxWidth: "none", height: "auto", display: "block", background: WHITE,
    borderRadius: 4, boxShadow: SHADOW.device, opacity: p > 0 ? 1 : 0 };
  if (place === "top") {
    const y = Math.round((rise + 24) * (1 - p));
    return (
      <img src={RESUME_IMAGE.src} width={RESUME_IMAGE.w} height={RESUME_IMAGE.h} alt="" aria-hidden="true" draggable={false}
        style={{ ...sheet, left: -24 - SHEET_W, top: -(LID_H + rise), transform: `translateY(${y}px) rotate(2deg)`,
          transformOrigin: "50% 100%" }} />
    );
  }
  const x = Math.round(-250 * (1 - p));
  return (
    <img src={RESUME_IMAGE.src} width={RESUME_IMAGE.w} height={RESUME_IMAGE.h} alt="" aria-hidden="true" draggable={false}
      style={{ ...sheet, left: -120, bottom: 40, transform: `translateX(${x}px) rotate(-2deg)`, transformOrigin: "50% 100%",
        WebkitMaskImage: "linear-gradient(#000 80%, transparent)", maskImage: "linear-gradient(#000 80%, transparent)" }} />
  );
}

RecordScreen.Paper = Paper;
