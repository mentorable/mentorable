"""In-memory stand-in for the supabase-py client, for the flow tests.

Implements the query-builder subset the code uses, the unique constraints that
matter (one open quest, one task per slot, one check-in per task, one memory per
dedupe key), ON DELETE CASCADE for quests, and Python mirrors of the Quest SQL
functions and of the memory ones (recall_memories through rank.py, and the
guarded saves). These are mirrors: they let the Python around the database be
tested, and say nothing about the SQL itself.
"""
import copy
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace as NS

DEFAULTS = {
    "quests": {"summary": "", "goal_kind": "other", "status": "draft", "daily_minutes": 30,
               "rest_days": [], "schedule": [], "start_date": None, "paused_on": None, "ended_on": None,
               "hard_deadline": None, "add_to_portfolio": True, "portfolio_draft": None,
               "portfolio_activity_id": None, "started_at": None, "completed_at": None, "direction": ""},
    "quest_milestones": {"description": "", "status": "pending", "completed_at": None},
    "quest_tasks": {"detail": "", "est_minutes": 15, "fallback": False, "status": "open", "done_on": None,
                    "resources": None, "resources_at": None},
    "quest_checkins": {"advisor_reply": "", "followup": None, "followup_answer": None, "thin": False,
                       "on_time": False, "xp_awarded": 0},
    "quest_stats": {"xp": 0, "streak": 0, "streak_date": None, "best_streak": 0},
    "student_activities": {},
}
OPEN = {"draft", "active", "paused"}
DEV_EMAILS = {"app.mentora.ai@gmail.com"}


