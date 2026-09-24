"""
Quest scheduling: pure functions, no I/O, no clock.

Everything the student notices first when it is wrong lives here: which day a
task belongs to, what counts as missed, when a milestone unlocks, and whether
the streak is still alive. Callers pass "today" in explicitly (the student's
local date, worked out by the service from profiles.timezone), so every rule
can be tested against any calendar without faking time.

The model
---------
A quest has N day-slots, N being the sum of its milestones' expected_days.
Slots are laid onto the student's work days (every day except their rest days)
by a list of segments stored on the quest:

    [{"slot": 1, "date": "2026-09-23", "rest": [0, 6]}, {"slot": 9, ...}]

Slot k belongs to the last segment whose "slot" is <= k, and falls on that
segment's (k - seg.slot + 1)-th work day on or after seg.date. A missed slot is
still owed and nothing shifts: that is the whole backlog mechanic. When the pace
changes or a pause ends, a new segment is appended from the first slot that has
not been reached yet, so a day that has already happened never moves.

Weekdays use the JavaScript convention, 0 = Sunday ... 6 = Saturday, because
that is what the rest-day picker produces and what the database stores.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

ONE_DAY = timedelta(days=1)

# Used only when a student's browser never reported a zone. The product is for
# US high schoolers, and UTC midnight would end their day at 7 or 8pm.
DEFAULT_TZ = "America/New_York"


# ── Time zones ────────────────────────────────────────────────────────────────

def zone(name) -> ZoneInfo:
    try:
        return ZoneInfo(str(name)) if name else ZoneInfo(DEFAULT_TZ)
    except Exception:  # unknown name, or something that is not a zone name at all
        return ZoneInfo(DEFAULT_TZ)


def valid_zone(name) -> Optional[str]:
    """The name if it is a real IANA zone, else None."""
    if not isinstance(name, str) or not name or len(name) > 64:
        return None
    try:
        ZoneInfo(name)
        return name
    except Exception:
        return None


def local_today(tz_name, now_utc: datetime) -> date:
    """The student's calendar date at the instant now_utc."""
    return now_utc.astimezone(zone(tz_name)).date()


# ── Calendar helpers ──────────────────────────────────────────────────────────

def js_weekday(d: date) -> int:
    """Python counts Monday as 0; JavaScript (and our data) counts Sunday as 0."""
    return (d.weekday() + 1) % 7


def clean_rest_days(raw) -> list[int]:
    """Whitelist 0-6, dedupe, sort. At most six: a quest needs a day to happen on."""
    if not isinstance(raw, (list, tuple, set)):
        return []
    out = set()
    for v in raw:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if 0 <= iv <= 6:
            out.add(iv)
    days = sorted(out)
    return days[:6]


def is_work_day(d: date, rest: Iterable[int]) -> bool:
    return js_weekday(d) not in set(rest)


def next_work_day(d: date, rest: Iterable[int]) -> date:
    """The first work day on or after d."""
    rest = clean_rest_days(list(rest))
    while js_weekday(d) in rest:
        d += ONE_DAY
    return d


def nth_work_day(start: date, n: int, rest: Iterable[int]) -> date:
    """The n-th work day on or after start (n >= 1)."""
    d = next_work_day(start, rest)
    for _ in range(n - 1):
        d = next_work_day(d + ONE_DAY, rest)
    return d


def work_days_between(start: date, end: date, rest: Iterable[int]) -> int:
    """Work days from start to end, both inclusive."""
    rest = clean_rest_days(list(rest))
    count, d = 0, start
    while d <= end:
        if js_weekday(d) not in rest:
            count += 1
        d += ONE_DAY
    return count


def _parse_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


# ── Segments → dates ──────────────────────────────────────────────────────────

def new_schedule(start: date, rest) -> list[dict]:
    return [{"slot": 1, "date": start.isoformat(), "rest": clean_rest_days(rest)}]


