import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AgentScreen from "../screen/AgentScreen.jsx";
import { PixelStamp } from "../PixelIcons.jsx";
import { BORDER, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { FOCUS_CLASS } from "../../ui/tokens.js";
import { QUIET_CLASS } from "../../ui/kit.jsx";
import ProgressChecklist from "./ProgressChecklist.jsx";

// What Beaker did when the chat advisor handed it an outreach: the real
// checklist the backend streamed, then one card that says how it ended and
// links to where the student finishes it (the draft's review page, or the
// Agents page to pick a person or answer Beaker's question). Chat never sends:
// the email is read, edited and sent on the review page.

const OUTCOME = {
  draft: (o) => ({
    title: o.name ? `A draft to ${o.name} is on your board` : "A draft is on your board",
    detail: o.subject ? `Subject: ${o.subject}` : "Read it, make it yours, and send it when it's ready.",
    action: "Open the draft",
  }),
  shortlist: (o) => ({
    title: `Beaker found ${o.people?.length || "a few"} ${o.people?.length === 1 ? "person" : "people"} for you`,
    detail: o.people?.length ? o.people.join(", ") : "Pick the one you'd most like to hear from.",
    action: "Pick someone",
  }),
  ambiguous: (o) => ({
    title: "A few people share that name",
    detail: o.people?.length ? `Which one did you mean: ${o.people.join(", ")}?` : "Pick the one you meant.",
    action: "Choose the right one",
  }),
  question: (o) => ({
    title: "Beaker has one question before it writes",
    detail: o.question || "Answer it on the Agents page and Beaker will finish the draft.",
    action: "Answer Beaker",
  }),
  error: (o) => ({
    title: "Beaker couldn't finish this one",
    detail: o.message || "Nothing was lost. You can try again from the Agents page.",
    action: "Open your board",
  }),
};

export default function ChatHandoffCard({ run, isMobile = false }) {
  const ink = useAgentInk();
  const navigate = useNavigate();
  const [watching, setWatching] = useState(() => !run?.outcome);   // open while it runs; a finished run from history starts folded
  const screenRef = useRef(null);
  // When Beaker finishes, the screen folds to its toggle so the next step ("Open the draft")
  // is in view, unless the student is working inside it, in which case it stays.
  const ended = !!run?.outcome;
  const pointerIn = useRef(false);       // the student's pointer is on the screen: they're looking at it
  useEffect(() => {
    if (ended && !pointerIn.current && !screenRef.current?.contains(document.activeElement)) setWatching(false);
  }, [ended]);
  if (!run) return null;
  const outcome = run.outcome;
  const shots = run.shots || [];
  const copy = outcome ? (OUTCOME[outcome.outcome] || OUTCOME.error)(outcome) : null;
  const link = outcome?.link || "/agents/outreach";
  const open = (e) => { e.preventDefault(); navigate(link); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, marginTop: 14, fontFamily: SANS }}>
      {/* Live while Beaker works, and still there when it finishes so a tab being read never vanishes. */}
      {shots.length > 0 && watching && (
        <div ref={screenRef} style={{ minWidth: 0 }} onPointerEnter={() => { pointerIn.current = true; }}
          onPointerLeave={() => { pointerIn.current = false; }}>
          <AgentScreen shots={shots} agent="beaker" running={!outcome} isMobile={isMobile} height={isMobile ? 260 : 300} />
        </div>
      )}
      {shots.length > 0 && (
        <button type="button" onClick={() => setWatching((w) => !w)} aria-expanded={watching}
          className={`${QUIET_CLASS} ${FOCUS_CLASS}`}
          style={{ justifySelf: "start", minHeight: 44, padding: "10px 12px", border: "none", background: "transparent",
            borderRadius: RADIUS.control, color: ink.text, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>
          {watching ? "Hide Beaker's screen" : `See what Beaker looked at (${shots.length} ${shots.length === 1 ? "tab" : "tabs"})`}
        </button>
      )}
      {/* How it ended goes under the screen and its toggle, so nothing the student may be reading moves. */}
      {copy && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: WHITE,
          border: `1px solid ${outcome.outcome === "error" ? BORDER : ink.ring}`, borderRadius: RADIUS.card,
          padding: "14px 16px" }}>
          <span aria-hidden="true" style={{ color: ink.text, flexShrink: 0, paddingTop: 2 }}>
            <PixelStamp kind={outcome.outcome === "draft" || outcome.outcome === "error" ? "letter" : "person"} size={22} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: TEXT, lineHeight: 1.4 }}>{copy.title}</p>
            <p style={{ margin: "4px 0 10px", fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.45,
              overflowWrap: "anywhere" }}>{copy.detail}</p>
            <a href={link} onClick={open} className={FOCUS_CLASS} style={{ display: "inline-flex", alignItems: "center", minHeight: 44,
              padding: "10px 18px", boxSizing: "border-box", borderRadius: RADIUS.control, textDecoration: "none",
              background: ink.button.bg, color: ink.button.fg, fontSize: "1rem", fontWeight: 700 }}>
              {copy.action}
            </a>
          </div>
        </div>
      )}
      <ProgressChecklist lines={run.lines || []} label={outcome ? "What Beaker did" : "What Beaker is doing"} />
    </div>
  );
}
