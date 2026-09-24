"""
Quest service: every read and write of the quest tables, and the orchestration
around the model calls.

The rules (which day a slot falls on, what is missed, when a milestone opens,
whether the streak survives) live in schedule.py and are unit tested there.
This module loads what they need, applies them, and writes the results. The
endpoints in app/routers/quest.py only translate HTTP.

Every query filters on user_id. The backend runs as the service role, which
bypasses RLS, so that filter is the only thing keeping one student's request
away from another student's rows.

"Today" is always the student's local date, from profiles.timezone. The browser
never gets to say what day it is.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from app.db.supabase import get_supabase
from app.llm import ModelUnavailable
from app.nodes.quest import schedule as S
from app.nodes.quest import xp as X
from app.nodes.quest.checkin import canned_reply, looks_thin, reply_to_checkin
from app.nodes.quest.common import grade_line, student_context
from app.nodes.quest.draft import computed_fields, draft_activity
from app.nodes.quest.plan import plan_quest
from app.nodes.quest.suggest import FALLBACK_SUGGESTIONS, record_key, suggest_quests
from app.nodes.quest.task import fallback_task, generate_task

logger = logging.getLogger(__name__)

# (period, limit). The daily ones degrade to plain content instead of refusing,
# so a student is never stopped from doing the work; only the personalisation
# is capped. The monthly ones refuse.
BUDGETS = {
    "task":            ("day", 4),
    "reply":           ("day", 4),
    "plan":            ("month", 3),
    "suggest_refresh": ("month", 3),
    "suggest_auto":    ("month", 5),
}

OPEN_STATUSES = ["draft", "active", "paused"]
RECENT_COMPLETION_DAYS = 7
DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


class QuestError(Exception):
    """An expected refusal, with the HTTP status and a message for the student."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


# ── Small helpers ─────────────────────────────────────────────────────────────

def _sb():
    return get_supabase()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


def _first(rows):
    return rows[0] if rows else None


def _date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _clip(text, limit: int) -> str:
    """Truncate the student's own words without rewriting them."""
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ── Loading ───────────────────────────────────────────────────────────────────

@dataclass
class Ctx:
    user_id: str
    tz: str
    today: date
    quest: Optional[dict] = None
    milestones: list = field(default_factory=list)
    tasks: list = field(default_factory=list)
    checkins: list = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    view: Optional[dict] = None


def resolve_timezone(user_id: str, hint: Optional[str]) -> str:
    """The stored zone wins. The browser's is saved the first time we see one,
    so moving the laptop clock does not move the student's day."""
    prof = _first(_sb().from_("profiles").select("timezone").eq("id", user_id).limit(1).execute().data or [])
    stored = S.valid_zone((prof or {}).get("timezone"))
    if stored:
        return stored
    hinted = S.valid_zone(hint)
    if hinted:
        try:
            _sb().from_("profiles").update({"timezone": hinted}).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning(f"[quest] could not save timezone for {user_id}: {exc}")
        return hinted
    return S.DEFAULT_TZ


def load(user_id: str, tz_hint: Optional[str] = None, *, tz: Optional[str] = None,
         include_recent: bool = True, with_checkins: bool = True) -> Ctx:
    tz = S.valid_zone(tz) or resolve_timezone(user_id, tz_hint)
    ctx = Ctx(user_id=user_id, tz=tz, today=S.local_today(tz, _now()))
    sb = _sb()

    quest = _first(
        sb.from_("quests").select("*").eq("user_id", user_id)
        .in_("status", OPEN_STATUSES).limit(1).execute().data or []
    )
    if quest is None and include_recent:
        last = _first(
            sb.from_("quests").select("*").eq("user_id", user_id).eq("status", "completed")
            .order("completed_at", desc=True).limit(1).execute().data or []
        )
        ended = _date((last or {}).get("ended_on"))
        if last and ended and (ctx.today - ended).days <= RECENT_COMPLETION_DAYS:
            quest = last

    ctx.stats = _first(
        sb.from_("quest_stats").select("*").eq("user_id", user_id).limit(1).execute().data or []
    ) or {"xp": 0, "streak": 0, "streak_date": None, "best_streak": 0}

    if quest:
        _attach(ctx, quest, with_checkins=with_checkins)
    return ctx


def _attach(ctx: Ctx, quest: dict, with_checkins: bool = True) -> None:
    sb = _sb()
    qid = quest["id"]
    ctx.quest = quest
    ctx.milestones = (
        sb.from_("quest_milestones").select("*").eq("quest_id", qid).eq("user_id", ctx.user_id)
        .order("position").execute().data or []
    )
    ctx.tasks = (
        sb.from_("quest_tasks").select("*").eq("quest_id", qid).eq("user_id", ctx.user_id)
        .order("slot").execute().data or []
    )
    if with_checkins:
        ctx.checkins = (
            sb.from_("quest_checkins").select("*").eq("quest_id", qid).eq("user_id", ctx.user_id)
            .order("created_at").execute().data or []
        )
    ctx.view = _build_view(ctx) if quest["status"] != "draft" else None


def _done_on(ctx: Ctx) -> dict[int, date]:
    return {
        t["slot"]: _date(t["done_on"])
        for t in ctx.tasks if t.get("status") == "done" and _date(t.get("done_on"))
    }


def _build_view(ctx: Ctx) -> dict:
    q = ctx.quest
    return S.build_view(
        segments=q.get("schedule") or [],
        expected_days=[int(m["expected_days"]) for m in ctx.milestones],
        done_on=_done_on(ctx),
        today=ctx.today,
        status=q["status"],
        paused_on=_date(q.get("paused_on")),
        start_date=_date(q.get("start_date")),
    )