def _normalise(segments) -> list[dict]:
    segs = []
    for s in segments or []:
        try:
            segs.append({"slot": max(1, int(s["slot"])), "date": _parse_date(s["date"]),
                         "rest": clean_rest_days(s.get("rest"))})
        except (KeyError, TypeError, ValueError):
            continue
    segs.sort(key=lambda s: s["slot"])
    if segs:
        segs[0]["slot"] = 1   # slot 1 always has a segment, even in a hand-edited schedule
    return segs


def slot_dates(segments, n: int) -> list[date]:
    """Dates for slots 1..n (index 0 is slot 1)."""
    segs = _normalise(segments)
    if n <= 0 or not segs:
        return []
    out: list[date] = []
    for i, seg in enumerate(segs):
        end = (segs[i + 1]["slot"] - 1) if i + 1 < len(segs) else n
        end = min(end, n)
        # A segment always begins after the previous one's last day, but guard
        # against a hand-edited schedule so dates can never go backwards.
        d = seg["date"] if not out else max(seg["date"], out[-1] + ONE_DAY)
        k = len(out) + 1
        while k <= end:
            d = next_work_day(d, seg["rest"])
            out.append(d)
            d += ONE_DAY
            k += 1
        if len(out) >= n:
            break
    return out[:n]


def current_rest(segments) -> list[int]:
    segs = _normalise(segments)
    return segs[-1]["rest"] if segs else []


def relay_from(dates: list[date], done_slots: set[int], cut: date) -> int:
    """The first slot that has not been reached as of `cut`.

    Slots dated before `cut` keep their dates (they have happened, missed or
    not), and so does a slot on `cut` that is already done. Returns len+1 when
    every slot has been reached.
    """
    k = 0
    for i, d in enumerate(dates, start=1):
        if d < cut or i in done_slots:
            k = i
        else:
            break
    return k + 1


def rebase(segments, n: int, from_slot: int, new_start: date, rest) -> list[dict]:
    """Keep slots before from_slot where they are; lay from_slot onward again,
    starting no earlier than new_start and never on or before the last kept day."""
    rest = clean_rest_days(rest)
    kept_dates = slot_dates(segments, max(0, min(n, from_slot - 1)))
    start = new_start
    if kept_dates:
        start = max(new_start, kept_dates[-1] + ONE_DAY)
    kept = [
        {"slot": s["slot"], "date": s["date"].isoformat(), "rest": s["rest"]}
        for s in _normalise(segments) if s["slot"] < from_slot
    ]
    return kept + [{"slot": from_slot, "date": start.isoformat(), "rest": rest}]


# ── Milestones ────────────────────────────────────────────────────────────────

def milestone_bounds(expected_days: list[int]) -> list[tuple[int, int]]:
    """Inclusive (first_slot, last_slot) per milestone, in order."""
    out, first = [], 1
    for days in expected_days:
        days = max(1, int(days))
        out.append((first, first + days - 1))
        first += days
    return out


def milestone_of(bounds: list[tuple[int, int]], slot: int) -> Optional[int]:
    for i, (a, b) in enumerate(bounds):
        if a <= slot <= b:
            return i
    return None


# ── Streak ────────────────────────────────────────────────────────────────────

def is_on_time(dates: list[date], slot: int, today: date) -> bool:
    """A check-in counts for the streak only on the slot's own day. Catch-ups
    clear the backlog and earn XP, but do not extend the streak."""
    return 1 <= slot <= len(dates) and dates[slot - 1] == today


def streak_alive(streak_date: Optional[date], today: date, counted_dates: Iterable[date]) -> bool:
    """Whether the stored streak survives to today.

    streak_date is the last day an on-time check-in extended the streak. Any
    scheduled day strictly between then and today must have been missed (an
    on-time check-in on it would have moved streak_date forward), so the
    streak is alive exactly when there is no such day. Today itself never
    counts against it: the day is not over.
    """
    if streak_date is None:
        return True
    return not any(streak_date < d < today for d in counted_dates)


def counted_dates(dates: list[date], status: str, paused_on: Optional[date]) -> list[date]:
    """The days of the current quest that can break a streak. A paused quest's
    remaining days are not real yet: they move when it resumes."""
    if status == "paused" and paused_on is not None:
        return [d for d in dates if d < paused_on]
    if status in ("active", "paused"):
        return list(dates)
    return []


