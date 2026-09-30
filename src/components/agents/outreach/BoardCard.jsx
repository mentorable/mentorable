import { useRef } from "react";
import BoardMoveMenu from "./BoardMoveMenu.jsx";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
} from "../agentUi.js";
import { dueMarker, stageLine } from "../../../lib/outreach.js";
import { CARD_CLASS, SR_ONLY } from "./BoardUi.js";

// One card on the board: who, where they are, where it stands in plain words,
// who made it (Beaker or you), and an amber marker when something is due
// (amber means behind, never red). The name is the card's real button; a
// click anywhere else on the card does the same for a mouse. On desktop the
// whole card can be dragged; "Move to" works everywhere.
//
// A card Beaker made opens its email; its "..." button opens the drawer for
// the rest (notes, follow-up date, delete). A card the student made opens
// that drawer straight away, so it needs no second button.

// The perforated stamp: a dotted pixel edge on a paper-coloured ground, like
// a postage mark. Neutral on purpose: an accent-tinted stamp would look like
// the amber "due" band for a student whose accent is amber, and amber means
// behind.
const DOT = "#a9a39a";
const dots = (dir, pos, size) => `linear-gradient(${dir}, ${DOT} 50%, transparent 50%) ${pos} / ${size} repeat-${dir === "90deg" ? "x" : "y"}`;
const PERFORATED = [
  dots("90deg", "left top", "4px 2px"), dots("90deg", "left bottom", "4px 2px"),
  dots("180deg", "left top", "2px 4px"), dots("180deg", "right top", "2px 4px"),
].join(", ") + ", #faf9f5";

function Tag({ agent, id }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: agent ? "5px 9px 5px 7px" : "5px 10px",
      background: PERFORATED, color: TEXT_MID, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, whiteSpace: "nowrap" }}>
      {agent && <PixelStamp kind="letter" size={16} />}
      <span aria-hidden="true">{agent ? "Beaker" : "You"}</span>
      <span id={id} style={SR_ONLY}>{agent ? "Drafted with Beaker" : "Added by you"}</span>
    </span>
  );
}

// Three pixel dots, the usual "more for this card" mark, on a 2px grid so
// it stays crisp.
function MoreDots() {
  return (
    <svg width="20" height="20" viewBox="0 0 10 10" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0 }}>
      <path d="M0 4h2v2H0zM4 4h2v2H4zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

export default function BoardCard({
  card, today, stages, draggable = false, dragging = false, busy = false,
  onOpen, onDetails, onMove, onReorder, canUp, canDown, onDragStart, onDragEnd, style,
}) {
  const nameRef = useRef(null);
  const marker = dueMarker(card, today);
  const line = stageLine(card, today);
  const metaId = `ob-card-${card.id}`;
  const byAgent = card.created_by === "agent";

  // The whole card is a target for a mouse; the name button is the one
  // keyboards and screen readers use, and it keeps focus so the drawer can
  // hand it back.
  const onCardClick = (e) => {
    if (e.target.closest("button, a, input, select, textarea")) return;
    nameRef.current?.focus({ preventScroll: true });
    onOpen(card);
  };

  // A due card wears an amber band across its top (amber means behind).
  const PAD = 11;
  const padTop = marker ? 10 : PAD;
  return (
    <li data-card-id={card.id} className={CARD_CLASS} draggable={draggable && !busy ? "true" : undefined}
      onClick={onCardClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", card.id); } catch { /* some browsers refuse; the page tracks the drag itself */ }
        onDragStart?.(card);
      }}
      onDragEnd={() => onDragEnd?.()}
      style={{ listStyle: "none", background: WHITE, border: `1px solid ${marker ? "#f3d9a6" : BORDER}`, borderRadius: RADIUS.control,
        padding: 0, boxSizing: "border-box", minWidth: 0, cursor: "pointer",
        opacity: dragging ? 0.4 : busy ? 0.72 : 1, ...style }}>
      {marker && (
        <div id={`${metaId}-due`} style={{ position: "relative", margin: "-1px -1px 0", padding: "6px 11px 8px",
          borderRadius: `${RADIUS.control - 1}px ${RADIUS.control - 1}px 0 0`, background: AMBER_BG, color: AMBER_TEXT,
          display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800 }}>
          <PixelStamp kind="clock" size={16} />
          {marker}
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2,
            background: "linear-gradient(90deg, #e2b060 50%, transparent 50%) left top / 4px 2px repeat-x" }} />
        </div>
      )}
      <div style={{ padding: `${padTop}px ${PAD}px 10px` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <button ref={nameRef} type="button" className={FOCUS_CLASS} onClick={() => onOpen(card)}
            aria-describedby={`${marker ? `${metaId}-due ` : ""}${metaId} ${metaId}-by`}
            style={{ display: "block", flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0,
              margin: 0, cursor: "pointer", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 700, color: TEXT,
              lineHeight: 1.3, overflowWrap: "anywhere", borderRadius: 4 }}>
            {card.name}
          </button>
          {byAgent && onDetails && (
            // 44px to the touch, but it reaches into the card's padding so the
            // name line keeps its height.
            <button type="button" className={FOCUS_CLASS} onClick={() => onDetails(card)} aria-haspopup="dialog"
              aria-label={`Details for ${card.name}: notes, follow-up date, delete`} title="Notes, follow-up date, delete"
              style={{ flexShrink: 0, width: 44, height: 44, margin: `-${padTop}px -9px -${padTop}px 0`, padding: 0, display: "inline-flex",
                alignItems: "center", justifyContent: "center", border: "none", borderRadius: 10, background: "none",
                color: TEXT_MID, cursor: "pointer" }}>
              <MoreDots />
            </button>
          )}
        </div>
        <div id={metaId}>
          {card.organization && (
            <p style={{ margin: "3px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED,
              lineHeight: 1.4, overflowWrap: "anywhere" }}>
              {card.organization}
            </p>
          )}
          {line && (
            <p style={{ margin: "7px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID,
              lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
              {line}
            </p>
          )}
        </div>
      </div>
      {/* The tear line above the footer. */}
      <div aria-hidden="true" style={{ height: 2, margin: `0 ${PAD}px`,
        background: "linear-gradient(90deg, #d6d1c9 50%, transparent 50%) left top / 4px 2px repeat-x" }} />
      <div style={{ padding: "8px 11px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, flexWrap: "wrap" }}>
        <Tag agent={byAgent} id={`${metaId}-by`} />
        <BoardMoveMenu card={card} stages={stages} disabled={busy} canUp={canUp} canDown={canDown}
          onMove={(stage) => onMove(card, stage)} onReorder={(dir) => onReorder(card, dir)} />
      </div>
    </li>
  );
}
