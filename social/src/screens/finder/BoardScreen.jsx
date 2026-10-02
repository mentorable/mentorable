import {
  BG, BORDER, RADIUS, SANS, SURFACE, TALON_LINES, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useInk,
} from "../../brand/brand.js";
import { ActionButton, MascotSays, NEUTRAL_TAG, PixelArrow, PixelStamp, Viewport } from "./parts.jsx";
import { KIND_LABELS, LANES, deadlineLabel, deadlineShort, monthLabel, monthShort } from "./data.js";

// Talon's board, rebuilt from src/pages/FinderBoardPage.jsx and its parts
// (LaneFilter, SortingTray, DeadlineTimeline, StatusChip) as a phone shows
// it: the header, Talon's hello, "Find opportunities" and what is left, the
// lane filter, the tray of new finds, and the deadline timeline.
//
// What lands from a find waits in the tray ("New finds to sort") with Save
// and Dismiss; only a Save moves one down to the timeline, under the month
// it's due (a row stacks beside its date tile on a phone, the timeline's
// NARROW layout). So `items` carry their status: "new" sits in the tray,
// "saved" on the timeline. The tray shows the first two on a phone
// (TRAY_SHOW_PHONE), the rest behind "Show all".
//
// Split at the tray (see Viewport): `anchorY` is where the tray's top sits.

const LH = 1.5;
const small = { fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.4, overflowWrap: "anywhere" };

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" shapeRendering="crispEdges" style={{ flexShrink: 0 }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

const STATUS_LABELS = { saved: "Saved", applying: "Applying", applied: "Applied" };

/** StatusChip, closed: where a kept find stands. The 44px hit area is the
 *  app's; the chip drawn inside it stays small. */
function StatusChip({ label }) {
  return (
    <span style={{ flexShrink: 0, minHeight: 44, padding: "0 2px", margin: "0 -2px", display: "inline-flex",
      alignItems: "center", boxSizing: "border-box" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px 3px 11px",
        borderRadius: RADIUS.pill, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, whiteSpace: "nowrap",
        background: NEUTRAL_TAG, color: TEXT_MID, border: `1px solid ${NEUTRAL_TAG}` }}>
        {label}
        <Chevron />
      </span>
    </span>
  );
}

