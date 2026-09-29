"""
Long-term memory: what is kept, how it is ranked, and how it is shown.

The ranking itself runs in Postgres (public.recall_memories). rank.py mirrors
it for the offline eval, and test_the_mirror_matches_postgres pins the mirror to
scores a real Postgres run produced for the same data, so the two cannot drift
apart silently. Run from langgraph-service/:

    python3 -m pytest tests/
"""
import asyncio
import os
import sys
import types
from datetime import date, datetime, timedelta, timezone

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

import pytest  # noqa: E402

from app.nodes.chat import build_prompt, tools  # noqa: E402
from app.nodes.quest import checkin  # noqa: E402
from app.nodes.recall import embed, rank, retrieve, store  # noqa: E402
from app.nodes.recall.safety import looks_sensitive, normalize, worth_saving  # noqa: E402

NOW = datetime(2026, 9, 29, 16, 0, tzinfo=timezone.utc)


@pytest.fixture
def no_key(monkeypatch):
    monkeypatch.setattr(embed, "_client", None)


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setattr(embed, "_client", object())


# ── What is kept ──────────────────────────────────────────────────────────────

def test_thin_lines_are_not_worth_saving():
    assert not worth_saving("did it")
    assert not worth_saving("worked on the slides today")          # five words
    assert worth_saving("worked on the slides for the council")


SERIOUS = [
    "honestly i just want to die sometimes",
    "my dad hits me when he drinks",
    "i've been really depressed this month",
    "i don't feel safe at home right now",
    "i started cutting myself again",
    "thinking about suicide a lot lately",
    # curly apostrophes, which is what phones type
    "i don\u2019t want to be here anymore honestly, nothing feels worth it",
    "i don\u2019t feel safe at home and i can\u2019t focus on the essay",
    # phrasings a first version of the screen missed
    "sometimes i wish i were dead and can't focus on my essay",
    "i think everyone would be better off dead without me around",
    "i've been harming myself again after the sat results came back",
    "i keep thinking about ending things and cant work on the project",
    "there is no reason to live if i don't get into my dream school",
    "i feel completely hopeless about everything including applications",
    "i want to disappear and never come back to school again",
    "i can't go on like this anymore, the pressure is too much",
    "my stepdad beats me when i get bad grades on tests",
    "he touched me and i don't know who to tell about it",
    "my mom kicked me out and i'm sleeping at my friend's house",
    "we don't have enough food at home and i skip meals a lot",
    "my dad threatens to kill me if i tell anyone at school",
    "i was sexually harassed by a teacher and i am scared to report",
    "i got groomed online by an older guy and i don't know what to do",
    "i had a panic attack during the sat and could not finish",
    "i've been cutting again and hiding it from my parents lately",
    "i attempted suicide last summer and my grades dropped a lot",
]


@pytest.mark.parametrize("line", SERIOUS)
def test_serious_disclosures_are_never_saved(line):
    assert looks_sensitive(line)
    assert not worth_saving(line)


@pytest.mark.parametrize("line", [
    "so stressed about the SAT and all my applications",
    "the county data had two schools missing idk why",
    "i cut the video down to two minutes for the council",
    "our robot died halfway through the match lol",
    "bought grapes and a notebook for the experiment log",
    "we tested 988 households on the east side",
    "the council hit me up about the agenda for next week",
    "this homework is killing me but the chart is almost done",
    "i can't make the meeting on thursday because of the shift",
])
def test_ordinary_lines_are_not_flagged(line):
    assert not looks_sensitive(line)


def test_the_wider_screen_also_drops_ordinary_sounding_distress():
    line = "honestly everything is falling apart right now and school is a mess"
    assert not looks_sensitive(line) and worth_saving(line)
    assert looks_sensitive(line, strict=True) and not worth_saving(line, strict=True)


def test_curly_quotes_are_straightened_before_the_screen():
    assert normalize("  i don\u2019t \u201cknow\u201d  ") == 'i don\'t "know"'


def test_chat_keys_follow_the_words_not_the_spacing():
    assert store.chat_key("I work  weekends\nat the shop") == store.chat_key("i work weekends at the shop")
    assert store.chat_key("one thing") != store.chat_key("another thing")
    assert store.chat_key("x").startswith("chat:")


def test_memory_text_leads_with_where_it_was_said():
    assert store.memory_text("found two schools missing", "Clean the county dataset") == \
        "Clean the county dataset: found two schools missing"
    assert store.memory_text("i work weekends", "") == "i work weekends"


# ── With no key, memory quietly does nothing ─────────────────────────────────

def test_no_key_means_no_memory(no_key):
    assert not embed.enabled()
    assert asyncio.run(embed.embed(["anything"])) is None
    assert asyncio.run(retrieve.recall("user", "college size")) == []
    saved = asyncio.run(store.remember("user", body="i work weekends at my aunt's shop",
                                       source="chat", dedupe_key="chat:x"))
    assert saved is False
    assert not store.memory_available({"memory_enabled": True})


