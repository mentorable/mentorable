import { FOCUS_CLASS } from "../../ui/tokens.js";
import { C, EASE_CSS, SANS, TYPE, useReduce } from "../kit.js";
import { Signpost, TwoTone } from "../frames.jsx";

// The step rows under each story's text (PLAN.md 6.3), shared by every
// option, plus the two text pieces that sit around them in every layout:
// the story's intro (signpost, two-tone heading, body) and its caption.

/**
 * The step rows. Each is a button: a 12px square marker (accent when done
 * or active, stone when ahead), the title (ink when active), and the
 * description, shown for the active row only (its height animates 200ms,
 * instant under reduced motion). `aria-current="step"` marks the active
 * row. Enter and Space activate, as on any button.
 */
export default function StepList({ steps = [], active = 0, onPick, style }) {
  const reduce = useReduce();
  return (
    <ol style={{ listStyle: "none", margin: "20px 0 0", padding: 0, ...style }}>
      {steps.map((s, i) => {
        const on = i === active;
        const ahead = i > active;
        return (
          <li key={s.title} style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <button type="button" className={FOCUS_CLASS} aria-current={on ? "step" : undefined}
              onClick={() => onPick?.(i)}
              style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", minHeight: 44, padding: "8px 4px",
                margin: 0, background: "none", border: "none", borderRadius: 8, textAlign: "left", cursor: "pointer",
                fontFamily: SANS, color: "inherit", boxSizing: "border-box" }}>
              <span aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 6,
                background: ahead ? C.stone : C.accent, transition: reduce ? "none" : `background 200ms ${EASE_CSS}` }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...TYPE.stepTitle, display: "block", color: on ? C.ink : C.muted,
                  transition: reduce ? "none" : `color 200ms ${EASE_CSS}` }}>
                  {s.title}
                </span>
                <span style={{ display: "grid", gridTemplateRows: on ? "1fr" : "0fr",
                  transition: reduce ? "none" : `grid-template-rows 200ms ${EASE_CSS}` }}>
                  <span style={{ display: "block", overflow: "hidden", minHeight: 0 }}>
                    <span style={{ ...TYPE.stepDesc, display: "block", paddingTop: 4 }}>{s.desc}</span>
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A story's caption: muted, with the **bold** lead phrase in ink (white on
 *  the blue band). */
export function Caption({ text, tone = "page", style }) {
  const on = tone === "onBlue";
  const parts = String(text ?? "").split("**");
  return (
    <p style={{ ...TYPE.caption, color: on ? C.onBlueSoft : C.muted, ...style }}>
      {parts.map((part, i) => (i % 2
        ? <strong key={i} style={{ fontWeight: 700, color: on ? C.onBlue : C.ink }}>{part}</strong>
        : <span key={i}>{part}</span>))}
    </p>
  );
}

/** A story's signpost, two-tone heading and body. */
export function StoryIntro({ story, phone = false, style }) {
  return (
    <div style={style}>
      <Signpost stamp={story.stamp}>{story.signpost}</Signpost>
      <TwoTone lead={story.lead} rest={story.rest} style={{ marginTop: 12 }} />
      <p style={{ ...TYPE.body, ...(phone ? TYPE.bodyMobile : null), marginTop: 14 }}>{story.body}</p>
    </div>
  );
}