def _instant(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


STOP = {"a", "an", "the", "and", "or", "but", "i", "my", "me", "to", "of", "in", "on", "at", "for", "is", "it",
        "was", "so", "we", "our", "with", "about", "what", "did", "do", "you", "your", "she", "her", "he", "his"}


def crude_lexemes(text):
    """A stand-in for to_tsvector('english'): lowercase words minus stopwords,
    trailing s dropped. Only has to be consistent with itself here."""
    import re
    words = re.findall(r"[a-z0-9']+", (text or "").lower())
    out = []
    for w in words:
        w = w.replace("'", "")
        if w in STOP or len(w) < 2:
            continue
        if len(w) > 3 and w.endswith("s"):
            w = w[:-1]
        if w not in out:
            out.append(w)
    return sorted(out)


class Violation(Exception):
    pass


class FakeDB:
    def __init__(self):
        self.t = {k: [] for k in ["profiles", "quests", "quest_milestones", "quest_tasks", "quest_checkins",
                                  "quest_stats", "quest_usage", "student_activities", "student_awards",
                                  "student_courses", "student_test_scores", "student_memories",
                                  "chat_sessions"]}
        self.emails = {}
        self.calls = []

    def from_(self, table):
        return Query(self, table)

    def rpc(self, fn, params):
        return RPC(self, fn, params)

    # constraint checks
    def check(self, table, row, ignore_id=None):
        rows = [r for r in self.t[table] if r.get("id") != ignore_id]
        if table == "quests" and row.get("status") in OPEN:
            if any(r["user_id"] == row["user_id"] and r["status"] in OPEN for r in rows):
                raise Violation("duplicate key value violates unique constraint quests_one_open_per_user")
        if table == "quest_tasks":
            if any(r["quest_id"] == row["quest_id"] and r["slot"] == row["slot"] for r in rows):
                raise Violation("duplicate key quest_tasks_quest_id_slot_key")
        if table == "quest_checkins":
            if any(r["task_id"] == row["task_id"] for r in rows):
                raise Violation("duplicate key quest_checkins_task_id_key")
        if table == "student_memories":
            if any(r["user_id"] == row["user_id"] and r["dedupe_key"] == row["dedupe_key"] for r in rows):
                raise Violation("duplicate key student_memories_user_id_dedupe_key_key")
            if row.get("source") not in ("chat", "checkin", "followup") or not (1 <= len(row.get("body") or "") <= 500):
                raise Violation("check constraint on student_memories")
            if len(row.get("embedding") or []) != 1536:
                raise Violation("expected 1536 dimensions")
        if table == "quest_milestones":
            if any(r["quest_id"] == row["quest_id"] and r["position"] == row["position"] for r in rows):
                raise Violation("duplicate key quest_milestones_quest_id_position_key")

    def cascade(self, table, deleted):
        if table == "quests":
            ids = {r["id"] for r in deleted}
            for child in ("quest_milestones", "quest_tasks", "quest_checkins"):
                self.t[child] = [r for r in self.t[child] if r.get("quest_id") not in ids]


def _match(row, filters):
    for col, op, val in filters:
        v = row.get(col)
        if op == "eq" and not (str(v) == str(val) if v is not None else val is None):
            return False
        if op == "neq" and str(v) == str(val):
            return False
        if op == "in" and v not in val:
            return False
        if op == "is" and v is not None:
            return False
        if op == "gte" and not (v is not None and v >= val):
            return False
        if op == "lt" and not (v is not None and str(v) < str(val)):
            return False
    return True


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters, self.orders, self.n = [], [], None
        self.action, self.payload, self.opts = "select", None, {}
        self._single = False

    def select(self, *a, **k):
        return self

    def eq(self, c, v):
        self.filters.append((c, "eq", v)); return self

    def neq(self, c, v):
        self.filters.append((c, "neq", v)); return self

    def in_(self, c, v):
        self.filters.append((c, "in", list(v))); return self

    def is_(self, c, v):
        self.filters.append((c, "is", v)); return self

    def gte(self, c, v):
        self.filters.append((c, "gte", v)); return self

    def lt(self, c, v):
        self.filters.append((c, "lt", v)); return self

    def order(self, c, desc=False, **k):
        self.orders.append((c, desc)); return self

    def limit(self, n):
        self.n = n; return self

    def single(self):
        self._single = True; return self

    def maybe_single(self):
        self._single = "maybe"; return self

    def insert(self, payload, **k):
        self.action, self.payload = "insert", payload; return self

    def upsert(self, payload, on_conflict="", ignore_duplicates=False, **k):
        self.action, self.payload = "upsert", payload
        self.opts = {"on_conflict": on_conflict, "ignore": ignore_duplicates}; return self

    def update(self, payload, **k):
        self.action, self.payload = "update", payload; return self

    def delete(self, **k):
        self.action = "delete"; return self

    def _rows(self):
        return [r for r in self.db.t[self.table] if _match(r, self.filters)]

    def execute(self):
        db, t = self.db, self.table
        db.calls.append((t, self.action))
        if self.action == "select":
            rows = self._rows()
            for c, desc in reversed(self.orders):
                present = sorted([r for r in rows if r.get(c) is not None], key=lambda r: r[c], reverse=desc)
                rows = present + [r for r in rows if r.get(c) is None]
            if self.n is not None:
                rows = rows[: self.n]
            rows = copy.deepcopy(rows)
            if self._single == "maybe":
                return NS(data=rows[0]) if rows else None
            if self._single:
                if len(rows) != 1:
                    raise Exception("single(): expected one row")
                return NS(data=rows[0])
            return NS(data=rows)
        if self.action in ("insert", "upsert"):
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            staged = []
            for item in items:
                row = {**DEFAULTS.get(t, {}), **copy.deepcopy(item)}
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                if t == "student_memories":
                    row.setdefault("context", "")
                    row["lexemes"] = crude_lexemes(row.get("context", "") + " " + row.get("body", ""))
                try:
                    db.check(t, row)
                except Violation:
                    if self.action == "upsert" and self.opts.get("ignore"):
                        continue
                    raise
                staged.append(row)
            db.t[t].extend(staged)
            out = copy.deepcopy(staged)
            return NS(data=out)
        if self.action == "update":
            rows = self._rows()
            for r in rows:
                new = {**r, **copy.deepcopy(self.payload)}
                db.check(t, new, ignore_id=r.get("id"))
                r.update(copy.deepcopy(self.payload))
            return NS(data=copy.deepcopy(rows))
        if self.action == "delete":
            rows = self._rows()
            db.t[t] = [r for r in db.t[t] if r not in rows]
            db.cascade(t, rows)
            return NS(data=copy.deepcopy(rows))
        raise AssertionError(self.action)


class RPC:
    def __init__(self, db, fn, params):
        self.db, self.fn, self.p = db, fn, params

    def execute(self):
        self.db.calls.append(("rpc", self.fn))
        return NS(data=getattr(self, "_" + self.fn)(**self.p))

    # ── mirrors of the SQL functions ──
    def _recall_memories(self, p_user_id, p_embedding, p_query, p_limit=5, p_min_similarity=0.30,
                         p_text_min_matches=2, p_rrf_k=60, p_recency_weight=0.10, p_recency_days=45.0,
                         p_exclude_key=None, p_now=None):
        from app.nodes.recall import rank as R
        now = datetime.now(timezone.utc)
        rows = []
        for r in self.db.t["student_memories"]:
            if r["user_id"] != p_user_id:
                continue
            created = datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00"))
            rows.append({**r, "created_at": created})
        settings = R.RecallSettings(min_similarity=p_min_similarity, text_min_matches=p_text_min_matches,
                                    rrf_k=p_rrf_k, recency_weight=p_recency_weight, recency_days=p_recency_days)
        got = R.rank(rows, p_embedding, crude_lexemes(p_query), now=now, settings=settings,
                     limit=p_limit, exclude_key=p_exclude_key)
        return [{"id": g["id"], "body": g["body"], "context": g.get("context", ""), "source": g["source"],
                 "quest_id": g.get("quest_id"), "created_at": g["created_at"].isoformat(),
                 "similarity": g["similarity"], "matched": g["matched"], "score": g["score"]} for g in got]

    def _guard_ok(self, p_user_id, p_started):
        """The switch and the "cleared since" check the SQL save functions make."""
        prof = next((p for p in self.db.t["profiles"] if p["id"] == p_user_id), None)
        if not prof or prof.get("memory_enabled") is False:
            return None
        cleared = prof.get("memory_cleared_at")
        if cleared and _instant(cleared) > _instant(p_started):
            return None
        return prof

    def _save_student_memories(self, p_user_id, p_rows, p_started, p_keep=1500):
        if self._guard_ok(p_user_id, p_started) is None:
            return False
        rows = []
        for r in p_rows:
            row = {**r, "user_id": p_user_id}
            if row.get("created_at") is None:
                row.pop("created_at", None)
            rows.append(row)
        Query(self.db, "student_memories").upsert(rows, on_conflict="user_id,dedupe_key", ignore_duplicates=True).execute()
        self._prune_student_memories(p_user_id, p_keep)
        return True

    def _append_chat_signal(self, p_user_id, p_note, p_started, p_max=20):
        prof = self._guard_ok(p_user_id, p_started)
        if prof is None:
            return False
        current = prof.get("chat_signals") if isinstance(prof.get("chat_signals"), list) else []
        prof["chat_signals"] = [*current, p_note][-max(1, p_max):]
        return True

    def _prune_student_memories(self, p_user_id, p_keep):
        mine = [r for r in self.db.t["student_memories"] if r["user_id"] == p_user_id]
        mine.sort(key=lambda r: (str(r["created_at"]), r["id"]), reverse=True)
        doomed = {r["id"] for r in mine[max(0, p_keep):]}
        self.db.t["student_memories"] = [r for r in self.db.t["student_memories"] if r["id"] not in doomed]
        return len(doomed)

    def _quest_bump_usage(self, p_user_id, p_kind, p_bucket, p_limit):
        if self.db.emails.get(p_user_id) in DEV_EMAILS:
            return {"allowed": True, "used": 0, "limit": p_limit}
        rows = self.db.t["quest_usage"]
        row = next((r for r in rows if r["user_id"] == p_user_id and r["kind"] == p_kind and r["bucket"] == p_bucket), None)
        if row is None:
            row = {"user_id": p_user_id, "kind": p_kind, "bucket": p_bucket, "used": 0}
            rows.append(row)
        if row["used"] >= p_limit:
            return {"allowed": False, "used": row["used"], "limit": p_limit}
        row["used"] += 1
        return {"allowed": True, "used": row["used"], "limit": p_limit}

    def _quest_refund_usage(self, p_user_id, p_kind, p_bucket):
        for r in self.db.t["quest_usage"]:
            if r["user_id"] == p_user_id and r["kind"] == p_kind and r["bucket"] == p_bucket:
                r["used"] = max(0, r["used"] - 1)
        return None

    def _quest_complete_task(self, p_user_id, p_task_id, p_body, p_thin, p_today, p_on_time,
                             p_streak_alive, p_task_xp, p_milestone_xp, p_quest_xp):
        db = self.db
        task = next((t for t in db.t["quest_tasks"] if t["id"] == p_task_id and t["user_id"] == p_user_id), None)
        if not task:
            return {"ok": False, "error": "not_found"}
        if task["status"] == "done":
            c = next((c for c in db.t["quest_checkins"] if c["task_id"] == task["id"]), None)
            return {"ok": True, "already": True, "checkin_id": c["id"] if c else None}
        q = next((q for q in db.t["quests"] if q["id"] == task["quest_id"] and q["user_id"] == p_user_id), None)
        if not q or q["status"] != "active":
            return {"ok": False, "error": "not_active"}
        cid = str(uuid.uuid4())
        db.t["quest_checkins"].append({**DEFAULTS["quest_checkins"], "id": cid, "user_id": p_user_id,
                                       "quest_id": task["quest_id"], "task_id": task["id"], "body": p_body,
                                       "thin": p_thin, "on_time": p_on_time,
                                       "created_at": datetime.now(timezone.utc).isoformat() + f"-{len(db.t['quest_checkins']):05d}"})
        task["status"], task["done_on"] = "done", p_today
        xp = p_task_xp
        ms = next(m for m in db.t["quest_milestones"] if m["id"] == task["milestone_id"])
        done_count = sum(1 for t in db.t["quest_tasks"] if t["milestone_id"] == ms["id"] and t["status"] == "done")
        ms_completed = q_completed = False
        if done_count >= ms["expected_days"] and ms["status"] != "done":
            ms["status"], ms["completed_at"] = "done", datetime.now(timezone.utc).isoformat()
            ms_completed = True
            xp += p_milestone_xp
        if ms_completed:
            remaining = sum(1 for m in db.t["quest_milestones"] if m["quest_id"] == q["id"] and m["status"] != "done")
            if remaining == 0 and q["status"] == "active":
                q["status"], q["ended_on"] = "completed", p_today
                q["completed_at"] = datetime.now(timezone.utc).isoformat()
                q_completed = True
                xp += p_quest_xp
        stats = next((s for s in db.t["quest_stats"] if s["user_id"] == p_user_id), None)
        if stats is None:
            stats = {**DEFAULTS["quest_stats"], "user_id": p_user_id}
            db.t["quest_stats"].append(stats)
        new_streak, new_date = stats["streak"], stats["streak_date"]
        if p_on_time and (stats["streak_date"] is None or stats["streak_date"] < p_today):
            new_streak = stats["streak"] + 1 if p_streak_alive else 1
            new_date = p_today
        stats.update(xp=stats["xp"] + xp, streak=new_streak, streak_date=new_date,
                     best_streak=max(stats["best_streak"], new_streak))
        next(c for c in db.t["quest_checkins"] if c["id"] == cid)["xp_awarded"] = xp
        return {"ok": True, "already": False, "checkin_id": cid, "xp_gained": xp, "xp": stats["xp"],
                "streak": stats["streak"], "best_streak": stats["best_streak"],
                "milestone_completed": ms["position"] if ms_completed else None,
                "quest_completed": q_completed}

    def _quest_answer_followup(self, p_user_id, p_checkin_id, p_answer, p_bonus_xp):
        c = next((c for c in self.db.t["quest_checkins"] if c["id"] == p_checkin_id and c["user_id"] == p_user_id
                  and c.get("followup") and c.get("followup_answer") is None), None)
        if not c:
            return {"ok": False}
        c["followup_answer"] = p_answer
        c["xp_awarded"] += p_bonus_xp
        stats = next((s for s in self.db.t["quest_stats"] if s["user_id"] == p_user_id), None)
        if stats is None:
            stats = {**DEFAULTS["quest_stats"], "user_id": p_user_id}
            self.db.t["quest_stats"].append(stats)
        stats["xp"] += p_bonus_xp
        return {"ok": True, "xp_gained": p_bonus_xp, "xp": stats["xp"]}
