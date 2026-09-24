"""
Quest schedule, streak and XP rules.

These are the rules a student notices first when they are wrong, so they are
tested against fixed calendars rather than trusted. Run from langgraph-service/:

    python3 -m pytest tests/

The streak arithmetic itself (+1 when alive, reset to 1 otherwise, once a day)
runs inside the quest_complete_task Postgres function. `checkin` below mirrors
that rule so the flows can be walked here; the function is exercised against
the real database separately.
"""
from datetime import date, datetime, timedelta, timezone

from app.nodes.quest import schedule as S
from app.nodes.quest import xp as X

MON = date(2026, 9, 21)          # a Monday
NY = "America/New_York"
UTC = timezone.utc


def d(offset: int) -> date:
    return MON + timedelta(days=offset)


def view(expected_days, done_on, today, *, segs=None, status="active", paused_on=None,
         start=MON, rest=()):
    return S.build_view(
        segments=segs if segs is not None else S.new_schedule(start, rest),
        expected_days=expected_days, done_on=done_on, today=today,
        status=status, paused_on=paused_on, start_date=start,
    )


def checkin(stats, today, on_time, alive):
    """Mirror of the streak rule in quest_complete_task."""
    streak, streak_date = stats
    if on_time and (streak_date is None or streak_date < today):
        return (streak + 1 if alive else 1), today
    return streak, streak_date


# ── Calendar ──────────────────────────────────────────────────────────────────

def test_weekday_convention_is_javascripts():
    assert S.js_weekday(d(0)) == 1      # Monday
    assert S.js_weekday(d(5)) == 6      # Saturday
    assert S.js_weekday(d(6)) == 0      # Sunday


def test_rest_days_are_whitelisted():
    assert S.clean_rest_days([7, -1, "2", 2, None, 0]) == [0, 2]
    assert S.clean_rest_days([0, 1, 2, 3, 4, 5, 6]) == [0, 1, 2, 3, 4, 5]   # always one work day
    assert S.clean_rest_days("weekends") == []


def test_slots_skip_rest_days():
    dates = S.slot_dates(S.new_schedule(MON, [0, 6]), 7)
    assert dates == [d(0), d(1), d(2), d(3), d(4), d(7), d(8)]


def test_every_day_when_there_are_no_rest_days():
    assert S.slot_dates(S.new_schedule(MON, []), 3) == [d(0), d(1), d(2)]


def test_quest_started_on_a_rest_day_begins_on_the_next_work_day():
    saturday = d(5)
    assert S.slot_dates(S.new_schedule(saturday, [0, 6]), 2) == [d(7), d(8)]
    v = view([3], {}, saturday, start=saturday, rest=[0, 6])
    assert v["today_state"] == "rest"
    assert v["next_work_date"] == d(7)
    assert v["owed"] == []


def test_milestone_bounds():
    bounds = S.milestone_bounds([3, 2, 4])
    assert bounds == [(1, 3), (4, 5), (6, 9)]
    assert S.milestone_of(bounds, 5) == 1
    assert S.milestone_of(bounds, 10) is None


# ── Time zones ────────────────────────────────────────────────────────────────

def test_late_evening_is_still_the_same_local_day():
    # 23:59 EDT on Sep 23 is already Sep 24 in UTC.
    assert S.local_today(NY, datetime(2026, 9, 24, 3, 59, tzinfo=UTC)) == date(2026, 9, 23)
    assert S.local_today(NY, datetime(2026, 9, 24, 4, 1, tzinfo=UTC)) == date(2026, 9, 24)


def test_west_coast_date_differs_from_utc():
    assert S.local_today("America/Los_Angeles", datetime(2026, 9, 24, 2, 0, tzinfo=UTC)) == date(2026, 9, 23)


def test_midnight_moves_when_daylight_saving_ends():
    # Nov 1 2026: EDT (UTC-4) becomes EST (UTC-5).
    assert S.local_today(NY, datetime(2026, 11, 1, 3, 59, tzinfo=UTC)) == date(2026, 10, 31)
    assert S.local_today(NY, datetime(2026, 11, 1, 4, 1, tzinfo=UTC)) == date(2026, 11, 1)
    assert S.local_today(NY, datetime(2026, 11, 2, 4, 30, tzinfo=UTC)) == date(2026, 11, 1)
    assert S.local_today(NY, datetime(2026, 11, 2, 5, 1, tzinfo=UTC)) == date(2026, 11, 2)


