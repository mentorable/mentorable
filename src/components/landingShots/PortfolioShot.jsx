import { Button, Card, StampTile, textOnPage } from "../ui/kit.jsx";
import { BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import { AppSidebar } from "./AppChrome.jsx";
import SAMPLE from "./sample.json";

// The Portfolio page as the app draws it on a laptop, on its ECs / Awards tab,
// with the demo student's record. Laid out at a real 1000 x 650 screen; the
// landing page scales it down into the laptop. Strings are PortfolioPage's.

export const PORTFOLIO_SHOT = { w: 1000, h: 650 };

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const iconBtn = { flexShrink: 0, width: 44, height: 44, color: TEXT_MUTED, display: "inline-flex", alignItems: "center",
  justifyContent: "center", borderRadius: RADIUS.control };

/** One activity, as PortfolioPage's ActivityCard shows it closed. */
function ActivityRow({ a }) {
  const grades = a.grade_levels || [];
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    grades.length ? `${grades.length === 1 ? "Grade" : "Grades"} ${grades.join(", ")}` : null,
  ].filter(Boolean);
  return (
    <Card style={{ padding: 0, marginBottom: 10, borderRadius: RADIUS.control, overflow: "hidden" }}>
      <div style={{ padding: "8px 8px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontWeight: 700, fontSize: "1.05rem", color: TEXT }}>{a.title}</div>
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

export default function PortfolioShot() {
  const ink = useAgentInk();
  const ecCount = SAMPLE.activities.length + SAMPLE.awards.length;
  const acCount = SAMPLE.courses.length + SAMPLE.test_scores.length;

  const pill = (label, n, on) => (
    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", borderRadius: RADIUS.pill, padding: "0 14px",
      minHeight: 44, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE, color: on ? ink.onSoft : TEXT_MID }}>
      {label}<span style={{ marginLeft: 7, fontVariantNumeric: "tabular-nums" }}>{n}</span>
    </span>
  );

  return (
    <div style={{ width: PORTFOLIO_SHOT.w, height: PORTFOLIO_SHOT.h, background: BG, display: "flex", overflow: "hidden",
      fontFamily: SANS, color: TEXT, textAlign: "left" }}>
      <AppSidebar active="portfolio" />
      <div style={{ flex: 1, minWidth: 0, padding: "2.5rem 2rem", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <p style={{ fontWeight: 800, fontSize: "2.5rem", color: ink.title, letterSpacing: "-0.03em", margin: "0 0 0.5rem", lineHeight: 1.1 }}>
            Portfolio
          </p>
          <p style={{ margin: "0 0 1.75rem", fontSize: "1.15rem", color: TEXT_MUTED, lineHeight: 1.6, maxWidth: "62ch" }}>
            Your grades, scores, classes, activities and awards, all in one place. Your advisor in{" "}
            <span style={{ color: textOnPage(ink), fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>Chat</span>{" "}
            reads all of it, so the more you fill in, the more specific its advice.
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {pill("Academics", acCount, false)}
              {pill("ECs / Awards", ecCount, true)}
            </div>
            <Button kind="secondary" tabIndex={-1}><DownloadIcon />Export resume</Button>
          </div>

          <Card style={{ padding: "1.3rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <StampTile kind="resume" />
                <div>
                  <p style={{ fontWeight: 800, fontSize: "1.1rem", margin: "0 0 4px" }}>Have a resume or brag sheet?</p>
                  <p style={{ fontSize: "1rem", color: TEXT_MUTED, lineHeight: 1.55, margin: 0 }}>
                    Upload it and we'll pull out your activities and awards. You review everything before it's added.
                  </p>
                </div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Button kind="primary" tabIndex={-1}>Upload</Button>
                <p style={{ fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, margin: "7px 0 0" }}>2 left</p>
              </div>
            </div>
          </Card>

          <Card style={{ padding: "1.3rem 1.3rem 1.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StampTile kind="rocket" />
                <p style={{ margin: 0, fontWeight: 800, letterSpacing: "-0.01em", fontSize: "1.3rem", lineHeight: 1.3 }}>
                  Activities
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: TEXT_MUTED, marginLeft: 8 }}>{SAMPLE.activities.length}</span>
                </p>
              </div>
              <Button kind="secondary" tabIndex={-1} style={{ padding: "8px 14px" }}><PlusIcon />Add activity</Button>
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55, margin: "0 0 16px", maxWidth: "62ch" }}>
              Clubs, sports, jobs, projects, volunteering, research. Open one to fill in your role, hours and what you actually did.
            </p>
            {SAMPLE.activities.map((a) => <ActivityRow key={a.id || a.title} a={a} />)}
          </Card>
        </div>
      </div>
    </div>
  );
}
