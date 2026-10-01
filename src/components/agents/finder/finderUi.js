import { TALON_LINES } from "../../../lib/agents/registry.js";
import { LANES } from "../../../lib/finder.js";
import { budgetOf } from "../outreach/options.js";

// Small shared bits for Talon's screens (the board, the flow and their
// parts), on top of agentUi.js and the outreach pieces that are not Beaker's
// alone (flowUi's Button, Card and Notice, Sheet, BoardToast, mergeProgress).

/** The mascot key for Talon (components/agents/Mascot.jsx). */
export const TALON = "talon";

export const BOARD_PATH = "/agents/finder";
export const NEW_PATH = "/agents/finder/new";

/** The flow, opened on a lane when one is given ("scholarship" | "activity"). */
export function newPath(lane) {
  return LANES.some((l) => l.key === lane) ? `${NEW_PATH}?lane=${lane}` : NEW_PATH;
}

export { budgetOf };

/** A JSON list column as plain strings, whatever came back. */
export function listOf(value) {
  return Array.isArray(value) ? value.filter((s) => typeof s === "string" && s.trim()) : [];
}

/** "1 thing", "3 things". */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function laneLabel(key) {
  return LANES.find((l) => l.key === key)?.label || "";
}

// ── What is left to spend (GET /agents/finder/status) ───────────────────────
// A find spends one find (given back when the search fails) and one search
// (never given back), so searches can run out while finds remain.

/** Why Talon cannot start a find: "finds", "searches", or null. */
export function findsBlock(status) {
  const finds = budgetOf(status?.finds);
  const searches = budgetOf(status?.searches);
  if (finds && finds.left <= 0) return "finds";
  if (searches && searches.left <= 0) return "searches";
  return null;
}

/** The stop, in words, for each reason findsBlock gives: a heading, what
 *  Talon says, and a short note for beside a disabled button. Read when
 *  called, so the registry's lines are only looked up once they exist. */
export function blockCopy(block) {
  if (block === "finds") {
    return {
      title: "No finds left",
      line: TALON_LINES.boardNoFinds,
      short: "No finds left. Your board still works.",
    };
  }
  if (block === "searches") {
    return {
      title: "No searches left",
      line: "I've run all the searches this demo allows, so I can't start a new find. Everything on your board still works.",
      short: "No searches left. Your board still works.",
    };
  }
  return null;
}

// ── Dates ────────────────────────────────────────────────────────────────────
// checked_at is a timestamp (not a calendar date), so new Date() reads it
// correctly; it is shown as the student's own calendar day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNumber = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

/** "Checked today", "Checked yesterday", "Checked Oct 1" (with the year when
 *  it is not this one), or "" when the date cannot be read. */
export function checkedLabel(item, today = new Date()) {
  const d = item?.checked_at ? new Date(item.checked_at) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const diff = dayNumber(today) - dayNumber(d);
  if (diff === 0) return "Checked today";
  if (diff === 1) return "Checked yesterday";
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `Checked ${d.getFullYear() === today.getFullYear() ? label : `${label}, ${d.getFullYear()}`}`;
}

// ── Board order ──────────────────────────────────────────────────────────────

/** A position above every card in `list` (positions sort ascending). */
export function topPosition(list) {
  const ps = (list || []).map((i) => Number(i.position)).filter(Number.isFinite);
  return ps.length ? Math.min(...ps) - 1 : 0;
}

/** Statuses that mean "the student kept it". */
export const KEPT = new Set(["saved", "applying", "applied", "done"]);
