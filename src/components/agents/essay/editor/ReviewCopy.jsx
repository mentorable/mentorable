import { CHECKS } from "../../../../lib/essay.js";
import { SR_ONLY } from "../../../ui/kit.jsx";
import { useAgentInk } from "../../../ui/tokens.js";
import { CHIP_CLASS, MARK_CLASS, TYPE_CLASS, markVars } from "./editorUi.js";
import { responseOf } from "./reviewModel.js";

// The version Quill read, as plain text that cannot be edited: there is no
// input here at all, only the words and the passages a note or a cut quoted.
//
// Each highlight is a button in the flow of the text (so a quote that wraps
// still reads as prose): Tab reaches it, Enter or Space chooses it, and
// choosing it selects its note. It is told apart without colour by its
// underline (dashed for a passage that could go), the number in front that
// matches its note, and a thicker line when it is the one chosen. A note the
// student has answered or dismissed keeps its underline and loses its tint.

const CHECK_LABELS = Object.fromEntries(CHECKS.map((c) => [c.key, c.label]));

/**
 * pieces, byId: from buildReview. responses: the review's map. active: the
 * chosen note or cut id. onSelect(id): a highlight was chosen. register(id,
 * node): the page keeps each highlight's element, to scroll to and focus.
 */
export default function ReviewCopy({ pieces, byId, responses, active, onSelect, register }) {
  const ink = useAgentInk();
  return (
    <div className={TYPE_CLASS} style={{ ...markVars(ink), whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {pieces.map((piece, i) => {
        const item = piece.id === null || piece.id === undefined ? null : byId.get(piece.id);
        if (!item) return <span key={`t${i}`}>{piece.text}</span>;
        const cut = item.kind === "cut";
        const on = active === item.id;
        const quiet = !cut && !!responseOf(responses, item.id);
        const check = cut ? "" : CHECK_LABELS[item.check] || "";
        return (
          <mark key={item.id} ref={(node) => register?.(item.id, node)} className={MARK_CLASS} role="button" tabIndex={0}
            aria-pressed={on} data-cut={cut ? "" : undefined} data-on={on ? "" : undefined}
            data-quiet={quiet ? "" : undefined} onClick={() => onSelect?.(item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(item.id); }
            }}>
            <span aria-hidden="true" className={CHIP_CLASS}>{cut ? `Cut ${item.number}` : item.number}</span>
            <span style={SR_ONLY}>
              {cut ? `Passage that could go, ${item.number}: ` : `Note ${item.number}${check ? `, ${check}` : ""}: `}
            </span>
            {piece.text}
          </mark>
        );
      })}
    </div>
  );
}