# ── The view ──────────────────────────────────────────────────────────────────

def build_view(
    *,
    segments,
    expected_days: list[int],
    done_on: dict[int, date],
    today: date,
    status: str,
    paused_on: Optional[date] = None,
    start_date: Optional[date] = None,
) -> dict:
    """Everything the map needs, derived from the schedule and what is done.

    done_on maps slot -> the local date it was checked in.
    """
    n = sum(max(1, int(d)) for d in expected_days)
    dates = slot_dates(segments, n)
    bounds = milestone_bounds(expected_days)
    done = set(done_on)

    # The first milestone with anything left is the one that is open. Every
    # later one is locked until it is finished: that is the gate.
    current = None
    for i, (a, b) in enumerate(bounds):
        if any(s not in done for s in range(a, b + 1)):
            current = i
            break

    live = status == "active"
    as_of = paused_on if (status == "paused" and paused_on) else today

    stones = []
    owed: list[int] = []
    today_slot = None
    for slot, d in enumerate(dates, start=1):
        m = milestone_of(bounds, slot)
        if slot in done:
            state = "done" if done_on[slot] <= d else "late"
        elif d < as_of:
            state = "missed"
            owed.append(slot)
        elif live and d == today:
            state = "today"
        else:
            state = "future"
        if live and d == today:
            today_slot = slot
        unlocked = current is not None and m == current
        doable = live and slot not in done and d <= today and unlocked
        stones.append({
            "slot": slot, "date": d.isoformat(), "milestone": m,
            "state": state, "doable": doable,
        })

    milestones = []
    for i in range(len(bounds)):
        if current is None or i < current:
            ms_state = "done"
        elif i == current:
            ms_state = "current"
        else:
            ms_state = "locked"
        milestones.append(ms_state)

    # Today, in one word, for the nav chip and the map's callout.
    if status == "paused":
        today_state = "paused"
    elif not live:
        today_state = "none"
    elif today_slot is None:
        today_state = "rest"
    elif today_slot in done:
        today_state = "done"
    elif stones[today_slot - 1]["doable"]:
        today_state = "open"
    else:
        today_state = "blocked"

    owed_in_current = [s for s in owed if current is not None and milestone_of(bounds, s) == current]
    rest_now = current_rest(segments)

    remaining = n - len(done)
    projected = None
    catch_up_by = None
    if live and remaining > 0:
        start = today
        if today_slot is not None and today_slot in done:
            start = today + ONE_DAY
        elif not is_work_day(today, rest_now):
            start = next_work_day(today, rest_now)
        projected = nth_work_day(start, remaining, rest_now)
        if owed:
            # Doing today's task plus one catch-up each day clears one owed task
            # per work day.
            catch_up_by = nth_work_day(start, len(owed), rest_now)

    last_done_slot = max(done) if done else 0
    last_active = max(done_on.values()) if done_on else start_date
    gap = [s for s in owed if s > last_done_slot]
    welcome_back = bool(
        live and owed and last_active is not None and (today - last_active).days >= 2
    )

    next_day = None
    if live and today_state in ("rest", "done") and remaining > 0:
        upcoming = [d for d in dates if d > today]
        next_day = upcoming[0] if upcoming else None

    return {
        "n": n,
        "dates": dates,
        "bounds": bounds,
        "stones": stones,
        "milestone_states": milestones,
        "current_milestone": current,
        "today_slot": today_slot,
        "today_state": today_state,
        "owed": owed,
        "owed_in_current": owed_in_current,
        "remaining": remaining,
        "nominal_finish": dates[-1] if dates else None,
        "projected_finish": projected,
        "catch_up_by": catch_up_by,
        "last_done_slot": last_done_slot,
        "last_active": last_active,
        "gap": gap,
        "welcome_back": welcome_back,
        "offer_break": welcome_back and len(gap) >= 7,
        "next_work_date": next_day,
        "rest_days": rest_now,
    }
