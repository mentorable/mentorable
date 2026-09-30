import { useRef } from "react";
import BoardCard from "./BoardCard.jsx";
import { RADIUS, SANS, TEXT, TEXT_MUTED, useAgentInk } from "../agentUi.js";
import { COLUMN_BG, SR_ONLY, boardRing } from "./BoardUi.js";

// One stage of the board. On desktop it is a well with a heading and a drop
// zone: while a card is dragged every column shows a dashed edge, and the one
// under the pointer fills with the accent and draws a line where the card
// will land. On a phone it is the body of the selected tab, with no dragging.
//
// The landing line takes no space (it hangs in the gap between two cards), so
// showing it never shifts the cards the pointer is measuring against.

const GAP = 8;

function DropLine({ at, color }) {
  return (
    <li aria-hidden="true" style={{ listStyle: "none", height: 0, margin: 0, position: "relative" }}>
      <span style={{ position: "absolute", left: 2, right: 2, top: at === "first" ? -6 : (GAP - 4) / 2, height: 4,
        borderRadius: 2, background: color }} />
    </li>
  );
}

export default function BoardColumn({
  stage, cards, today, stages, mobile = false, headingId,
  dragId = null, dropIndex = null, busyIds,
  onOpen, onDetails, onMove, onReorder, onDragStart, onDragEnd, onDragOverAt, onDropAt, onDragLeaveColumn,
}) {
  const ink = useAgentInk();
  const ring = boardRing(ink.accent);
  const listRef = useRef(null);
  const target = !mobile && dragId !== null && dropIndex !== null;
  const dragging = !mobile && dragId !== null;

  // Where the pointer would drop, counted among the cards other than the one
  // being dragged: past a card's middle means below it.
  const indexFor = (y) => {
    const els = listRef.current ? [...listRef.current.querySelectorAll("[data-card-id]")] : [];
    let i = 0;
    for (const el of els) {
      if (el.dataset.cardId === dragId) continue;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) i += 1;
      else break;
    }
    return i;
  };

  const dropProps = mobile ? {} : {
    onDragOver: (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOverAt(stage.key, indexFor(e.clientY));
    },
    onDrop: (e) => {
      if (!dragId) return;
      e.preventDefault();
      onDropAt(stage.key, indexFor(e.clientY));
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) onDragLeaveColumn(stage.key);
    },
  };

  const n = cards.length;
  let shown = 0;          // cards other than the dragged one, so far
  let lineDrawn = false;
  const rows = [];
  cards.forEach((card, i) => {
    const isDragged = card.id === dragId;
    if (target && !isDragged && !lineDrawn && shown === dropIndex) {
      rows.push(<DropLine key="drop-line" at={rows.length === 0 ? "first" : "between"} color={ring} />);
      lineDrawn = true;
    }
    if (!isDragged) shown += 1;
    rows.push(
      <BoardCard key={card.id} card={card} today={today} stages={stages} draggable={!mobile} dragging={isDragged}
        busy={busyIds?.has(card.id)} canUp={i > 0} canDown={i < n - 1} style={{ marginTop: i === 0 ? 0 : GAP }}
        onOpen={onOpen} onDetails={onDetails} onMove={onMove} onReorder={onReorder} onDragStart={onDragStart}
        onDragEnd={onDragEnd} />,
    );
  });
  if (target && n > 0 && !lineDrawn && shown === dropIndex) {
    rows.push(<DropLine key="drop-line" at="between" color={ring} />);
  }

  const list = n > 0 ? (
    <ul ref={listRef} aria-labelledby={mobile ? undefined : headingId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows}
    </ul>
  ) : (
    <p style={{ margin: 0, padding: "18px 12px", borderRadius: RADIUS.control, textAlign: "center",
      border: `2px dashed ${target ? ring : "#d6d1c9"}`, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600,
      color: TEXT_MUTED }}>
      {dragging ? "Drop a card here" : "Nothing here yet."}
    </p>
  );

  if (mobile) {
    return (
      <div>
        <p style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
          {stage.hint}
        </p>
        {list}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} {...dropProps}
      style={{ background: target ? ink.softer : COLUMN_BG, borderRadius: RADIUS.card, padding: 8, minWidth: 0,
        boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 260,
        outline: dragging ? `2px dashed ${target ? ring : "#cdc8bf"}` : "none", outlineOffset: -2,
        transition: "background 0.12s" }}>
      <div style={{ padding: "4px 4px 0" }}>
        <h3 id={headingId} style={{ margin: 0, display: "flex", alignItems: "baseline", gap: 8, fontFamily: SANS,
          fontSize: "1.05rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
          {stage.label}
          <span aria-hidden="true" style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{n}</span>
          <span style={SR_ONLY}>, {n} {n === 1 ? "card" : "cards"}</span>
        </h3>
        <p style={{ margin: "3px 0 10px", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.45 }}>
          {stage.hint}
        </p>
      </div>
      <div style={{ flex: 1 }}>{list}</div>
    </section>
  );
}