def test_the_switch_and_the_key_decide_the_tools(with_key):
    names = lambda profile: {t["name"] for t in tools.tools_for(profile)}  # noqa: E731
    assert "recall_memory" in names({"memory_enabled": True})
    assert "recall_memory" in names({})                             # the default is on
    assert "recall_memory" not in names({"memory_enabled": False})
    assert "view_portfolio" in names({"memory_enabled": False})


def test_the_switch_and_the_key_decide_the_prompt(monkeypatch):
    data = {"activities": [], "awards": [], "courses": [], "scores": [], "quest": None, "college_list": []}
    profile = {"full_name": "Ada Chen", "chat_signals": ["Works weekends at a family shop."]}

    monkeypatch.setattr(embed, "_client", object())
    on = build_prompt.build_system_prompt(profile, data)
    assert "## Their memory" in on and "Works weekends at a family shop." in on

    off = build_prompt.build_system_prompt({**profile, "memory_enabled": False}, data)
    assert "## Their memory" not in off and "Works weekends" not in off

    monkeypatch.setattr(embed, "_client", None)
    no_key = build_prompt.build_system_prompt(profile, data)
    assert "## Their memory" not in no_key and "Works weekends at a family shop." in no_key


def test_a_check_in_reply_must_clearly_say_not_sensitive():
    base = {"reply": "Nice work on the chart.", "thin": False, "followup": ""}
    assert checkin.clean_reply({**base, "sensitive": False}, "made the chart")["sensitive"] is False
    assert checkin.clean_reply({**base, "sensitive": True}, "made the chart")["sensitive"] is True
    assert checkin.clean_reply(base, "made the chart")["sensitive"] is True        # missing: not kept
    assert checkin.canned_reply("made the chart")["sensitive"] is True            # no model read it: not kept


def test_no_project_follow_up_after_something_serious():
    thin = {"reply": "That matters more than the project.", "thin": True, "followup": "What part did you do?"}
    assert checkin.clean_reply({**thin, "sensitive": False}, "did it")["followup"] == "What part did you do?"
    assert checkin.clean_reply({**thin, "sensitive": True}, "did it")["followup"] is None
    # A flag left out means "not cleared", not "serious": the bonus question stays.
    assert checkin.clean_reply(thin, "did it")["followup"] == "What part did you do?"




# ── Ranking ───────────────────────────────────────────────────────────────────

def _vec(*head):
    return list(head) + [0.0] * (8 - len(head))


# The same rows, vectors and word stems as the Postgres run in the migration's
# test (stems copied from to_tsvector('english', context || ' ' || body)).
MEMORIES = [
    {"id": "m1", "dedupe_key": "chat:m1", "embedding": _vec(1, 0, 0), "created_at": NOW - timedelta(days=60),
     "lexemes": ["aunt", "saturday", "shop", "weekend", "work"]},
    {"id": "m2", "dedupe_key": "checkin:m2", "embedding": _vec(0, 1, 0), "created_at": NOW - timedelta(days=30),
     "lexemes": ["clean", "counti", "dataset", "found", "miss", "school", "two"]},
    {"id": "m3", "dedupe_key": "chat:m3", "embedding": _vec(0, 0, 1), "created_at": NOW - timedelta(days=10),
     "lexemes": ["big", "colleg", "go", "lectur", "rather", "scare", "small", "would"]},
    {"id": "m4", "dedupe_key": "chat:m4", "embedding": _vec(0.2, 0, 0.9), "created_at": NOW - timedelta(days=2),
     "lexemes": ["big", "feel", "great", "michigan", "program"]},
    {"id": "ex", "dedupe_key": "checkin:ex", "embedding": _vec(0, 1, 0), "created_at": NOW - timedelta(days=1),
     "lexemes": ["check", "check-in", "clean", "counti", "dataset", "exclud"]},
]


def _ids(results):
    return [r["id"] for r in results]


def test_the_mirror_matches_postgres():
    # Postgres returned: m3 0.03279, m4 0.01613 for "college size"; m4 0.03252, m1 0.01639 for "Michigan".
    college = rank.rank(MEMORIES, _vec(0, 0, 1), ["colleg", "size"], now=NOW)
    assert _ids(college) == ["m3", "m4"]
    assert [round(r["score"], 5) for r in college] == [0.03279, 0.01613]

    michigan = rank.rank(MEMORIES, _vec(1, 0, 0), ["michigan"], now=NOW)
    assert _ids(michigan) == ["m4", "m1"]
    assert [round(r["score"], 5) for r in michigan] == [0.03252, 0.01639]