/** One kept find on the timeline (DeadlineTimeline.jsx TimelineRow, narrow). */
export function TimelineRow({ item, pressed = false }) {
  const tile = { background: SURFACE, color: TEXT_MID, border: `1px solid ${BORDER}` };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)",
      gridTemplateAreas: '"date main" "date meta" "date left"', columnGap: 14, rowGap: 2, alignItems: "start",
      background: pressed ? "#fbfaf8" : WHITE, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: "10px 14px 10px 10px", boxSizing: "border-box", minWidth: 0 }}>
      <span style={{ gridArea: "date", height: 56, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", borderRadius: 10, boxSizing: "border-box", fontFamily: SANS, ...tile }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.2 }}>
          {monthShort(item.deadline)}
        </span>
        <span style={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
          {item.deadline.day}
        </span>
      </span>
      <div style={{ gridArea: "main", display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
        <span style={{ fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {item.title}
        </span>
        <span style={{ ...small, marginTop: 2, fontWeight: 500, color: TEXT_MUTED }}>Scholarship, {item.provider}</span>
        {!item.verified && (
          <span style={{ ...small, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            color: TEXT_MID }}>
            <span style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="question" size={16} /></span>
            <span>Unconfirmed: check the provider</span>
          </span>
        )}
      </div>
      <div style={{ gridArea: "meta", justifySelf: "start", display: "flex", flexWrap: "wrap", alignItems: "center",
        gap: "0 12px", minWidth: 0 }}>
        <StatusChip label={STATUS_LABELS[item.status] || "Saved"} />
        <span style={{ ...small, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID, maxWidth: "15rem" }}>{item.amount_text}</span>
      </div>
      <span style={{ gridArea: "left", justifySelf: "start", ...small, maxWidth: "15rem", fontWeight: 700, color: TEXT_MUTED,
        fontVariantNumeric: "tabular-nums" }}>
        {deadlineShort(item)}
      </span>
    </div>
  );
}

const groupHeading = {
  margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, letterSpacing: "0.04em",
  textTransform: "uppercase", color: TEXT_MUTED, lineHeight: 1.3,
};

/** The board above the tray: header, hello, finds left, the filter. */
function BoardTop({ items, finds, mascotOffset }) {
  const ink = useInk();
  const live = items.filter((i) => i.status !== "dismissed").length;
  const counts = { all: live, scholarship: live, activity: 0 };
  const options = [{ key: "all", label: "All" }, ...LANES.map((l) => ({ key: l.key, label: l.label }))];
  return (
    <div style={{ paddingTop: 20, lineHeight: LH }}>
      <div>
        <span style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, margin: "0 0 4px -8px",
          padding: "0 8px", borderRadius: 10, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED }}>
          <PixelArrow size={16} style={{ transform: "scaleX(-1)" }} />
          Agents
        </span>
      </div>
      <h1 style={{ fontWeight: 800, fontSize: "2.1rem", color: ink.title, letterSpacing: "-0.03em", margin: "0 0 1rem",
        lineHeight: 1.1 }}>
        Opportunities
      </h1>
      <MascotSays state="idle" size={72} offset={mascotOffset}>{TALON_LINES.boardHello}</MascotSays>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px", margin: "18px 0 22px" }}>
        <span style={{ minHeight: 48, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 9,
          borderRadius: RADIUS.control, background: ink.button.bg, color: ink.button.fg, fontSize: "1.05rem", fontWeight: 800,
          boxSizing: "border-box" }}>
          <PixelStamp kind="sparkle" size={16} />
          Find opportunities
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.95rem", fontWeight: 700,
          color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          {TALON_LINES.findsLeft(finds.left, finds.limit)}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10,
        paddingBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((o) => {
            const on = o.key === "all";
            return (
              <span key={o.key} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 14px",
                borderRadius: RADIUS.pill, boxSizing: "border-box", fontSize: "0.95rem", fontWeight: 700, whiteSpace: "nowrap",
                border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
                color: on ? ink.onSoft : TEXT_MID }}>
                {o.label}
                <span style={{ fontWeight: 800, color: on ? ink.onSoft : TEXT, fontVariantNumeric: "tabular-nums" }}>
                  {counts[o.key]}
                </span>
              </span>
            );
          })}
        </div>
        <span style={{ minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 10,
          borderRadius: RADIUS.pill, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID, boxSizing: "border-box",
          fontSize: "0.95rem", fontWeight: 700, whiteSpace: "nowrap" }}>
          <span style={{ position: "relative", width: 30, height: 18, borderRadius: 99, flexShrink: 0, background: "#8a857c" }}>
            <span style={{ position: "absolute", top: 3, left: 3, width: 12, height: 12, borderRadius: 99, background: WHITE }} />
          </span>
          Show dismissed
          <span style={{ fontWeight: 800, color: TEXT, fontVariantNumeric: "tabular-nums" }}>0</span>
        </span>
      </div>

    </div>
  );
}

/** One new find in the tray (SortingTray.jsx TrayRow): its name (the button
 *  that opens the drawer), who runs it, the deadline and the money, then
 *  Save and Dismiss, which wrap under the text in a phone's narrow column.
 *  `pressed`: the name is under a finger (Safari's grey tap highlight, which
 *  the app leaves on). */