def _ever_had_quest(user_id: str) -> bool:
    return bool(_sb().from_("quests").select("id").eq("user_id", user_id)
                .neq("status", "draft").limit(1).execute().data)


# ── Streak ────────────────────────────────────────────────────────────────────

def _streak(ctx: Ctx) -> tuple[int, bool]:
    """(the streak to show, whether the stored one is still alive)."""
    counted: list[date] = []
    if ctx.quest and ctx.quest["status"] in ("active", "paused") and ctx.view:
        counted = S.counted_dates(ctx.view["dates"], ctx.quest["status"], _date(ctx.quest.get("paused_on")))
    alive = S.streak_alive(_date(ctx.stats.get("streak_date")), ctx.today, counted)
    stored = _int(ctx.stats.get("streak"), 0)
    return (stored if alive else 0), alive


def _settle_streak(ctx: Ctx) -> None:
    """Write 0 if the streak is already dead.

    Must run before anything that rewrites the schedule or ends the quest:
    relaying slots, or dropping the quest's days from the streak check, would
    otherwise erase the missed day that killed it and bring it back to life.
    """
    _, alive = _streak(ctx)
    if not alive and _int(ctx.stats.get("streak"), 0) > 0:
        _sb().from_("quest_stats").update({"streak": 0, "updated_at": _iso_now()}) \
            .eq("user_id", ctx.user_id).execute()
        ctx.stats["streak"] = 0


# ── Budgets ───────────────────────────────────────────────────────────────────

def _bucket(ctx: Ctx, kind: str) -> str:
    period, _ = BUDGETS[kind]
    return ctx.today.isoformat() if period == "day" else ctx.today.strftime("%Y-%m")


def _spend(ctx: Ctx, kind: str) -> bool:
    """Take one unit of a budget. False when it is spent (or cannot be checked)."""
    _, limit = BUDGETS[kind]
    try:
        res = _sb().rpc("quest_bump_usage", {
            "p_user_id": ctx.user_id, "p_kind": kind,
            "p_bucket": _bucket(ctx, kind), "p_limit": limit,
        }).execute()
        return bool((res.data or {}).get("allowed"))
    except Exception as exc:
        logger.warning(f"[quest] budget check failed for {ctx.user_id} ({kind}): {exc}")
        return False


def _refund(ctx: Ctx, kind: str) -> None:
    try:
        _sb().rpc("quest_refund_usage", {
            "p_user_id": ctx.user_id, "p_kind": kind, "p_bucket": _bucket(ctx, kind),
        }).execute()
    except Exception as exc:
        logger.warning(f"[quest] refund failed for {ctx.user_id} ({kind}): {exc}")


def _left(ctx: Ctx, kind: str) -> int:
    _, limit = BUDGETS[kind]
    row = _first(
        _sb().from_("quest_usage").select("used").eq("user_id", ctx.user_id)
        .eq("kind", kind).eq("bucket", _bucket(ctx, kind)).limit(1).execute().data or []
    )
    return max(0, limit - _int((row or {}).get("used"), 0))


# ── Payloads ──────────────────────────────────────────────────────────────────

def _stats_payload(ctx: Ctx) -> dict:
    streak, _ = _streak(ctx)
    return {
        **X.level_progress(_int(ctx.stats.get("xp"), 0)),
        "streak": streak,
        "best_streak": _int(ctx.stats.get("best_streak"), 0),
    }


def _checkin_payload(c: Optional[dict]) -> Optional[dict]:
    if not c:
        return None
    return {
        "id": c["id"], "body": c.get("body") or "", "reply": c.get("advisor_reply") or "",
        "followup": c.get("followup"), "followup_answer": c.get("followup_answer"),
        "thin": bool(c.get("thin")), "on_time": bool(c.get("on_time")),
        "xp_awarded": _int(c.get("xp_awarded"), 0),
    }


def _task_payload(t: dict, c: Optional[dict]) -> dict:
    return {
        "id": t["id"], "slot": t["slot"], "title": t["title"], "detail": t.get("detail") or "",
        "est_minutes": _int(t.get("est_minutes"), 15), "fallback": bool(t.get("fallback")),
        "status": t.get("status"), "checkin": _checkin_payload(c),
    }


def _checkin_line(c: dict) -> str:
    """The student's own words for a check-in. A thin line that got a real
    answer to its follow-up is represented by the answer, which is where the
    substance ended up."""
    body = c.get("body") or ""
    if c.get("followup_answer") and looks_thin(body):
        return c["followup_answer"]
    return body


def _milestone_lines(ctx: Ctx, milestone_id: str) -> list[str]:
    """Two or three of the student's own check-ins, for the milestone card."""
    task_ids = {t["id"] for t in ctx.tasks if t.get("milestone_id") == milestone_id}
    lines = [_checkin_line(c) for c in ctx.checkins
             if c.get("task_id") in task_ids and (not c.get("thin") or c.get("followup_answer"))]
    lines = [line for line in lines if not looks_thin(line)] or lines
    lines.sort(key=len, reverse=True)
    return [_clip(line, 140) for line in lines[:3]]


def _quest_payload(q: dict) -> dict:
    return {
        "id": q["id"], "title": q["title"], "summary": q.get("summary") or "",
        "goal_kind": q.get("goal_kind"), "status": q["status"],
        "daily_minutes": _int(q.get("daily_minutes"), 30),
        "rest_days": S.clean_rest_days(q.get("rest_days")),
        "start_date": q.get("start_date"), "paused_on": q.get("paused_on"),
        "ended_on": q.get("ended_on"), "hard_deadline": q.get("hard_deadline"),
        "add_to_portfolio": bool(q.get("add_to_portfolio")),
        "portfolio_activity_id": q.get("portfolio_activity_id"),
        "has_portfolio_draft": bool(q.get("portfolio_draft")),
    }