def test_midnight_moves_when_daylight_saving_starts():
    # Mar 8 2026: EST (UTC-5) becomes EDT (UTC-4).
    assert S.local_today(NY, datetime(2026, 3, 8, 4, 59, tzinfo=UTC)) == date(2026, 3, 7)
    assert S.local_today(NY, datetime(2026, 3, 8, 5, 1, tzinfo=UTC)) == date(2026, 3, 8)
    assert S.local_today(NY, datetime(2026, 3, 9, 3, 59, tzinfo=UTC)) == date(2026, 3, 8)
    assert S.local_today(NY, datetime(2026, 3, 9, 4, 1, tzinfo=UTC)) == date(2026, 3, 9)


def test_unknown_zone_falls_back_instead_of_crashing():
    now = datetime(2026, 9, 24, 3, 59, tzinfo=UTC)
    assert S.local_today("Not/AZone", now) == S.local_today(NY, now)
    assert S.local_today(None, now) == S.local_today(NY, now)
    assert S.valid_zone("America/Chicago") == "America/Chicago"
    assert S.valid_zone("../../etc/passwd") is None
    assert S.valid_zone("Not/AZone") is None
    assert S.valid_zone(42) is None


# ── The day's states ──────────────────────────────────────────────────────────

def test_fresh_quest():
    v = view([3, 3], {}, MON)
    assert v["today_slot"] == 1 and v["today_state"] == "open"
    assert v["owed"] == []
    assert [s["state"] for s in v["stones"][:2]] == ["today", "future"]
    assert v["stones"][0]["doable"] and not v["stones"][1]["doable"]
    assert v["milestone_states"] == ["current", "locked"]
    assert v["nominal_finish"] == v["projected_finish"] == d(5)


def test_missing_one_day():
    # Did Monday, missed Tuesday, it is Wednesday.
    v = view([5], {1: d(0)}, d(2))
    assert v["owed"] == [2]
    assert [s["state"] for s in v["stones"]] == ["done", "missed", "today", "future", "future"]
    assert v["today_state"] == "open"
    assert v["stones"][1]["doable"]                      # the missed day can be caught up
    assert v["nominal_finish"] == d(4)
    assert v["projected_finish"] == d(5)                 # the finish slides by one day
    assert v["catch_up_by"] == d(2)


def test_missed_day_breaks_the_streak_only_once_it_is_over():
    dates = S.slot_dates(S.new_schedule(MON, []), 5)
    assert S.streak_alive(d(0), d(1), dates)             # Tuesday is not over yet
    assert not S.streak_alive(d(0), d(2), dates)         # by Wednesday it was missed


def test_rest_days_never_break_the_streak():
    dates = S.slot_dates(S.new_schedule(MON, [0, 6]), 10)
    assert S.streak_alive(d(4), d(7), dates)             # Friday to Monday, weekend off


def test_a_catch_up_clears_backlog_and_earns_but_does_not_extend_the_streak():
    dates = S.slot_dates(S.new_schedule(MON, []), 5)
    # Monday on time, Tuesday missed, Tuesday's task done on Wednesday.
    assert not S.is_on_time(dates, 2, d(2))
    assert S.is_on_time(dates, 3, d(2))
    v = view([5], {1: d(0), 2: d(2)}, d(2))
    assert v["owed"] == []
    assert v["stones"][1]["state"] == "late"
    stats = checkin((1, d(0)), d(2), on_time=False, alive=S.streak_alive(d(0), d(2), dates))
    assert stats == (1, d(0))                            # untouched by the catch-up
    stats = checkin(stats, d(2), on_time=True, alive=S.streak_alive(d(0), d(2), dates))
    assert stats == (1, d(2))                            # reset: Tuesday was missed


def test_one_check_in_per_day_moves_the_streak():
    assert checkin((4, d(2)), d(2), on_time=True, alive=True) == (4, d(2))


# ── The gate ──────────────────────────────────────────────────────────────────

def test_backlog_at_a_boundary_locks_the_next_milestone_and_today():
    # Two milestones of three days. Did Monday only; it is Thursday (slot 4).
    v = view([3, 3], {1: d(0)}, d(3))
    assert v["current_milestone"] == 0
    assert v["milestone_states"] == ["current", "locked"]
    assert v["owed"] == [2, 3] and v["owed_in_current"] == [2, 3]
    assert v["today_slot"] == 4 and v["today_state"] == "blocked"
    assert not v["stones"][3]["doable"]
    assert v["stones"][1]["doable"] and v["stones"][2]["doable"]


