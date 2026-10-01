import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../agentUi.js";
import { Button, Card, Notice } from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import { BUDGET, CHIPS, CITIZENSHIP, EFFORT, TRAVEL, WHEN } from "../../../lib/finder.js";
import { TALON, blockCopy, laneLabel } from "./finderUi.js";

// Step 3: what Talon assumed, before anything is spent. A plain summary of
// the search it will run, each line with an Edit link back to the field,
// what it costs, the safety line, and Start search.

const labelOf = (list, key) => list.find((o) => o.key === key)?.label || "";

/**
 * brief: the flow's brief. finds: { left, limit } from status, or null.
 * block: findsBlock's reason, or null. busy: the search is starting.
 * error: a refusal from the last try, or null; errorAction: a button under it.
 * onEdit(field): back to the field ("lane" goes to step 1).
 */
export default function CheckStep({ brief, finds, block, busy, error, errorAction, onEdit, onStart, onBoard }) {
  const ink = useAgentInk();
  const activity = brief.lane === "activity";
  const chips = brief.chips.map((k) => CHIPS.find((c) => c.key === k)?.label).filter(Boolean);
  const stop = blockCopy(block);

  const rows = [
    { field: "lane", label: "Looking for", value: laneLabel(brief.lane) },
    { field: "want", label: "What you want", value: `"${brief.want.trim()}"` },
    { field: "interests", label: "Interests", value: brief.interests.join(", ") || "None added" },
    { field: "grade", label: "Grade", value: brief.grade ? `${brief.grade}th grade` : "Not given" },
    { field: "state", label: "State", value: brief.state.trim() || "Not given" },
    ...(activity ? [
      { field: "budget", label: "Budget", value: labelOf(BUDGET, brief.budget) },
      { field: "travel", label: "Where", value: labelOf(TRAVEL, brief.travel) },
      { field: "when", label: "When", value: labelOf(WHEN, brief.when) },
    ] : [
      { field: "effort", label: "Writing", value: labelOf(EFFORT, brief.effort) },
    ]),
    { field: "citizenship", label: "Citizenship", value: labelOf(CITIZENSHIP, brief.citizenship) || "Not given" },
    { field: "chips", label: "Also open to", value: chips.join(", ") || "Nothing picked" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <MascotSays agent={TALON} state="thinking" size={80} layout="auto">{TALON_LINES.checkAsk}</MascotSays>

      <Card style={{ padding: "6px 8px 6px 16px" }}>
        <dl style={{ margin: 0 }}>
          {rows.map((r, i) => (
            <div key={r.field} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 12px",
              padding: "8px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
              <dt style={{ flex: "0 0 132px", fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED }}>
                {r.label}
              </dt>
              <dd style={{ flex: "1 1 200px", minWidth: 0, margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600,
                color: TEXT, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                {r.value}
              </dd>
              <Button kind="quiet" onClick={() => onEdit(r.field)} aria-label={`Edit ${r.label.toLowerCase()}`}
                disabled={busy} style={{ marginLeft: "auto", padding: "8px 12px" }}>
                Edit
              </Button>
            </div>
          ))}
        </dl>
      </Card>

      <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.55 }}>
        Talon searches the web with words built from this. Your citizenship and anything under "Also open to" shape the
        search but are never saved, and your name and school are never part of it.
      </p>

      <section aria-labelledby="tf-safety-title" style={{ background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: RADIUS.control, padding: "12px 14px", fontFamily: SANS }}>
        <h3 id="tf-safety-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.02rem",
          fontWeight: 800, color: TEXT }}>
          <span aria-hidden="true" style={{ color: ink.text, display: "flex" }}><PixelStamp kind="check" size={16} /></span>
          Staying safe
        </h3>
        <p style={{ margin: "6px 0 0", fontSize: "0.98rem", color: TEXT_MID, lineHeight: 1.55 }}>{TALON_LINES.safety}</p>
      </section>

      {error && <Notice tone="error" action={errorAction}>{error}</Notice>}
      {stop && (
        <Notice tone="warn" action={onBoard ? <Button kind="secondary" onClick={onBoard}>Back to your board</Button> : null}>
          <strong style={{ display: "block", fontWeight: 800 }}>{stop.title}</strong>
          {stop.line}
        </Notice>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Button kind="primary" onClick={onStart} busy={busy} disabled={!!stop} style={{ minWidth: 180 }}>
          Start search
          {!busy && <PixelArrow size={16} />}
        </Button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "0.95rem",
          fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          <span aria-hidden="true" style={{ color: ink.text, display: "flex" }}>
            <PixelStamp kind="sparkle" size={16} />
          </span>
          {finds
            ? `This uses 1 of your ${finds.limit} finds (${finds.left} left).`
            : "This uses 1 of your finds."}
        </span>
      </div>
    </div>
  );
}
