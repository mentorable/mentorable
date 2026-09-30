import Spinner from "../../common/Spinner.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { TWEAKS } from "./options.js";

// Ask Beaker to rewrite the email one way: Shorter, Warmer, More formal,
// Smaller ask. It rewrites the text as it is in the editor (the student's
// edits survive) from the research it already did, so no new search. Three
// per email, shown as "2 left".
//
// A chip that can't be pressed right now (a rewrite running, none left, no
// text yet) is marked aria-disabled and ignores presses, but is never truly
// disabled: a disabled button drops keyboard focus, so pressing Enter on
// "Shorter" would leave a keyboard user at the top of the page.

export default function ToneChips({ left, limit = 3, busyKey = null, disabled = false, onPick }) {
  const ink = useAgentInk();
  const none = left !== null && left !== undefined && left <= 0;
  const busy = !!busyKey;
  return (
    <div role="group" aria-labelledby="oa-chips-label" aria-describedby="oa-chips-left"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontFamily: SANS }}>
      <span id="oa-chips-label" style={{ fontSize: "0.95rem", fontWeight: 800, color: TEXT, marginRight: 2 }}>Rewrite it:</span>
      {TWEAKS.map((t) => {
        const mine = busyKey === t.key;
        const off = disabled || none || busy;
        return (
          <button key={t.key} type="button" className={FOCUS_CLASS} aria-disabled={off || undefined}
            onClick={() => { if (!off) onPick(t.key); }}
            aria-busy={mine || undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "8px 14px",
              borderRadius: RADIUS.pill, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: off ? "default" : "pointer",
              background: mine ? ink.soft : WHITE, color: mine ? ink.onSoft : TEXT, border: `1.5px solid ${mine ? ink.ring : BORDER}`,
              opacity: off && !mine ? 0.55 : 1 }}>
            {mine && <Spinner size={14} color={ink.onSoft} />}
            {mine ? "Rewriting..." : t.label}
          </button>
        );
      })}
      <span id="oa-chips-left" style={{ fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
        {left === null || left === undefined ? "" : none ? "No rewrites left. You can still edit it yourself." : `${left} of ${limit} left`}
      </span>
    </div>
  );
}
