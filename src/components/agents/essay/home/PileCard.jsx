import { PixelArrow, PixelStamp } from "../../../ui/PixelIcons.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { LINK_CLASS } from "../../../ui/kit.jsx";
import BoardMoveMenu from "../../outreach/BoardMoveMenu.jsx";
import { FLASH_CLASS } from "../../outreach/flowUi.jsx";
import { TOPIC_STATUS } from "../../../../lib/essay.js";
import { SOURCES, Tag, previewOf } from "./IdeaParts.jsx";
import { plural } from "./homeUi.js";

// One idea, small, in a pile: where it came from, its name, one line of what
// is on it, and two ways on: Open (the whole card in a drawer) and Move to
// (a menu that works by keyboard and on a phone). Nothing is edited here.

/**
 * topic: an essay_topics row. essays: [{ id, title }] that grew from it.
 * onOpen(): show the whole card. onMove(statusKey): change its pile.
 */
export default function PileCard({ topic, essays = [], fresh = false, onOpen, onMove, onOpenEssay }) {
  const ink = useAgentInk();
  const source = SOURCES[topic.source] || SOURCES.student;
  const chosen = topic.status === "chosen";
  const parked = topic.status === "parked";
  const area = topic.area || "Untitled idea";
  const peek = previewOf(topic);
  const hasNotes = !!(topic.notes || "").trim();
  const line = { margin: 0, fontFamily: SANS, lineHeight: 1.5, overflowWrap: "anywhere" };

  return (
    <article aria-label={`Idea: ${area}`} className={fresh ? FLASH_CLASS : undefined}
      style={{ background: WHITE, borderRadius: 12, boxSizing: "border-box", minWidth: 0, padding: "12px 12px 8px 14px",
        ...(parked
          ? { border: "1.5px dashed #b9b3aa" }
          : { borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
            borderColor: `${BORDER} ${BORDER} ${BORDER} ${chosen ? ink.ring : ink.soft}` }) }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Tag style={{ background: "#f0efec", color: TEXT_MID, border: `1px solid ${BORDER}` }}>
          <PixelStamp kind={source.stamp} size={16} />
          {source.label}
        </Tag>
        {fresh && <Tag style={{ background: ink.soft, color: ink.onSoft }}>New</Tag>}
      </div>

      <h4 tabIndex={-1} data-topic-title={topic.id}
        style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT,
          letterSpacing: "-0.01em", lineHeight: 1.3, overflowWrap: "anywhere", outline: "none" }}>
        {area}
      </h4>

      {peek.kind === "question" && (
        <p style={{ ...line, marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.98rem",
          fontWeight: 600, color: TEXT }}>
          <span aria-hidden="true" style={{ display: "flex", marginTop: 4, flexShrink: 0, color: ink.text }}>
            <PixelStamp kind="question" size={16} />
          </span>
          <span>
            {peek.text}
            {peek.more > 0 && (
              <span style={{ display: "block", marginTop: 2, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED }}>
                and {plural(peek.more, "more question")}
              </span>
            )}
          </span>
        </p>
      )}
      {peek.kind === "evidence" && (
        <p style={{ ...line, marginTop: 8, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID }}>
          <span style={{ fontWeight: 700, color: TEXT_MUTED }}>{peek.label}: </span>
          {peek.quote ? <>&ldquo;{peek.text}&rdquo;</> : peek.text}
        </p>
      )}
      {peek.kind === "notes" && (
        <p style={{ ...line, marginTop: 8, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {peek.text}
        </p>
      )}
      {peek.kind === "none" && (
        <p style={{ ...line, marginTop: 8, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED }}>
          Nothing on this card yet. Open it to add notes.
        </p>
      )}

      {essays.length > 0 && (
        <p style={{ ...line, marginTop: 8, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID }}>
          {essays.length === 1 ? "Essay: " : "Essays: "}
          {essays.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ", "}
              <button type="button" className={`${FOCUS_CLASS} ${LINK_CLASS}`} onClick={() => onOpenEssay?.(e.id)}
                style={{ display: "inline-flex", alignItems: "center", minHeight: 44, maxWidth: "100%", padding: 0,
                  border: "none", background: "none", cursor: "pointer", borderRadius: 4, fontFamily: SANS,
                  fontSize: "0.95rem", fontWeight: 700, color: ink.text, textAlign: "left", overflowWrap: "anywhere" }}>
                {e.title || "Untitled essay"}
              </button>
            </span>
          ))}
        </p>
      )}

      <p style={{ ...line, marginTop: 6, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED }}>
        {hasNotes ? "Has your notes" : "No notes yet"}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6,
        marginTop: 4 }}>
        <button type="button" className={FOCUS_CLASS} data-open-for={topic.id} aria-haspopup="dialog" onClick={onOpen}
          aria-label={`Open the card for ${area}`}
          style={{ minHeight: 44, minWidth: 44, padding: "0 12px 0 0", display: "inline-flex", alignItems: "center", gap: 6,
            border: "none", background: "none", cursor: "pointer", borderRadius: RADIUS.control, fontFamily: SANS,
            fontSize: "0.95rem", fontWeight: 800, color: ink.text }}>
          Open
          <PixelArrow size={16} />
        </button>
        <BoardMoveMenu card={{ id: topic.id, name: area, stage: topic.status }} stages={TOPIC_STATUS}
          onMove={onMove} />
      </div>
    </article>
  );
}
