import { Button, Card, StampTile, Tag, textOnPage } from "../ui/kit.jsx";
import { BG, BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../ui/tokens.js";
import { AppSidebar } from "./AppChrome.jsx";
import SAMPLE from "./sample.json";

// The Portfolio page as the app draws it on a laptop, on its Activities & awards tab,
// with the demo student's record. Laid out at a real 1000 x 650 screen; the
// landing page scales it down into the laptop. Strings are PortfolioPage's.

export const PORTFOLIO_SHOT = { w: 1000, h: 650 };

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

/** One activity, as PortfolioPage's RecordLine shows it closed: the name and
 *  a meta line with Edit, then what you did. Remove lives in the editor. */
function ActivityRow({ a }) {
  const grades = a.grade_levels || [];
  const meta = [
    a.position, a.organization,
    a.hours_per_week && a.weeks_per_year ? `${a.hours_per_week} hrs/wk, ${a.weeks_per_year} wks/yr` : null,
    grades.length ? `${grades.length === 1 ? "Grade" : "Grades"} ${grades.join(", ")}` : null,
  ].filter(Boolean);
  const thin = !a.description && !a.position;
  return (
    <Card style={{ padding: 0, marginBottom: 8, borderRadius: RADIUS.control, overflow: "hidden" }}>
      <div style={{ padding: "6px 6px 6px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, padding: "8px 0 4px" }}>
            <span style={{ display: "block", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>{a.title}</span>
            {meta.length > 0 && (
              <span style={{ display: "block", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID,
                lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>{meta.join(" · ")}</span>
            )}
          </div>
          <Button kind="quiet" tabIndex={-1} style={{ flexShrink: 0, padding: "0 10px" }}><PencilIcon />Edit</Button>
        </div>
        <div style={{ paddingRight: 8, paddingBottom: 6 }}>
          {a.description && (
            <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55, margin: "2px 0 0" }}>{a.description}</p>
          )}
          {thin && <Tag style={{ marginTop: 4 }}>Needs detail</Tag>}
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
            reads all of it, so the more you fill in, the more specific its advice. Changes save as you type.
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {pill("Academics", acCount, false)}
              {pill("Activities & awards", ecCount, true)}
            </div>
            <Button kind="secondary" tabIndex={-1}><DownloadIcon />Export resume</Button>
          </div>

          {/* The upload card is a section card on the page: mark, heading and
              action in the header row, the hint under it. */}
          <Card style={{ padding: "1.3rem 1.3rem 1.4rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <StampTile kind="resume" />
                <p style={{ margin: 0, fontWeight: 800, letterSpacing: "-0.01em", fontSize: "1.3rem", lineHeight: 1.3 }}>
                  Have a resume or brag sheet?
                </p>
              </div>
              <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
                <Button kind="secondary" tabIndex={-1}>Upload a file</Button>
                <p style={{ fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED, margin: 0, textAlign: "center" }}>You can upload 2 more files.</p>
              </div>
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55, margin: 0, maxWidth: "62ch" }}>
              Upload a .pdf, .docx, .txt or .md file and we'll pull out your activities and awards. You review everything before it's added.
            </p>
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
              <Button kind="secondary" tabIndex={-1}><PlusIcon />Add activity</Button>
            </div>
            <p style={{ fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.55, margin: "0 0 16px", maxWidth: "62ch" }}>
              Clubs, sports, jobs, family responsibilities, projects, volunteering, research. Open one with Edit to fill in your role, hours and what you actually did.
            </p>
            {SAMPLE.activities.map((a) => <ActivityRow key={a.id || a.title} a={a} />)}
          </Card>
        </div>
      </div>
    </div>
  );
}
