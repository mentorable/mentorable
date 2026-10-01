import { useRef } from "react";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE,
} from "../agentUi.js";
import { CARD_CLASS, SKEL_CLASS, SR_ONLY } from "../outreach/BoardUi.js";
import {
  ACTIVE_STATUSES, KIND_LABELS, TIMELINE_LABELS, daysLeft, deadlineDay, deadlineLabel, deadlineShort, isSoon, isStale,
  moneyLine, outcomeLabel,
} from "../../../lib/finder.js";
import { plural } from "./finderUi.js";
import StatusChip from "./StatusChip.jsx";

// Talon's deadline timeline: everything the student kept, listed under the
// month its deadline falls in, so the board reads in the order applications
// are really worked. Each find is a compact row (the date, the name and who
// runs it, where it stands as a chip, the money, the days left); the full
// listing card's facts are all in the drawer the row opens. Finds with no set
// date come after the months; ones whose deadline has passed, and finished
// ones, fold away at the end; dismissed ones show last when asked for.
//
// Amber means a saved or started find is due within SOON_DAYS, never red.

const AMBER_LINE = "#f3d9a6";   // the listing card's "soon" border
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ACTIVE = new Set(ACTIVE_STATUSES);

// The row's layout: the date tile, the name, the chip and money on the right
// with the days left under them; in a narrow column (a phone, or a tablet
// beside the sidebar) everything stacks beside the date. Container queries
// where they work, the viewport where they don't.
const ROW_CLASS = "tf-row";
const NARROW = `
  .${ROW_CLASS} { grid-template-columns: 56px minmax(0, 1fr); grid-template-areas: "date main" "date meta" "date left";
    align-items: start; }
  .${ROW_CLASS} > .tf-meta, .${ROW_CLASS} > .tf-left { justify-self: start; justify-content: flex-start; text-align: left; }
  .${ROW_CLASS} .tf-money { text-align: left; }
`;
const TIMELINE_CSS = `
.tf-tl { container-type: inline-size; container-name: tf-tl; }
.${ROW_CLASS} { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto;
  grid-template-areas: "date main meta" "date main left"; column-gap: 14px; row-gap: 2px; align-items: center; }
.${ROW_CLASS} > .tf-date { grid-area: date; }
.${ROW_CLASS} > .tf-main { grid-area: main; }
.${ROW_CLASS} > .tf-meta { grid-area: meta; justify-self: end; justify-content: flex-end; }
.${ROW_CLASS} > .tf-left { grid-area: left; justify-self: end; text-align: right; }
.${ROW_CLASS} .tf-money { text-align: right; }
@media (max-width: 560px) { ${NARROW} }
@container tf-tl (max-width: 560px) { ${NARROW} }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-finder-timeline]")) {
  const el = document.createElement("style");
  el.dataset.finderTimeline = "";
  el.textContent = TIMELINE_CSS;
  document.head.appendChild(el);
}

function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0, transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

const small = { fontFamily: SANS, fontSize: "0.9rem", lineHeight: 1.4, overflowWrap: "anywhere" };

/** One kept find. The name is the row's button (it opens the drawer); a
 *  click anywhere else on the row does the same for a mouse. */
function TimelineRow({ item, today, onOpen, onMove }) {
  const titleRef = useRef(null);
  const day = deadlineDay(item);
  const working = ACTIVE.has(item.status);
  // Amber only where the student still has to act (the due-soon nudge's rule):
  // an applied find is already sent.
  const urgent = (item.status === "saved" || item.status === "applying") && isSoon(item, today);
  const stale = isStale(item, today);
  const left = daysLeft(item, today);
  const over = !working || (left !== null && left < 0);   // finished, set aside, or closed: a quieter tile
  const money = moneyLine(item);
  const sub = [KIND_LABELS[item.kind] || KIND_LABELS.other, item.provider].filter(Boolean).join(", ");
  const result = item.status === "done" ? outcomeLabel(item.lane, item.outcome) : "";
  const when = deadlineShort(item, today);
  const fullWhen = deadlineLabel(item, today);

  const tile = urgent ? { background: AMBER_BG, color: AMBER_TEXT, border: `1px solid ${AMBER_LINE}` }
    : { background: SURFACE, color: over ? TEXT_MUTED : TEXT_MID, border: `1px solid ${BORDER}` };

  const onRowClick = (e) => {
    // React bubbles a click through portals, so one inside the status chip's
    // menu (portalled to <body>) arrives here too: only the row's own DOM counts.
    if (!e.currentTarget.contains(e.target)) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    titleRef.current?.focus({ preventScroll: true });
    onOpen(item);
  };

  return (
    <div className={`${ROW_CLASS} ${CARD_CLASS}`} onClick={onRowClick}
      style={{ background: WHITE, border: `1px solid ${urgent || stale ? AMBER_LINE : BORDER}`, borderRadius: 14,
        padding: "10px 14px 10px 10px", boxSizing: "border-box", minWidth: 0, cursor: "pointer" }}>
      <span className="tf-date" aria-hidden="true"
        style={{ height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          borderRadius: 10, boxSizing: "border-box", fontFamily: SANS, ...tile }}>
        {day ? (
          <>
            <span style={{ fontSize: "0.9rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
              lineHeight: 1.2 }}>
              {MON[day.getMonth()]}
            </span>
            <span style={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {day.getDate()}
            </span>
          </>
        ) : (
          <PixelStamp kind={item.deadline_kind === "rolling" ? "clock" : "question"} size={16} />
        )}
      </span>

      <div className="tf-main" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
        <button ref={titleRef} type="button" className={FOCUS_CLASS} data-title-for={item.id} aria-haspopup="dialog"
          onClick={() => onOpen(item)}
          style={{ padding: 0, margin: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer",
            borderRadius: 4, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
            overflowWrap: "anywhere", maxWidth: "100%" }}>
          {item.title}
        </button>
        {sub && <span style={{ ...small, marginTop: 2, fontWeight: 500, color: TEXT_MUTED }}>{sub}</span>}
        {stale && (
          <span style={{ ...small, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            color: AMBER_TEXT }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="clock" size={16} /></span>
            <span>Last checked over two weeks ago. Recheck it before you apply.</span>
          </span>
        )}
        {!item.verified && (
          <span style={{ ...small, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            color: TEXT_MID }}>
            <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="question" size={16} /></span>
            <span>Unconfirmed: check the provider</span>
          </span>
        )}
      </div>

      <div className="tf-meta" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 12px",
        minWidth: 0 }}>
        <StatusChip item={item} onMove={onMove} />
        {money && (
          <span className="tf-money" style={{ ...small, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID,
            maxWidth: "15rem" }}>
            {money}
          </span>
        )}
      </div>

      <span className="tf-left" style={{ ...small, maxWidth: "15rem", fontWeight: result ? 800 : 700,
        color: urgent ? AMBER_TEXT : result ? TEXT : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
        {result ? (
          <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 6 }}>
            {/* A star for a win only: a check beside "Not this time" would read as a yes. */}
            {item.outcome === "yes" && (
              <span aria-hidden="true" style={{ display: "flex", marginTop: 2 }}><PixelStamp kind="star" size={16} /></span>
            )}
            <span>{result}</span>
          </span>
        ) : when === fullWhen ? when : (
          <>
            <span aria-hidden="true">{when}</span>
            <span style={SR_ONLY}>{fullWhen}</span>
          </>
        )}
      </span>
    </div>
  );
}

const groupHeading = {
  margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, letterSpacing: "0.04em",
  textTransform: "uppercase", color: TEXT_MUTED, lineHeight: 1.3,
};
const hintStyle = { margin: "2px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500, color: TEXT_MUTED,
  lineHeight: 1.5 };

function Rows({ items, today, onOpen, onMove }) {
  return (
    <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
      {items.map((item) => (
        <li key={item.id} style={{ minWidth: 0 }}>
          <TimelineRow item={item} today={today} onOpen={onOpen} onMove={onMove} />
        </li>
      ))}
    </ul>
  );
}

/** A heading and its rows: a month, "No set date", or the dismissed ones. */
function Group({ id, title, hint, children }) {
  return (
    <section aria-labelledby={id} style={{ marginTop: 20 }}>
      <h3 id={id} style={groupHeading}>{title}</h3>
      {hint && <p style={hintStyle}>{hint}</p>}
      {children}
    </section>
  );
}

/** A group that folds away (Closed, Done): a disclosure button in its heading. */
function Fold({ id, title, count, hint, open, onToggle, children }) {
  return (
    <section aria-labelledby={`${id}-h`} style={{ marginTop: 20 }}>
      <h3 id={`${id}-h`} style={{ margin: 0 }}>
        <button type="button" className={FOCUS_CLASS} aria-expanded={open} aria-controls={`${id}-list`} onClick={onToggle}
          style={{ minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8,
            borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID,
            fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, cursor: "pointer" }}>
          <Chevron up={open} />
          {title}
          <span aria-hidden="true" style={{ fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
          <span style={SR_ONLY}>, {plural(count, "find")}</span>
        </button>
      </h3>
      <div id={`${id}-list`} hidden={!open}>
        {/* Rendered only while open, so nothing hidden can be given focus. */}
        {open && (
          <>
            {hint && <p style={{ ...hintStyle, marginTop: 8 }}>{hint}</p>}
            {children}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * groups: groupByDeadline's { months, undated, closed, done, dismissed }.
 * open: { closed, done }, which folds are open; onToggle(key) flips one.
 * showDismissed: the dismissed group shows at the end. headingRef: the
 * timeline's heading, which takes focus when a moved row leaves nothing near.
 * emptyText: what to say when nothing has been kept. onOpen(item): the
 * drawer. onMove(item, status): the status chip's choice.
 */
export default function DeadlineTimeline({
  groups, today, open, onToggle, showDismissed, headingRef, emptyText, onOpen, onMove,
}) {
  const { months, undated, closed, done, dismissed } = groups;
  const upcoming = months.length + undated.length;
  const kept = upcoming + closed.length + done.length;
  const rows = { today, onOpen, onMove };

  return (
    <section aria-labelledby="tf-tl-title" className="tf-tl" style={{ maxWidth: 900, minWidth: 0 }}>
      <h2 id="tf-tl-title" ref={headingRef} tabIndex={-1}
        style={{ margin: 0, fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
          outline: "none" }}>
        Your timeline
      </h2>
      <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 500, color: TEXT_MID,
        lineHeight: 1.5 }}>
        Everything you kept, under the month it's due.
      </p>

      {kept === 0 && (
        <p style={{ margin: "14px 0 0", padding: "16px", background: WHITE, border: `1px dashed ${BORDER}`,
          borderRadius: RADIUS.card, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED,
          lineHeight: 1.5 }}>
          {emptyText}
        </p>
      )}
      {kept > 0 && upcoming === 0 && (
        <p style={{ ...hintStyle, marginTop: 14, fontSize: "1rem", fontWeight: 600 }}>
          Nothing coming up right now.
        </p>
      )}

      {months.map((m) => (
        <Group key={m.key} id={`tf-m-${m.key}`} title={m.label}>
          <Rows items={m.items} {...rows} />
        </Group>
      ))}
      {undated.length > 0 && (
        <Group id="tf-g-undated" title={TIMELINE_LABELS.undated}
          hint="Rolling, or its page didn't give a date. Check each page so none slips by.">
          <Rows items={undated} {...rows} />
        </Group>
      )}
      {closed.length > 0 && (
        <Fold id="tf-g-closed" title={TIMELINE_LABELS.closed} count={closed.length} open={!!open.closed}
          onToggle={() => onToggle("closed")}
          hint="Their deadlines have passed. Move one to Done once you hear back, or dismiss it.">
          <Rows items={closed} {...rows} />
        </Fold>
      )}
      {done.length > 0 && (
        <Fold id="tf-g-done" title="Done" count={done.length} open={!!open.done} onToggle={() => onToggle("done")}>
          <Rows items={done} {...rows} />
        </Fold>
      )}
      {showDismissed && (
        <Group id="tf-g-dismissed" title={`Dismissed ${dismissed.length}`}
          hint={dismissed.length ? "Talon won't bring these back in a later find. Change one's status to keep it." : null}>
          {dismissed.length ? <Rows items={dismissed} {...rows} /> : (
            <p style={{ ...hintStyle, marginTop: 6 }}>Nothing dismissed. Dismissed finds never come back in a later find.</p>
          )}
        </Group>
      )}
    </section>
  );
}

function Bar({ w, h = 14, style }) {
  return <div className={SKEL_CLASS} style={{ width: w, height: h, borderRadius: 7, ...style }} />;
}

/** The board's shape while it loads: the tray, then a few rows. Decorative;
 *  the page tells screen readers it is loading. The shimmer stops under
 *  reduced motion (BoardUi's CSS). */
export function TimelineSkeleton() {
  const row = (k) => (
    <div key={k} style={{ display: "flex", gap: 14, alignItems: "center", background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: 14, padding: "10px 14px 10px 10px" }}>
      <Bar w={56} h={56} style={{ flexShrink: 0, borderRadius: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Bar w="60%" h={16} />
        <Bar w="40%" style={{ marginTop: 8 }} />
      </div>
    </div>
  );
  return (
    <div aria-hidden="true">
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "12px 14px",
        marginBottom: 30, maxWidth: 900, boxSizing: "border-box" }}>
        <Bar w={180} h={18} />
        <div style={{ marginTop: 12 }}>
          {[0, 1].map((k) => (
            <div key={k} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
              gap: "8px 14px", padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                <Bar w="60%" h={16} />
                <Bar w="75%" style={{ marginTop: 8 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Bar w={72} h={44} style={{ borderRadius: RADIUS.control }} />
                <Bar w={92} h={44} style={{ borderRadius: RADIUS.control }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 900 }}>
        <Bar w={140} h={18} />
        <Bar w={90} style={{ margin: "22px 0 10px" }} />
        <div style={{ display: "grid", gap: 8 }}>{[0, 1, 2].map(row)}</div>
      </div>
    </div>
  );
}
