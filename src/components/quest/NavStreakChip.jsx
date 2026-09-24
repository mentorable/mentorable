import { useQuest } from "../../lib/QuestContext.jsx";
import { SANS, WHITE, FAINT, Flame, useQuestColors } from "./questUi.jsx";

/** The streak in the sidebar: lit once today's task is done (or it is a rest
 *  day), dim while it is still open. The one bold Quest element that shows up
 *  on every page. */
export default function NavStreakChip({ onClick }) {
  const { summary } = useQuest();
  const c = useQuestColors();
  if (!summary || (!summary.ever && !summary.has_quest)) return null;

  const lit = ["done", "rest"].includes(summary.today_state);
  const open = ["open", "blocked"].includes(summary.today_state);
  const label = `${summary.streak} day streak, level ${summary.level}.${open ? " Today's task is still open." : ""} Open Quest`;

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      style={{
        marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap",
        background: WHITE, borderRadius: 12, padding: "7px 10px",
        border: `2px solid ${lit ? c.accent : "#e4e2dd"}`, boxShadow: `0 3px 0 ${lit ? c.edge : "#e4e2dd"}`,
      }}>
      <Flame size={20} lit={lit} animate={lit} />
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.98rem", color: lit ? c.accent : FAINT,
        fontVariantNumeric: "tabular-nums" }}>
        {summary.streak}
      </span>
      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.78rem", color: WHITE, background: c.accent,
        borderRadius: 7, padding: "2px 7px", marginLeft: 2, whiteSpace: "nowrap" }}>
        Lv {summary.level}
      </span>
    </button>
  );
}
