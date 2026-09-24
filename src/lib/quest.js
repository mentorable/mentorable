import { supabase } from "./supabase.js";

const BASE = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

/** A refusal or failure from the Quest API, with a message fit to show. */
export class QuestApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The server decides what day it is from the zone saved on the profile. The
// browser's zone is only sent so the first visit has something to save.
function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

async function call(path, { method = "GET", body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new QuestApiError(401, "auth", "Your session ended. Sign in again.");
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Timezone": browserZone(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new QuestApiError(0, "network", "Could not reach Mentorable. Check your connection and try again.");
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const d = json?.detail;
    throw new QuestApiError(
      res.status,
      (d && d.error) || "error",
      (d && d.message) || (typeof d === "string" ? d : "Something went wrong. Try again."),
    );
  }
  return json;
}

const post = (path, body = {}) => call(path, { method: "POST", body });

export const questApi = {
  state:            ()             => call("/quest"),
  summary:          ()             => call("/quest/summary"),
  suggestions:      (refresh)      => post("/quest/suggestions", { refresh: !!refresh }),
  plan:             (body)         => post("/quest/plan", body),
  start:            (id)           => post(`/quest/${id}/start`),
  discard:          (id)           => post(`/quest/${id}/discard`),
  openTask:         (slot)         => post(`/quest/tasks/${slot}`),
  checkIn:          (slot, body)   => post(`/quest/tasks/${slot}/checkin`, { body }),
  followup:         (id, answer)   => post(`/quest/checkins/${id}/followup`, { answer }),
  pause:            (id)           => post(`/quest/${id}/pause`),
  resume:           (id)           => post(`/quest/${id}/resume`),
  retire:           (id)           => post(`/quest/${id}/retire`),
  takeBreak:        (id)           => post(`/quest/${id}/break`),
  settings:         (id, body)     => post(`/quest/${id}/settings`, body),
  portfolioDraft:   (id)           => post(`/quest/${id}/portfolio-draft`),
  portfolioSave:    (id, fields)   => post(`/quest/${id}/portfolio-save`, fields),
  portfolioDismiss: (id)           => post(`/quest/${id}/portfolio-dismiss`),
};

/** What the nav chip needs, derived from a full state so a check-in does not
 *  cost a second request. */
export function summaryFromState(state) {
  if (!state) return null;
  const status = state.quest?.status || null;
  return {
    ...state.stats,
    status,
    has_quest: ["draft", "active", "paused"].includes(status),
    ever: !!state.ever,
    today_state: state.today_state || (status === "draft" ? "draft" : "none"),
  };
}

// ── Dates ────────────────────────────────────────────────────────────────────
// Every date from the API is a calendar date ("2026-09-23") in the student's
// own zone. new Date("2026-09-23") would read it as UTC midnight, which is the
// evening before anywhere in the US, so parse the parts instead.

export function parseDay(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(iso, { weekday = true } = {}) {
  const d = parseDay(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" } : {}), month: "short", day: "numeric",
  });
}

export function weekdayName(iso) {
  const d = parseDay(iso);
  return d ? d.toLocaleDateString("en-US", { weekday: "long" }) : "";
}

/** "today", "tomorrow", or a weekday, relative to the server's today. */
export function relativeDay(iso, todayIso) {
  const a = parseDay(iso), b = parseDay(todayIso);
  if (!a || !b) return "";
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return weekdayName(iso);
  return formatDay(iso);
}