def test_clearing_the_backlog_unlocks_today_the_same_day_and_the_streak_survives():
    # Mon done, Tue missed, Wed done on time (streak restarted at 1). Thursday:
    # slot 4 opens milestone 2, but Tuesday is still owed.
    done = {1: d(0), 3: d(2)}
    v = view([3, 3], done, d(3))
    assert v["today_state"] == "blocked" and v["owed"] == [2]
    alive = S.streak_alive(d(2), d(3), v["dates"])
    assert alive
    stats = (1, d(2))

    done[2] = d(3)                                       # catch up Tuesday's task
    v = view([3, 3], done, d(3))
    assert v["milestone_states"] == ["done", "current"]
    assert v["today_state"] == "open" and v["stones"][3]["doable"]
    stats = checkin(stats, d(3), on_time=S.is_on_time(v["dates"], 2, d(3)), alive=alive)
    stats = checkin(stats, d(3), on_time=S.is_on_time(v["dates"], 4, d(3)), alive=alive)
    assert stats == (2, d(3))


def test_leaving_the_gate_blocked_breaks_the_streak_the_next_day():
    v = view([3, 3], {1: d(0), 3: d(2)}, d(4))
    assert not S.streak_alive(d(2), d(4), v["dates"])    # Thursday passed unkept


# ── Across quests and pauses ──────────────────────────────────────────────────

def test_streak_carries_across_quests_and_empty_days_do_not_count():
    # Quest A finished on time on Wednesday. No quest Thu-Sun. Quest B starts Monday.
    b_dates = S.slot_dates(S.new_schedule(d(7), []), 5)
    assert S.streak_alive(d(2), d(7), b_dates)
    assert checkin((3, d(2)), d(7), on_time=S.is_on_time(b_dates, 1, d(7)), alive=True) == (4, d(7))


def test_pause_days_are_not_owed_and_resuming_relays_the_rest():
    segs = S.new_schedule(MON, [])
    done = {1: d(0), 2: d(1)}
    paused = view([5], done, d(4), segs=segs, status="paused", paused_on=d(2))
    assert paused["owed"] == [] and paused["today_state"] == "paused"
    assert [s["state"] for s in paused["stones"]] == ["done", "done", "future", "future", "future"]
    counted = S.counted_dates(paused["dates"], "paused", d(2))
    assert S.streak_alive(d(1), d(4), counted)           # the pause does not break it

    from_slot = S.relay_from(paused["dates"], set(done), d(2))
    assert from_slot == 3
    segs = S.rebase(segs, 5, from_slot, d(5), [])        # resume on Saturday
    v = view([5], done, d(5), segs=segs)
    assert v["dates"] == [d(0), d(1), d(5), d(6), d(7)]
    assert v["owed"] == [] and v["today_slot"] == 3
    assert S.streak_alive(d(1), d(5), v["dates"])


def test_pausing_after_doing_today_keeps_today_in_place():
    segs = S.new_schedule(MON, [])
    done = {1: d(0), 2: d(1), 3: d(2)}
    dates = S.slot_dates(segs, 5)
    from_slot = S.relay_from(dates, set(done), d(2))
    assert from_slot == 4
    dates = S.slot_dates(S.rebase(segs, 5, from_slot, d(2), []), 5)
    assert dates[:3] == [d(0), d(1), d(2)] and dates[3] == d(3)


def test_changing_rest_days_never_moves_a_day_that_already_happened():
    segs = S.new_schedule(MON, [])
    done = {1: d(0), 2: d(1), 3: d(2)}
    before = S.slot_dates(segs, 10)
    from_slot = S.relay_from(before, set(done), d(2))
    after = S.slot_dates(S.rebase(segs, 10, from_slot, d(2), [0, 6]), 10)
    assert after[:3] == before[:3]
    assert after[3:] == [d(3), d(4), d(7), d(8), d(9), d(10), d(11)]


def test_relaying_with_unchanged_rules_is_a_no_op():
    segs = S.new_schedule(MON, [0, 6])
    before = S.slot_dates(segs, 12)
    for today in (d(0), d(3), d(5), d(9)):
        from_slot = S.relay_from(before, set(), today)
        assert S.slot_dates(S.rebase(segs, 12, from_slot, today, [0, 6]), 12) == before