def state_payload(ctx: Ctx) -> dict:
    """Everything the Quest page renders."""
    out = {
        "today": ctx.today.isoformat(),
        "timezone": ctx.tz,
        "stats": _stats_payload(ctx),
        "view": "none",
        "quest": None,
        "ever": True if ctx.quest else _ever_had_quest(ctx.user_id),
    }
    q = ctx.quest
    if not q:
        return out

    out["quest"] = _quest_payload(q)
    out["view"] = q["status"]

    if q["status"] == "draft":
        rest = S.clean_rest_days(q.get("rest_days"))
        n = sum(_int(m["expected_days"], 1) for m in ctx.milestones)
        out["milestones"] = [
            {"id": m["id"], "position": m["position"], "title": m["title"],
             "description": m.get("description") or "", "expected_days": m["expected_days"]}
            for m in ctx.milestones
        ]
        out["draft"] = {
            "total_days": n,
            "finish_if_started_today": _iso(S.nth_work_day(ctx.today, n, rest)) if n else None,
        }
        return out

    v = ctx.view
    tasks_by_slot = {t["slot"]: t for t in ctx.tasks}
    checkin_by_task = {c["task_id"]: c for c in ctx.checkins}

    stones = []
    for s in v["stones"]:
        t = tasks_by_slot.get(s["slot"])
        stones.append({**s, "task": {"id": t["id"], "title": t["title"]} if t else None})

    milestones = []
    for i, m in enumerate(ctx.milestones):
        first, last = v["bounds"][i]
        state = v["milestone_states"][i]
        milestones.append({
            "id": m["id"], "position": m["position"], "title": m["title"],
            "description": m.get("description") or "", "expected_days": m["expected_days"],
            "first_slot": first, "last_slot": last, "state": state,
            "completed_at": m.get("completed_at"),
            "lines": _milestone_lines(ctx, m["id"]) if state == "done" else [],
        })

    today_task = None
    if v["today_slot"] and v["today_slot"] in tasks_by_slot:
        t = tasks_by_slot[v["today_slot"]]
        today_task = _task_payload(t, checkin_by_task.get(t["id"]))

    current = v["current_milestone"]
    unlocks = None
    if current is not None and current + 1 < len(ctx.milestones):
        unlocks = ctx.milestones[current + 1]["position"]
    doable_owed = [s for s in v["owed"] if v["stones"][s - 1]["doable"]]

    deadline = _date(q.get("hard_deadline"))
    out.update({
        "milestones": milestones,
        "stones": stones,
        "today_slot": v["today_slot"],
        "today_state": v["today_state"],
        "today_task": today_task,
        "backlog": {
            "count": len(v["owed"]),
            "in_current": len(v["owed_in_current"]),
            "oldest_doable_slot": doable_owed[0] if doable_owed else None,
            "unlocks_milestone": unlocks,
            "catch_up_by": _iso(v["catch_up_by"]),
        },
        "projected_finish": _iso(v["projected_finish"]),
        "nominal_finish": _iso(v["nominal_finish"]),
        "deadline_risk": bool(deadline and v["projected_finish"] and v["projected_finish"] > deadline),
        "welcome_back": {
            "show": v["welcome_back"], "offer_break": v["offer_break"],
            "gap": len(v["gap"]), "last_active": _iso(v["last_active"]),
        },
        "next_work_date": _iso(v["next_work_date"]),
        "remaining": v["remaining"],
        "total": v["n"],
    })

    if q["status"] == "completed":
        start, end = _date(q.get("start_date")), _date(q.get("ended_on"))
        out["completion"] = {
            "tasks": sum(1 for t in ctx.tasks if t.get("status") == "done"),
            "on_time": sum(1 for c in ctx.checkins if c.get("on_time")),
            "xp_earned": sum(_int(c.get("xp_awarded"), 0) for c in ctx.checkins),
            "days": ((end - start).days + 1) if start and end else None,
        }
    return out


def summary_payload(ctx: Ctx) -> dict:
    """What the nav chip needs on every page."""
    q = ctx.quest
    status = q["status"] if q else None
    return {
        **_stats_payload(ctx),
        "status": status,
        "has_quest": status in OPEN_STATUSES,
        "ever": True if q else _ever_had_quest(ctx.user_id),
        "today_state": (ctx.view or {}).get("today_state") or ("draft" if status == "draft" else "none"),
    }


def get_state(user_id: str, tz_hint: Optional[str]) -> dict:
    return state_payload(load(user_id, tz_hint))


def get_summary(user_id: str, tz_hint: Optional[str]) -> dict:
    return summary_payload(load(user_id, tz_hint, with_checkins=False))


# ── Planning and starting ─────────────────────────────────────────────────────

def _parse_deadline(raw, today: date) -> Optional[date]:
    if raw in (None, ""):
        return None
    d = _date(raw)
    if d is None:
        raise QuestError(422, "bad_deadline", "That deadline is not a date we can read.")
    if d <= today:
        raise QuestError(422, "bad_deadline", "The deadline has to be after today.")
    if d > today + timedelta(days=365):
        raise QuestError(422, "bad_deadline", "Pick a deadline within the next year.")
    return d


def _minutes(raw) -> int:
    m = _int(raw, 30)
    if m not in (15, 30, 45):
        raise QuestError(422, "bad_minutes", "Daily time has to be 15, 30 or 45 minutes.")
    return m