def test_a_rare_word_lifts_a_memory_above_a_closer_one():
    # m1 is the closest in meaning, but only m4 says "Michigan".
    assert _ids(rank.rank(MEMORIES, _vec(1, 0, 0), ["michigan"], now=NOW))[0] == "m4"
    assert _ids(rank.rank(MEMORIES, _vec(1, 0, 0), ["michigan"], now=NOW, use_text=False))[0] == "m1"


def test_nothing_relevant_returns_nothing():
    far = _vec(0, 0, 0, 1)
    assert rank.rank(MEMORIES, far, ["dog"], now=NOW) == []
    # One of two words is not enough by default; enough with text_min_matches 1.
    assert rank.rank(MEMORIES, far, ["aunt", "dog"], now=NOW) == []
    loose = rank.RecallSettings(text_min_matches=1)
    assert _ids(rank.rank(MEMORIES, far, ["aunt", "dog"], now=NOW, settings=loose)) == ["m1"]
    off = rank.RecallSettings(text_min_matches=0)
    assert rank.rank(MEMORIES, far, ["michigan"], now=NOW, settings=off) == []


def test_exclusion_limit_and_an_empty_query():
    both = rank.rank(MEMORIES, _vec(0, 1, 0), ["counti", "dataset"], now=NOW)
    assert set(_ids(both)) == {"m2", "ex"}
    assert _ids(rank.rank(MEMORIES, _vec(0, 1, 0), ["counti", "dataset"], now=NOW, exclude_key="checkin:ex")) == ["m2"]
    assert len(rank.rank(MEMORIES, _vec(0, 0, 1), ["colleg"], now=NOW, limit=1)) == 1
    assert set(_ids(rank.rank(MEMORIES, _vec(0, 0, 1), [], now=NOW))) == {"m3", "m4"}


def test_newer_wins_a_tie_and_recency_is_a_nudge_not_a_takeover():
    twins = [
        {"id": "old", "embedding": _vec(0, 0, 0, 0, 1), "created_at": NOW - timedelta(days=100), "lexemes": ["robot"]},
        {"id": "new", "embedding": _vec(0, 0, 0, 0, 1), "created_at": NOW - timedelta(days=1), "lexemes": ["robot"]},
    ]
    assert _ids(rank.rank(twins, _vec(0, 0, 0, 0, 1), ["robot"], now=NOW)) == ["new", "old"]
    # A far closer old memory still beats a barely related new one.
    mixed = [
        {"id": "old_exact", "embedding": _vec(1, 0), "created_at": NOW - timedelta(days=200), "lexemes": []},
        {"id": "new_vague", "embedding": _vec(0.5, 0.87), "created_at": NOW, "lexemes": []},
    ]
    assert _ids(rank.rank(mixed, _vec(1, 0), [], now=NOW))[0] == "old_exact"


# ── Showing memories ──────────────────────────────────────────────────────────

def test_where_and_when_read_naturally():
    today = date(2026, 9, 29)
    chat = {"body": "i work weekends", "source": "chat", "context": "", "created_at": NOW - timedelta(days=26)}
    check = {"body": "found two schools missing", "source": "checkin", "context": "Clean the county dataset",
             "created_at": datetime(2025, 12, 1, tzinfo=timezone.utc)}
    assert retrieve.where_said(chat) == "in chat"
    assert retrieve.where_said(check) == 'checking in on "Clean the county dataset"'
    assert retrieve.date_label(chat["created_at"], today) == "Sep 3"
    assert retrieve.date_label(check["created_at"], today) == "Dec 1, 2025"
    lines = retrieve.prompt_lines([chat, check], today)
    assert lines.splitlines()[0] == '- "i work weekends" (in chat, Sep 3)'
    payload = retrieve.tool_payload([chat], today)
    assert payload == [{"said": "i work weekends", "where": "in chat", "when": "2026-09-03", "days_ago": 26}]


def test_prompt_lines_quote_safely_and_clip():
    m = {"body": 'she said "hi" ' + "x" * 400, "source": "chat", "context": "", "created_at": NOW}
    line = retrieve.prompt_lines([m], NOW.date())
    assert line.count('"') == 2 and line.endswith("(in chat, Sep 29)") and "..." in line
    assert retrieve.prompt_lines([]) == ""


def test_the_prompts_carry_earlier_words_only_when_there_are_some():
    assert checkin.earlier_block("") == ""
    assert "THINGS THEY SAID EARLIER" in checkin.earlier_block('- "x" (in chat, Sep 3)')
    text = checkin.CHECKIN_PROMPT.format(quest_title="q", ms_title="m", task_title="t", task_detail="",
                                         catch_up_line="", body="b", earlier="")
    assert "—" not in text and "—" not in checkin.EARLIER_BLOCK and "—" not in build_prompt.MEMORY_CAPABILITY