def test_count_it_as_a_break_relays_the_gap_but_the_streak_must_be_settled_first():
    # Did Monday, then gone until the following Wednesday (8 days owed).
    segs = S.new_schedule(MON, [])
    done = {1: d(0)}
    v = view([10], done, d(9), segs=segs)
    assert v["welcome_back"] and v["offer_break"]
    assert v["gap"] == [2, 3, 4, 5, 6, 7, 8, 9]
    assert not S.streak_alive(d(0), d(9), v["dates"])    # dead: this is what gets stored

    segs = S.rebase(segs, 10, v["last_done_slot"] + 1, d(9), [])
    v = view([10], done, d(9), segs=segs)
    assert v["owed"] == [] and v["today_slot"] == 2
    # The relaid schedule alone would bring the streak back, which is exactly
    # why the service writes 0 before any rebase.
    assert S.streak_alive(d(0), d(9), v["dates"])


def test_every_slot_already_reached():
    segs = S.new_schedule(MON, [])
    dates = S.slot_dates(segs, 3)
    assert S.relay_from(dates, {1, 2, 3}, d(5)) == 4
    grown = S.rebase(segs, 3, 4, d(5), [])
    assert S.slot_dates(grown, 3) == dates               # nothing moved
    assert S.slot_dates(grown, 5)[3:] == [d(5), d(6)]    # added days start from today


def test_a_hand_edited_schedule_cannot_send_dates_backwards():
    segs = [{"slot": 1, "date": MON.isoformat(), "rest": []},
            {"slot": 3, "date": (MON - timedelta(days=10)).isoformat(), "rest": []}]
    dates = S.slot_dates(segs, 4)
    assert dates == sorted(dates) and len(set(dates)) == 4


# ── Welcome back ──────────────────────────────────────────────────────────────

def test_welcome_back_thresholds():
    assert not view([10], {1: d(0)}, d(1))["welcome_back"]                    # nothing missed yet
    v = view([10], {1: d(0)}, d(2))
    assert v["welcome_back"] and not v["offer_break"]                         # one day behind
    assert view([10], {1: d(0)}, d(8))["offer_break"]                         # seven days behind
    full_week = {1: d(0), 2: d(1), 3: d(2), 4: d(3), 5: d(4)}
    assert not view([10], full_week, d(7), rest=[0, 6])["welcome_back"]       # a weekend off


# ── Projected finish ──────────────────────────────────────────────────────────

def test_projected_finish_slides_with_backlog_and_respects_rest_days():
    wk = [0, 6]
    on_track = view([10], {1: d(0)}, d(1), rest=wk)
    assert on_track["nominal_finish"] == on_track["projected_finish"] == d(11)

    one_behind = view([10], {}, d(1), rest=wk)
    assert one_behind["owed"] == [1]
    assert one_behind["projected_finish"] == d(14)                            # the next Monday

    many_behind = view([10], {}, d(4), rest=wk)
    assert many_behind["owed"] == [1, 2, 3, 4]
    assert many_behind["projected_finish"] == d(17)

    done_today = view([10], {1: d(0), 2: d(1)}, d(1), rest=wk)
    assert done_today["today_state"] == "done"
    assert done_today["projected_finish"] == d(11)


def test_a_finished_or_retired_quest_has_no_today():
    v = view([2], {1: d(0), 2: d(1)}, d(3), status="completed")
    assert v["today_state"] == "none" and v["projected_finish"] is None
    assert not any(s["doable"] for s in v["stones"])


# ── XP ────────────────────────────────────────────────────────────────────────

def test_level_curve():
    assert [X.level_for(x) for x in (0, 49, 50, 149, 150, 299, 300, 500, 750)] == [1, 1, 2, 2, 3, 3, 4, 5, 6]
    assert X.level_for(-20) == 1
    assert X.level_progress(60) == {
        "xp": 60, "level": 2, "into_level": 10, "level_span": 100, "next_level_at": 150,
    }


def test_catch_up_pays_the_same_as_on_time():
    # Nothing in the award depends on timing: the task amount is flat.
    assert X.TASK_XP == 10 and X.MILESTONE_XP > X.TASK_XP and X.QUEST_XP > X.MILESTONE_XP