function TrayRow({ item, pressed = false }) {
  const sub = [KIND_LABELS[item.kind] || KIND_LABELS.other, item.provider].filter(Boolean).join(", ");
  return (
    <li style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
      gap: "8px 14px", padding: "10px 0", borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <div style={{ flex: "1 1 16rem", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ borderRadius: 4, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
          overflowWrap: "anywhere", maxWidth: "100%", background: pressed ? "rgba(20,20,19,0.14)" : "transparent",
          boxShadow: pressed ? "0 0 0 3px rgba(20,20,19,0.14)" : "none" }}>
          {item.title}
        </span>
        <span style={{ ...small, marginTop: 2, fontWeight: 500, color: TEXT_MUTED }}>{sub}</span>
        <span style={{ ...small, marginTop: 2, fontWeight: 600, color: TEXT_MID, fontVariantNumeric: "tabular-nums" }}>
          {deadlineLabel(item)}
          {item.amount_text && `. ${item.amount_text}`}
        </span>
        {!item.verified && (
          <span style={{ ...small, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            color: TEXT_MID }}>
            <span style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="question" size={16} /></span>
            <span>Unconfirmed: check the provider</span>
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionButton primary>Save</ActionButton>
        <ActionButton>Dismiss</ActionButton>
      </div>
    </li>
  );
}

/** SortingTray.jsx: the new finds waiting to be saved or dismissed. */
function SortingTray({ items, limit, pressedId }) {
  const ink = useInk();
  const shown = items.slice(0, limit);
  return (
    <section style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "12px 14px 14px",
      marginBottom: 30, boxSizing: "border-box", minWidth: 0 }}>
      <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.15rem", fontWeight: 800,
        color: TEXT, lineHeight: 1.3 }}>
        <span style={{ display: "flex", color: ink.text }}><PixelStamp kind="sparkle" size={16} /></span>
        New finds to sort
        <span style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          Nothing new to sort. When Talon finds more, they wait here first.
        </p>
      ) : (
        <>
          <p style={{ margin: "4px 0 10px", fontSize: "0.98rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.5 }}>
            Save the ones worth a closer look and they move to your timeline, under the month they're due.
            Dismissed ones won't come back.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shown.map((item) => <TrayRow key={item.id} item={item} pressed={pressedId === item.id} />)}
          </ul>
          {items.length > limit && (
            <span style={{ marginTop: 4, minHeight: 44, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 8,
              borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID,
              fontSize: "0.95rem", fontWeight: 800, boxSizing: "border-box" }}>
              <Chevron />
              {`Show all ${items.length}`}
            </span>
          )}
        </>
      )}
    </section>
  );
}

/** DeadlineTimeline.jsx: what the student kept, under the month it's due,
 *  soonest first; before anything is kept, its dashed empty line. */
function Timeline({ items, pressedId }) {
  const kept = items
    .filter((i) => i.status === "saved" || i.status === "applying" || i.status === "applied")
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const months = [];
  for (const item of kept) {
    const key = `${item.deadline.year}-${item.deadline.month}`;
    let m = months.find((g) => g.key === key);
    if (!m) { m = { key, label: monthLabel(item.deadline), items: [] }; months.push(m); }
    m.items.push(item);
  }
  return (
    <section style={{ minWidth: 0, lineHeight: LH }}>
      <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>Your timeline</h2>
      <p style={{ margin: "4px 0 0", fontSize: "0.98rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.5 }}>
        Everything you kept, under the month it's due.
      </p>
      {kept.length === 0 && (
        <p style={{ margin: "14px 0 0", padding: 16, background: WHITE, border: `1px dashed ${BORDER}`,
          borderRadius: RADIUS.card, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          Nothing saved yet. Save a find from the tray and it shows up here, under the month it's due.
        </p>
      )}
      {months.map((m) => (
        <section key={m.key} style={{ marginTop: 20 }}>
          <h3 style={groupHeading}>{m.label}</h3>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
            {m.items.map((item) => (
              <li key={item.id} style={{ minWidth: 0 }}><TimelineRow item={item} pressed={pressedId === item.id} /></li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

/**
 * items: every find on the board (finder_items shape, in board order), each
 * with its status: "new" in the tray, "saved" on the timeline. pressedId: a
 * find whose name is under a finger. finds: { left, limit }. trayLimit: how
 * many new finds show before "Show all" (2 on a phone). anchorY: where the
 * tray's top sits. overlay: drawn over the page (the drawer).
 */
export function BoardScreen({ items, pressedId = null, finds = { left: 3, limit: 4 }, trayLimit = 2, anchorY = 0,
  overlay, mascotOffset = 0 }) {
  const above = <BoardTop items={items} finds={finds} mascotOffset={mascotOffset} />;
  const below = (
    <div style={{ lineHeight: LH }}>
      <SortingTray items={items.filter((i) => i.status === "new")} limit={trayLimit} pressedId={pressedId} />
      <Timeline items={items} pressedId={pressedId} />
    </div>
  );
  return <Viewport anchorY={anchorY} above={above} below={below} overlay={overlay} bg={BG} />;
}
