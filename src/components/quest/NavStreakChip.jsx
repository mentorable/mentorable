import { useQuest } from "../../lib/QuestContext.jsx";
import { FOCUS_CLASS, RADIUS } from "../ui/tokens.js";
import { SANS, WHITE, MUTED, LINE, Flame, useQuestColors } from "./questUi.jsx";

/** The streak in the sidebar: lit once today's task is done (or it is a rest
 *  day), dim while it is still open. A calm chip like the rest of the shell;
 *  the flame is what carries it. */
export default function NavStreakChip({ onClick }) {
  const { summary } = useQuest();
  const c = useQuestColors();
  if (!summary || (!summary.ever && !summary.has_quest)) return null;

  const lit = ["done", "rest"].includes(summary.today_state);
  const open = ["open", "blocked"].includes(summary.today_state);
  const label = `${summary.streak} day streak, level ${summary.level}.${open ? " Today's task is still open." : ""} Open Quest`;

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={FOCUS_CLASS}
      style={{
        marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap",
        background: lit ? c.softer : WHITE, borderRadius: RADIUS.control, padding: "6px 10px", minHeight: 40,
        border: `1px solid ${lit ? c.soft : LINE}`, boxSizing: "border-box",
      }}>
      <Flame size={20} lit={lit} animate={lit} streak={summary.streak} />
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", color: lit ? c.onSoft : MUTED,
        fontVariantNumeric: "tabular-nums" }}>
        {summary.streak}
      </span>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.9rem", color: c.button.fg, background: c.button.bg,
        borderRadius: 7, padding: "1px 7px", marginLeft: 2, whiteSpace: "nowrap", lineHeight: 1.35 }}>
        Lv {summary.level}
      </span>
    </button>
  );
}
