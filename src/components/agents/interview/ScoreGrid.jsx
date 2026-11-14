import { useId } from "react";
import { POISE_LINES } from "../../../lib/agents/registry.js";
import { RUBRIC } from "../../../lib/interview.js";
import { Card } from "../../ui/kit.jsx";
import { BORDER, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../../ui/tokens.js";
import { PoiseLine } from "./MarshScene.jsx";
import { scoreOf } from "./interviewUi.js";

// The four practice scores: Specific examples, Clear structure, Knows why and
// Conversation, in that order, each as "3 of 5" in words with the reason
// beside it. The row of five squares under the number is extra: filled
// squares and empty ones, so even the meter does not rest on colour.
//
// These are a model's read of one practice, not a prediction. The heading and
// the line under it say so. When the answers were too short to score
// (`scores` is null), the grid gives way to Poise's line about that.

const hintFor = (hint, mode) => (typeof hint === "string" ? hint : hint?.[mode] || hint?.college || "");

function Meter({ score }) {
  const ink = useAgentInk();
  return (
    <span aria-hidden="true" style={{ display: "flex", gap: 4, marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: 14, height: 14, boxSizing: "border-box", borderRadius: 2,
          background: n <= score ? ink.button.bg : WHITE, border: `2px solid ${n <= score ? ink.button.bg : "#8a857c"}` }} />
      ))}
    </span>
  );
}

/** scores: { examples: { score, reason }, ... } or null. mode: "college" | "internship". */
export default function ScoreGrid({ scores, mode = "college" }) {
  const uid = useId();
  const rows = RUBRIC.map((r) => ({ ...r, s: scoreOf(scores, r.key) }));
  const all = rows.every((r) => r.s);

  return (
    <section aria-labelledby={`${uid}-h`} style={{ minWidth: 0 }}>
      <h2 id={`${uid}-h`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        Practice scores
      </h2>
      {all ? (
        <>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
            Each from 1 to 5, for this one practice. A read of how you answered, not a prediction.
          </p>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))" }}>
            {rows.map((r) => (
              <Card as="li" key={r.key} style={{ display: "flex", flexDirection: "column", borderRadius: RADIUS.card }}>
                <h3 style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>
                  {r.label}
                </h3>
                <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED,
                  lineHeight: 1.45 }}>
                  {hintFor(r.hint, mode)}
                </p>
                <p style={{ margin: "10px 0 0", fontFamily: SANS, color: TEXT, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "1.6rem", fontWeight: 800 }}>{r.s.score}</span>
                  <span style={{ fontSize: "1rem", fontWeight: 700, color: TEXT_MID }}> of 5</span>
                </p>
                <Meter score={r.s.score} />
                {r.s.reason && (
                  <p style={{ margin: "10px 0 0", paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontFamily: SANS,
                    fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                    {r.s.reason}
                  </p>
                )}
              </Card>
            ))}
          </ul>
        </>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <PoiseLine style={{ fontWeight: 600, color: TEXT }}>{POISE_LINES?.thinNote}</PoiseLine>
        </Card>
      )}
    </section>
  );
}