async def create_plan(user_id: str, tz_hint: Optional[str], body: dict) -> dict:
    goal = _clip(body.get("goal"), 600)
    if len(goal) < 3:
        raise QuestError(422, "goal_required", "Tell us what you want to work on.")
    minutes = _minutes(body.get("daily_minutes"))
    rest = S.clean_rest_days(body.get("rest_days") or [])

    ctx = load(user_id, tz_hint, include_recent=False, with_checkins=False)
    deadline = _parse_deadline(body.get("hard_deadline"), ctx.today)

    old_draft = None
    if ctx.quest:
        if ctx.quest["status"] != "draft":
            raise QuestError(409, "quest_open", "Finish or retire your current quest before planning a new one.")
        old_draft = ctx.quest["id"]

    max_days = None
    if deadline:
        max_days = S.work_days_between(ctx.today, deadline, rest)
        if max_days < 5:
            raise QuestError(422, "deadline_too_soon",
                             f"That deadline leaves only {max_days} work days. Pick a later date, "
                             f"fewer rest days, or leave it blank.")

    if not _spend(ctx, "plan"):
        raise QuestError(429, "QUEST_BUDGET",
                         "You have planned 3 quests this month. New plans open up on the 1st.")

    record_text, _ = student_context(user_id)
    try:
        plan = await plan_quest(
            goal=goal, record_text=record_text, minutes=minutes, work_days=7 - len(rest),
            max_days=max_days,
            deadline_label=(f"{deadline:%B} {deadline.day}, {deadline.year}" if deadline else None),
        )
    except ModelUnavailable:
        _refund(ctx, "plan")
        raise QuestError(503, "model_unavailable", "We could not reach the planner. Try again in a moment.")
    if plan is None:
        _refund(ctx, "plan")
        raise QuestError(502, "plan_failed",
                         "That plan did not come out right. Try again, maybe with a little more about your goal.")

    # Only now that a new plan exists: replacing the draft any earlier would
    # lose it whenever the model call failed.
    if old_draft:
        _sb().from_("quests").delete().eq("id", old_draft).eq("user_id", user_id) \
            .eq("status", "draft").execute()

    try:
        quest = (_sb().from_("quests").insert({
            "user_id": user_id, "title": plan["title"], "summary": plan["summary"],
            "goal_kind": plan["goal_kind"], "status": "draft", "daily_minutes": minutes,
            "rest_days": rest, "hard_deadline": _iso(deadline),
            "add_to_portfolio": body.get("add_to_portfolio", True) is not False,
        }).execute().data or [None])[0]
    except Exception as exc:
        # Most likely a second tab won the one-open-quest index.
        logger.warning(f"[quest] draft insert failed for {user_id}: {exc}")
        raise QuestError(409, "quest_open", "You already have a quest in progress.")
    if not quest:
        raise QuestError(500, "save_failed", "Could not save the plan. Try again.")

    try:
        _sb().from_("quest_milestones").insert([
            {"user_id": user_id, "quest_id": quest["id"], "position": i + 1, "title": m["title"],
             "description": m["description"], "expected_days": m["days"]}
            for i, m in enumerate(plan["milestones"])
        ]).execute()
    except Exception as exc:
        logger.error(f"[quest] milestone insert failed for {user_id}: {exc}")
        _sb().from_("quests").delete().eq("id", quest["id"]).eq("user_id", user_id).execute()
        raise QuestError(500, "save_failed", "Could not save the plan. Try again.")

    return get_state(user_id, tz_hint)


