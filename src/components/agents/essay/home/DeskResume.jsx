import { useId } from "react";
import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { Button, StampTile } from "../../../ui/kit.jsx";
import { ESSAY_STATUS, KINDS } from "../../../../lib/essay.js";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { QuillLine } from "./homeParts.jsx";
import { Tag, WordMeter, answersOf, readLineOf } from "./EssayCard.jsx";

// The first thing under the night scene: the essay the student last worked on,
// large, with the one thing to do next. With no essay yet it is the invitation
// to start one, to find ideas, or to talk one through.
//
// It shows none of an essay's words: its title, what it answers, its length
// against the limit, where it stands and when Quill last read it.

/** essay: the most recently edited essay row (no text). onOpen(essay). */
export function DeskResume({ essay, today = new Date(), onOpen }) {
  const ink = useAgentInk();
  const titleId = useId();
  const supplement = essay.kind === "supplement";
  const kind = KINDS.find((k) => k.key === essay.kind)?.label || "Essay";
  const status = ESSAY_STATUS.find((s) => s.key === essay.status)?.label || "";
  const answers = answersOf(essay);
  const readLine = readLineOf(essay, today);

  return (
    <section aria-labelledby={titleId}
      style={{ marginTop: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 24px", padding: "18px 20px",
        background: WHITE, border: `1.5px solid ${ink.ring}`, borderRadius: RADIUS.card, boxSizing: "border-box" }}>
      <div style={{ flex: "1 1 280px", display: "flex", alignItems: "flex-start", gap: 14, minWidth: 0 }}>
        <StampTile kind={supplement ? "resume" : "notebook"} size={48} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, color: ink.text }}>Pick up where you left off</p>
          <h2 id={titleId} style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "1.4rem", fontWeight: 800, color: TEXT,
            letterSpacing: "-0.01em", lineHeight: 1.25, overflowWrap: "anywhere" }}>
            {essay.title || "Untitled essay"}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Tag style={{ background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>{kind}</Tag>
            {status && (
              <Tag style={essay.status === "done"
                ? { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` }
                : { background: WHITE, color: TEXT_MID, border: `1px solid ${BORDER}` }}>
                {essay.status === "done" && <PixelStamp kind="check" size={16} />}
                {status}
              </Tag>
            )}
          </div>
        </div>
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        {answers && (
          <p style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.5, color: TEXT,
            overflowWrap: "anywhere" }}>
            {answers}
          </p>
        )}
        <WordMeter essay={essay} />
        {readLine && (
          <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
            {readLine}
          </p>
        )}
      </div>
      <Button kind="primary" onClick={() => onOpen?.(essay)} aria-label={`Keep writing: ${essay.title || "Untitled essay"}`} style={{ minHeight: 48, padding: "0 24px", fontWeight: 800 }}>
        Keep writing
        <span aria-hidden="true" style={{ display: "inline-flex" }}><PixelArrow size={16} /></span>
      </Button>
    </section>
  );
}

/**
 * The desk with no essay yet: start one, or find what to write about.
 */
export function DeskInvitation({ onNew, onFindIdeas, onBrainstorm }) {
  const ink = useAgentInk();
  return (
    <section aria-labelledby="eq-desk-invite"
      style={{ marginTop: 18, padding: "20px", background: WHITE, border: `1.5px solid ${ink.ring}`, borderRadius: RADIUS.card,
        boxSizing: "border-box" }}>
      <h2 id="eq-desk-invite" style={{ margin: 0, fontFamily: SANS, fontSize: "1.4rem", fontWeight: 800, color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.25 }}>
        A blank page is a fine place to start
      </h2>
      <QuillLine style={{ marginTop: 6 }}>{QUILL_LINES.essaysEmpty}</QuillLine>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <Button kind="primary" onClick={onNew} style={{ minHeight: 48, padding: "0 22px", fontWeight: 800 }}>
          <PixelStamp kind="sparkle" size={16} />
          New essay
        </Button>
        <Button onClick={onFindIdeas}>
          <PixelStamp kind="star" size={16} />
          Find ideas
        </Button>
        <Button onClick={onBrainstorm}>
          <PixelStamp kind="chat" size={16} />
          Brainstorm with Quill
        </Button>
      </div>
    </section>
  );
}
