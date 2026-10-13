import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { AMBER_BG, AMBER_TEXT, RADIUS, SANS, TEXT, TEXT_MUTED, useAgentInk } from "../../../ui/tokens.js";
import { plural } from "./editorUi.js";

// The live word count under the essay: the count, the limit, and where the
// draft stands against it. The page counts with countWords (src/lib/essay.js),
// the same rule the backend uses, on every keystroke.
//
// Over the limit is amber with the number over, never red, and it never stops
// anyone typing. Under a personal statement's minimum it only names the
// minimum: what goes in is the student's to decide.
//
// The sentence for screen readers lives in the element with `id`, which the
// textarea points to (aria-describedby), so it is read on arriving in the
// text and not on every keystroke; the page says it once more when the draft
// crosses the limit.

const TRACK = "#e9e6e1";

/**
 * words: the live count. bounds: { min, max } from wordBounds. state: from
 * lengthState ("empty" | "under" | "ok" | "over"). compact: no bar (a phone).
 */
export function WordBar({ words, bounds, state, width = 112 }) {
  const ink = useAgentInk();
  const max = Number(bounds?.max) || 0;
  const min = bounds?.min ?? null;
  const over = state === "over";
  const share = max > 0 ? Math.min(1, words / max) : 0;
  if (max <= 0) return null;
  return (
    <span aria-hidden="true" style={{ position: "relative", width, maxWidth: "100%", height: 6, borderRadius: RADIUS.pill,
      background: TRACK, flexShrink: 1 }}>
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${share * 100}%`, borderRadius: RADIUS.pill,
        background: over ? AMBER_TEXT : ink.text }} />
      {/* Where a personal statement's minimum falls along the way. */}
      {min !== null && min < max && (
        <span style={{ position: "absolute", top: -3, bottom: -3, left: `${(min / max) * 100}%`, width: 2,
          background: TEXT_MUTED }} />
      )}
    </span>
  );
}

/** `compact`: no bar. `align`: "end" (the default) or "start". */
export default function WordMeter({ id, words, bounds, state, compact = false, align = "end" }) {
  const ink = useAgentInk();
  const max = Number(bounds?.max) || 0;
  const min = bounds?.min ?? null;
  const over = state === "over" ? Math.max(0, words - max) : 0;
  const short = min !== null && words < min;

  const said = `${plural(words, "word")} of ${max}.`
    + (over ? ` ${over} over the limit.` : short ? ` The minimum is ${min}.` : "");
  const hint = over ? `${over} over` : short ? `minimum ${min}` : "";
  const color = over ? AMBER_TEXT : TEXT_MUTED;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: align === "start" ? "flex-start" : "flex-end", flexWrap: "wrap", gap: "4px 10px",
      minWidth: 0, fontFamily: SANS }}>
      <span id={id} style={SR_ONLY}>{said}</span>
      {!compact && max > 0 && <WordBar words={words} bounds={bounds} state={state} />}
      <span aria-hidden="true" style={{ fontSize: "0.95rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 800, color: over ? AMBER_TEXT : TEXT }}>{words}</span> / {max} words
      </span>
      {hint && (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.9rem",
          fontWeight: 800, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color,
          ...(over ? { background: AMBER_BG, border: "1px solid #f3d9a4", borderRadius: RADIUS.pill, padding: "2px 10px" } : null) }}>
          {over > 0 && <PixelStamp kind="flag" size={16} />}
          {hint}
        </span>
      )}
    </div>
  );
}