def start_quest(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    ctx = load(user_id, tz_hint, include_recent=False, with_checkins=False)
    q = ctx.quest
    if not q or q["id"] != quest_id or q["status"] != "draft":
        raise QuestError(409, "not_draft", "That plan is no longer waiting to start.")
    rest = S.clean_rest_days(q.get("rest_days"))
    _sb().from_("quests").update({
        "status": "active", "start_date": ctx.today.isoformat(),
        "schedule": S.new_schedule(ctx.today, rest),
        "started_at": _iso_now(), "updated_at": _iso_now(),
    }).eq("id", quest_id).eq("user_id", user_id).eq("status", "draft").execute()
    return get_state(user_id, tz_hint)


def discard_draft(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    _sb().from_("quests").delete().eq("id", quest_id).eq("user_id", user_id).eq("status", "draft").execute()
    return get_state(user_id, tz_hint)


# ── Pace, pause and ending ────────────────────────────────────────────────────

def _require(ctx: Ctx, quest_id: Optional[str], statuses: set) -> dict:
    q = ctx.quest
    if not q or (quest_id and q["id"] != quest_id):
        raise QuestError(404, "no_quest", "That quest was not found.")
    if q["status"] not in statuses:
        raise QuestError(409, "wrong_status", f"That quest is {q['status']}.")
    return q


def _relay(ctx: Ctx, cut: date, rest: list[int], n: Optional[int] = None) -> list[dict]:
    """Lay every slot not yet reached as of `cut` again, from today."""
    v = ctx.view
    from_slot = S.relay_from(v["dates"], set(_done_on(ctx)), cut)
    return S.rebase(ctx.quest.get("schedule") or [], n if n is not None else v["n"],
                    from_slot, ctx.today, rest)


def _update_quest(ctx: Ctx, values: dict) -> None:
    _sb().from_("quests").update({**values, "updated_at": _iso_now()}) \
        .eq("id", ctx.quest["id"]).eq("user_id", ctx.user_id).execute()


def pause(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    ctx = load(user_id, tz_hint, with_checkins=False)
    _require(ctx, quest_id, {"active"})
    _settle_streak(ctx)
    _update_quest(ctx, {"status": "paused", "paused_on": ctx.today.isoformat()})
    return get_state(user_id, tz_hint)


def resume(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    ctx = load(user_id, tz_hint, with_checkins=False)
    q = _require(ctx, quest_id, {"paused"})
    _settle_streak(ctx)
    paused_on = _date(q.get("paused_on")) or ctx.today
    schedule = _relay(ctx, paused_on, S.clean_rest_days(q.get("rest_days")))
    _update_quest(ctx, {"status": "active", "paused_on": None, "schedule": schedule})
    return get_state(user_id, tz_hint)


def _retire(ctx: Ctx, quest_id: Optional[str]) -> dict:
    q = _require(ctx, quest_id, {"active", "paused"})
    _settle_streak(ctx)
    _update_quest(ctx, {"status": "retired", "ended_on": ctx.today.isoformat(), "paused_on": None})
    return q


def retire(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    _retire(load(user_id, tz_hint, with_checkins=False), quest_id)
    return get_state(user_id, tz_hint)


def take_break(user_id: str, tz_hint: Optional[str], quest_id: str) -> dict:
    """"Count it as a break" after a long absence: the days missed since the
    last check-in move to start from today. The streak is settled first, so
    the gap still costs the flame; it just stops being a pile of backlog."""
    ctx = load(user_id, tz_hint, with_checkins=False)
    q = _require(ctx, quest_id, {"active"})
    v = ctx.view
    if not v["offer_break"]:
        raise QuestError(409, "no_break", "There is no long gap to count as a break.")
    _settle_streak(ctx)
    schedule = S.rebase(q.get("schedule") or [], v["n"], v["last_done_slot"] + 1, ctx.today,
                        S.clean_rest_days(q.get("rest_days")))
    _update_quest(ctx, {"schedule": schedule})
    return get_state(user_id, tz_hint)


def apply_changes(ctx: Ctx, changes: dict, *, allow_structure: bool) -> list[str]:
    """Apply edits to the open quest and return what changed.

    Used by the pace settings on the Quest page and by the advisor's
    update_quest tool. Nothing here can touch tasks, check-ins, XP or the
    streak: those only move through a check-in.
    """
    q = ctx.quest
    values: dict = {}
    changed: list[str] = []
    rest = S.clean_rest_days(q.get("rest_days"))
    reschedule = False

    if "daily_minutes" in changes and changes["daily_minutes"] is not None:
        m = _minutes(changes["daily_minutes"])
        if m != _int(q.get("daily_minutes"), 30):
            values["daily_minutes"] = m
            changed.append("daily_minutes")

    if "rest_days" in changes and changes["rest_days"] is not None:
        new_rest = S.clean_rest_days(changes["rest_days"])
        if new_rest != rest:
            values["rest_days"] = new_rest
            rest = new_rest
            changed.append("rest_days")
            reschedule = True

    if allow_structure:
        if isinstance(changes.get("title"), str) and changes["title"].strip():
            values["title"] = _clip(changes["title"], 60)
            changed.append("title")
        if isinstance(changes.get("summary"), str):
            values["summary"] = _clip(changes["summary"], 300)
            changed.append("summary")
        if "hard_deadline" in changes:
            values["hard_deadline"] = _iso(_parse_deadline(changes["hard_deadline"], ctx.today))
            changed.append("hard_deadline")

    new_n = None
    ms_updates = []
    if allow_structure and isinstance(changes.get("milestones"), list):
        states = (ctx.view or {}).get("milestone_states") or []
        by_pos = {m["position"]: (i, m) for i, m in enumerate(ctx.milestones)}
        days = [int(m["expected_days"]) for m in ctx.milestones]
        for edit in changes["milestones"]:
            if not isinstance(edit, dict):
                continue
            hit = by_pos.get(_int(edit.get("position"), -1))
            if not hit:
                continue
            i, m = hit
            state = states[i] if i < len(states) else "locked"
            if state == "done":
                continue            # finished work is history
            upd = {}
            if isinstance(edit.get("title"), str) and edit["title"].strip():
                upd["title"] = _clip(edit["title"], 60)
            if isinstance(edit.get("description"), str):
                upd["description"] = _clip(edit["description"], 240)
            # Length can only change on a milestone that has not opened: the
            # open one's days are what its tasks were generated against, and
            # shortening it would complete it without the work.
            if edit.get("days") is not None and (state == "locked" or q["status"] == "draft"):
                d = max(1, min(20, _int(edit["days"], days[i])))
                if d != days[i]:
                    upd["expected_days"] = d
                    days[i] = d
            if upd:
                ms_updates.append((m["id"], upd))
                changed.append(f"milestone {m['position']}")
        if any("expected_days" in u for _, u in ms_updates):
            new_n = sum(days)
            reschedule = True

    if reschedule and q["status"] == "active" and ctx.view:
        _settle_streak(ctx)
        # Relay from the first slot not yet reached, as it stands now. With the
        # same rest days this leaves every existing date alone and only lays
        # new or moved days from today.
        values["schedule"] = _relay(ctx, ctx.today, rest, n=new_n)

    for mid, upd in ms_updates:
        _sb().from_("quest_milestones").update({**upd, "updated_at": _iso_now()}) \
            .eq("id", mid).eq("user_id", ctx.user_id).execute()
    if values:
        _update_quest(ctx, values)
    return changed


def change_settings(user_id: str, tz_hint: Optional[str], quest_id: str, body: dict) -> dict:
    ctx = load(user_id, tz_hint, with_checkins=False)
    _require(ctx, quest_id, {"active", "paused"})
    apply_changes(ctx, {"daily_minutes": body.get("daily_minutes"), "rest_days": body.get("rest_days")},
                  allow_structure=False)
    return get_state(user_id, tz_hint)


# ── Tasks and check-ins ───────────────────────────────────────────────────────

def _slot_or_error(ctx: Ctx, slot: int) -> dict:
    q = ctx.quest
    if not q or q["status"] != "active" or not ctx.view:
        raise QuestError(409, "no_active_quest", "You do not have an active quest.")
    if slot < 1 or slot > ctx.view["n"]:
        raise QuestError(404, "no_slot", "That day is not part of this quest.")
    return ctx.view["stones"][slot - 1]


def _locked_message(stone: dict, ctx: Ctx) -> QuestError:
    if _date(stone["date"]) and _date(stone["date"]) > ctx.today:
        return QuestError(409, "not_yet", "That day has not come yet.")
    return QuestError(409, "milestone_locked", "Finish the current milestone to open this one.")


def _recent_checkins(ctx: Ctx, limit: int = 3) -> list[dict]:
    titles = {t["id"]: t["title"] for t in ctx.tasks}
    recent = [c for c in ctx.checkins if c.get("task_id") in titles][-limit:]
    return [{"task_title": titles[c["task_id"]], "body": c.get("body"),
             "followup_answer": c.get("followup_answer")} for c in recent]


def _grade(user_id: str) -> str:
    prof = _first(_sb().from_("profiles").select("grade_level").eq("id", user_id).limit(1).execute().data or [])
    return grade_line({"profile": prof or {}})


async def open_task(user_id: str, tz_hint: Optional[str], slot: int) -> dict:
    """Return the task for a day-slot, generating it the first time it is opened.

    A task that already exists can be read whatever state the quest is in, so a
    student can look back over a paused or finished quest. Only generating a
    new one needs the quest to be active and the day to be open.
    """
    ctx = load(user_id, tz_hint)
    if not ctx.quest or not ctx.view:
        raise QuestError(409, "no_active_quest", "You do not have a quest right now.")
    existing = next((t for t in ctx.tasks if t["slot"] == slot), None)
    if existing:
        checkin = next((c for c in ctx.checkins if c["task_id"] == existing["id"]), None)
        return {"task": _task_payload(existing, checkin)}
    stone = _slot_or_error(ctx, slot)
    if not stone["doable"]:
        raise _locked_message(stone, ctx)

    q = ctx.quest
    index = stone["milestone"]
    milestone = ctx.milestones[index]
    first, _ = ctx.view["bounds"][index]
    minutes = _int(q.get("daily_minutes"), 30)

    if _spend(ctx, "task"):
        task = await generate_task(
            quest=q, milestone=milestone, milestone_count=len(ctx.milestones),
            day_in_ms=slot - first + 1,
            prior_titles=[t["title"] for t in ctx.tasks if t.get("milestone_id") == milestone["id"]],
            recent=_recent_checkins(ctx), grade=_grade(user_id),
            catch_up=stone["state"] == "missed",
        )
    else:
        task = fallback_task(milestone, minutes)

    # ignore_duplicates + UNIQUE (quest_id, slot): if a second tab got here
    # first, keep its task rather than overwriting it.
    _sb().from_("quest_tasks").upsert({
        "user_id": user_id, "quest_id": q["id"], "milestone_id": milestone["id"], "slot": slot,
        "title": task["title"], "detail": task["detail"], "est_minutes": task["est_minutes"],
        "fallback": task["fallback"],
    }, on_conflict="quest_id,slot", ignore_duplicates=True).execute()
    saved = _first(
        _sb().from_("quest_tasks").select("*").eq("quest_id", q["id"]).eq("user_id", user_id)
        .eq("slot", slot).limit(1).execute().data or []
    )
    if not saved:
        raise QuestError(500, "save_failed", "Could not set up that task. Try again.")
    return {"task": _task_payload(saved, None)}


async def check_in(user_id: str, tz_hint: Optional[str], slot: int, body_text) -> dict:
    body = str(body_text or "").strip()
    if not body:
        raise QuestError(422, "empty", "Write a line about what you did.")
    body = body[:1000]

    ctx = load(user_id, tz_hint)
    stone = _slot_or_error(ctx, slot)
    task = next((t for t in ctx.tasks if t["slot"] == slot), None)
    if not task:
        raise QuestError(409, "no_task", "Open the task before checking in.")
    if task["status"] == "done":
        checkin = next((c for c in ctx.checkins if c["task_id"] == task["id"]), None)
        return {"already": True, "checkin": _checkin_payload(checkin), "result": None,
                "state": state_payload(ctx)}
    if not stone["doable"]:
        raise _locked_message(stone, ctx)

    dates = ctx.view["dates"]
    on_time = S.is_on_time(dates, slot, ctx.today)
    _, alive = _streak(ctx)
    xp_before = _int(ctx.stats.get("xp"), 0)

    res = _sb().rpc("quest_complete_task", {
        "p_user_id": user_id, "p_task_id": task["id"], "p_body": body,
        "p_thin": looks_thin(body), "p_today": ctx.today.isoformat(),
        "p_on_time": on_time, "p_streak_alive": alive,
        "p_task_xp": X.TASK_XP, "p_milestone_xp": X.MILESTONE_XP, "p_quest_xp": X.QUEST_XP,
    }).execute().data or {}

    if not res.get("ok"):
        if res.get("error") == "not_active":
            raise QuestError(409, "no_active_quest", "This quest is not active.")
        raise QuestError(404, "no_task", "That task was not found.")
    if res.get("already"):
        fresh = load(user_id, tz=ctx.tz)
        checkin = next((c for c in fresh.checkins if c["id"] == res.get("checkin_id")), None)
        return {"already": True, "checkin": _checkin_payload(checkin), "result": None,
                "state": state_payload(fresh)}

    # The task is done and the XP is in. The reply is the only part that can
    # still fail, and it does not get to take anything back.
    index = stone["milestone"]
    milestone = ctx.milestones[index]
    if _spend(ctx, "reply"):
        reply = await reply_to_checkin(quest=ctx.quest, milestone=milestone, task=task,
                                       body=body, catch_up=not on_time)
    else:
        reply = canned_reply(body)
    try:
        _sb().from_("quest_checkins").update({
            "advisor_reply": reply["reply"], "followup": reply["followup"], "thin": reply["thin"],
        }).eq("id", res["checkin_id"]).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[quest] could not store the reply for {user_id}: {exc}")

    if res.get("quest_completed") and not on_time and not alive:
        # Finished on a catch-up while the streak was already broken: once the
        # quest is over its missed days stop counting, so record the loss now.
        _sb().from_("quest_stats").update({"streak": 0, "updated_at": _iso_now()}) \
            .eq("user_id", user_id).execute()

    fresh = load(user_id, tz=ctx.tz)
    milestone_done = None
    if res.get("milestone_completed"):
        done_ms = next((m for m in fresh.milestones if m["position"] == res["milestone_completed"]), None)
        if done_ms:
            milestone_done = {"position": done_ms["position"], "title": done_ms["title"],
                              "lines": _milestone_lines(fresh, done_ms["id"])}

    xp_after = _int(res.get("xp"), xp_before)
    return {
        "already": False,
        "checkin": {
            "id": res["checkin_id"], "body": body, "reply": reply["reply"],
            "followup": reply["followup"], "followup_answer": None, "thin": reply["thin"],
            "on_time": on_time, "xp_awarded": _int(res.get("xp_gained"), 0),
        },
        "result": {
            "xp_gained": _int(res.get("xp_gained"), 0),
            "xp": xp_after,
            "level_before": X.level_for(xp_before),
            "level_after": X.level_for(xp_after),
            "on_time": on_time,
            "milestone_completed": milestone_done,
            "quest_completed": bool(res.get("quest_completed")),
        },
        "state": state_payload(fresh),
    }


def answer_followup(user_id: str, tz_hint: Optional[str], checkin_id: str, answer_text) -> dict:
    answer = str(answer_text or "").strip()[:500]
    if not answer:
        raise QuestError(422, "empty", "Write a line first.")
    res = _sb().rpc("quest_answer_followup", {
        "p_user_id": user_id, "p_checkin_id": checkin_id, "p_answer": answer,
        "p_bonus_xp": X.FOLLOWUP_XP,
    }).execute().data or {}
    if not res.get("ok"):
        raise QuestError(409, "no_followup", "That question has already been answered.")
    if not looks_thin(answer):
        # A real answer makes the check-in worth using in the portfolio draft.
        _sb().from_("quest_checkins").update({"thin": False}).eq("id", checkin_id) \
            .eq("user_id", user_id).execute()
    ctx = load(user_id, tz_hint, with_checkins=False)
    return {"xp_gained": X.FOLLOWUP_XP, "stats": _stats_payload(ctx)}


# ── Suggestions ───────────────────────────────────────────────────────────────

async def suggestions(user_id: str, tz_hint: Optional[str], refresh: bool) -> dict:
    ctx = load(user_id, tz_hint, include_recent=False, with_checkins=False)
    prof = _first(_sb().from_("profiles").select("quest_suggestions, quest_suggestions_key")
                  .eq("id", user_id).limit(1).execute().data or []) or {}
    cached = prof.get("quest_suggestions") if isinstance(prof.get("quest_suggestions"), list) else []
    record_text, record = student_context(user_id)
    key = record_key(record)

    def reply(items):
        return {"suggestions": items, "refreshes_left": _left(ctx, "suggest_refresh")}

    if not refresh and cached and prof.get("quest_suggestions_key") == key:
        return reply(cached)

    thin_record = not (record.get("activities") or record.get("awards")
                       or (record.get("profile") or {}).get("candidate_majors"))
    if thin_record and not refresh:
        return reply(cached or FALLBACK_SUGGESTIONS)

    kind = "suggest_refresh" if refresh else "suggest_auto"
    if not _spend(ctx, kind):
        if refresh:
            raise QuestError(429, "QUEST_BUDGET",
                             "You have used this month's 3 rounds of new ideas. You can still write your own.")
        return reply(cached or FALLBACK_SUGGESTIONS)

    try:
        fresh = await suggest_quests(record_text=record_text, record=record)
    except ModelUnavailable:
        fresh = None
    if not fresh:
        if refresh:
            _refund(ctx, kind)
        return reply(cached or FALLBACK_SUGGESTIONS)

    try:
        _sb().from_("profiles").update({
            "quest_suggestions": fresh, "quest_suggestions_key": key,
            "quest_suggestions_at": _iso_now(),
        }).eq("id", user_id).execute()
    except Exception as exc:
        logger.warning(f"[quest] could not cache suggestions for {user_id}: {exc}")
    return reply(fresh)


# ── Finishing: the portfolio entry ────────────────────────────────────────────

def _completed_quest(user_id: str, quest_id: str) -> dict:
    q = _first(_sb().from_("quests").select("*").eq("id", quest_id).eq("user_id", user_id)
               .limit(1).execute().data or [])
    if not q:
        raise QuestError(404, "no_quest", "That quest was not found.")
    if q["status"] != "completed":
        raise QuestError(409, "not_completed", "Finish the quest first.")
    return q


async def portfolio_draft(user_id: str, quest_id: str) -> dict:
    q = _completed_quest(user_id, quest_id)
    if isinstance(q.get("portfolio_draft"), dict) and q["portfolio_draft"]:
        return {"draft": q["portfolio_draft"]}
    milestones = (_sb().from_("quest_milestones").select("position, title").eq("quest_id", quest_id)
                  .eq("user_id", user_id).order("position").execute().data or [])
    checkins = (_sb().from_("quest_checkins").select("body, thin, followup_answer").eq("quest_id", quest_id)
                .eq("user_id", user_id).order("created_at").execute().data or [])
    text = await draft_activity(quest=q, milestones=milestones, checkins=checkins)
    draft = {
        **text,
        **computed_fields(q, S.clean_rest_days(q.get("rest_days")),
                          _date(q.get("start_date")), _date(q.get("ended_on"))),
        "grade_levels": [],    # never assumed: the student fills it in
    }
    _sb().from_("quests").update({"portfolio_draft": draft, "updated_at": _iso_now()}) \
        .eq("id", quest_id).eq("user_id", user_id).execute()
    return {"draft": draft}


async def portfolio_save(user_id: str, quest_id: str, fields: dict) -> dict:
    """Add the reviewed entry to the student's activities and link it."""
    from app.nodes.chat.tools import execute_chat_tool

    q = _completed_quest(user_id, quest_id)
    if q.get("portfolio_activity_id"):
        raise QuestError(409, "already_added", "This quest is already in your activities.")
    allowed = ("title", "category", "position", "organization", "description",
               "hours_per_week", "weeks_per_year", "timing", "grade_levels")
    args = {k: fields.get(k) for k in allowed if fields.get(k) not in (None, "")}
    if not args.get("title"):
        raise QuestError(422, "title_required", "The activity needs a name.")
    result = await execute_chat_tool(user_id, "add_portfolio_item", {"kind": "activity", **args})
    if not result.get("success") or not result.get("id"):
        raise QuestError(500, "save_failed", result.get("error") or "Could not add that. Try again.")
    _sb().from_("quests").update({"portfolio_activity_id": result["id"], "updated_at": _iso_now()}) \
        .eq("id", quest_id).eq("user_id", user_id).execute()
    return {"activity_id": result["id"], "title": result.get("title")}


def portfolio_dismiss(user_id: str, quest_id: str) -> dict:
    _completed_quest(user_id, quest_id)
    _sb().from_("quests").update({"add_to_portfolio": False, "updated_at": _iso_now()}) \
        .eq("id", quest_id).eq("user_id", user_id).execute()
    return {"ok": True}


# ── For the advisor chat ──────────────────────────────────────────────────────

def brief_for_chat(user_id: str, tz_name: Optional[str]) -> Optional[dict]:
    """The quest as the advisor sees it. None when there is nothing to say."""
    try:
        ctx = load(user_id, tz=tz_name)
    except Exception as exc:
        logger.warning(f"[quest] brief failed for {user_id}: {exc}")
        return None
    q = ctx.quest
    if not q or q["status"] == "draft":
        return None
    v = ctx.view
    streak, _ = _streak(ctx)
    current = v["current_milestone"]
    today_task = next((t for t in ctx.tasks if t["slot"] == v["today_slot"]), None) if v["today_slot"] else None
    deadline = _date(q.get("hard_deadline"))
    return {
        "title": q["title"], "summary": q.get("summary") or "", "status": q["status"],
        "daily_minutes": _int(q.get("daily_minutes"), 30),
        "rest_days": [DAY_NAMES[d] for d in S.clean_rest_days(q.get("rest_days"))],
        "hard_deadline": q.get("hard_deadline"),
        "deadline_risk": bool(deadline and v["projected_finish"] and v["projected_finish"] > deadline),
        "milestones": [
            {"position": m["position"], "title": m["title"], "description": m.get("description") or "",
             "days": m["expected_days"], "state": v["milestone_states"][i]}
            for i, m in enumerate(ctx.milestones)
        ],
        "current_milestone": ctx.milestones[current]["title"] if current is not None else None,
        "today_state": v["today_state"],
        "today_task": today_task["title"] if today_task else None,
        "backlog": len(v["owed"]),
        "streak": streak,
        "projected_finish": _iso(v["projected_finish"]),
        "nominal_finish": _iso(v["nominal_finish"]),
        "done": v["n"] - v["remaining"], "total": v["n"],
        "recent": [
            {"task": r["task_title"], "said": _clip(r["body"], 240)}
            for r in _recent_checkins(ctx, 5)
        ],
    }


def update_from_chat(user_id: str, tz_name: Optional[str], changes: dict) -> dict:
    ctx = load(user_id, tz=tz_name, with_checkins=False)
    if not ctx.quest or ctx.quest["status"] not in ("active", "paused"):
        return {"success": False, "error": "The student has no active or paused quest."}
    try:
        changed = apply_changes(ctx, changes, allow_structure=True)
    except QuestError as exc:
        return {"success": False, "error": exc.message}
    if not changed:
        return {"success": False, "error": "Nothing changed. Milestones that are done cannot be edited, "
                                           "and only milestones after the current one can change length."}
    return {"success": True, "kind": "quest", "title": ctx.quest["title"], "changed": changed}


def retire_from_chat(user_id: str, tz_name: Optional[str]) -> dict:
    try:
        q = _retire(load(user_id, tz=tz_name, with_checkins=False), None)
    except QuestError as exc:
        return {"success": False, "error": exc.message}
    return {"success": True, "kind": "quest", "title": q["title"], "changed": ["retired"]}
