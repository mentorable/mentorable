"""
Beaker's graphs (app/nodes/agents/outreach/graph.py): the research loop the
model drives (search, open a page, submit, look again once) and the reviewed
draft (draft, a second read, at most one revision).

The model is scripted turn by turn, the search API and the pages are fakes.
Nothing here touches the network. Run from langgraph-service/:

    python3 -m pytest tests/test_outreach_graph.py
"""
import asyncio
import os
import sys
import types

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

import pytest  # noqa: E402

from app import config, search_pool  # noqa: E402
from app.llm import ModelUnavailable  # noqa: E402
from app.models import OUTREACH_AGENT_MODEL  # noqa: E402
from app.nodes.agents.outreach import draft, graph, pages, prompts, research  # noqa: E402


def run(coro):
    return asyncio.run(coro)


class Events(list):
    async def __call__(self, event):
        self.append(event)

    def lines(self):
        return [(e["id"], e["status"], e["label"]) for e in self if e.get("type") == "progress"]

    def shots(self):
        return [e for e in self if e.get("type") == "screen"]


PROFILE = "https://www.usf.edu/marine-science/people/lee.html"
PAPER = "https://www.usf.edu/marine-science/research/coral.html"
ELSEWHERE = "https://made-up.example.edu/lee"
PROFILE_TEXT = ("Dr. Maria Lee is an Associate Professor of Marine Science at the University of South Florida. "
                "The Lee Lab builds low-cost sensors to track coral bleaching along the Florida Keys and runs a "
                "summer outreach program for local high school students. Contact: mlee@usf.edu. " * 3)


def tool_use(name, args, n=[0]):
    n[0] += 1
    return {"type": "tool_use", "id": f"tu_{n[0]}", "name": name, "input": args}


def turn(*blocks, stop="tool_use"):
    return {"content": list(blocks), "stop_reason": stop, "usage": {"in": 100, "out": 50}}


class Model:
    """Scripted turns, one per call; records what each call was sent."""

    def __init__(self, monkeypatch, turns, raises=None):
        self.turns = list(turns)
        self.calls = []
        self.raises = raises

        async def fake(**kw):
            self.calls.append({**kw, "messages": [dict(m) for m in kw["messages"]]})
            if self.raises:
                raise self.raises
            assert self.turns, "the loop asked for more turns than were scripted"
            return self.turns.pop(0)

        monkeypatch.setattr(graph, "_model_turn", fake)

    def tool_names(self, i):
        return [t["name"] for t in self.calls[i]["tools"]]

    def last_results(self, i):
        """The tool_result texts sent with call i (the user message before it)."""
        content = self.calls[i]["messages"][-1]["content"]
        return [c["content"] for c in content if isinstance(c, dict) and c.get("type") == "tool_result"]


@pytest.fixture
def web(monkeypatch):
    """Tavily on, with a fake index; pages served from a dict."""
    world = types.SimpleNamespace(index={}, pages={}, queries=[], fetched=[], down=False)
    monkeypatch.setattr(config, "TAVILY_API_KEYS", ["k1"])

    async def web_search(query, *, blocked=None, count=10, client=None):
        world.queries.append(query)
        if world.down:
            raise search_pool.SearchUnavailable("out")
        return world.index.get(query, [])

    async def fetch_page(url):
        world.fetched.append(url)
        text = world.pages.get(url)
        return pages.Page(url=url, final_url=url, title="Maria Lee | USF", text=text,
                          emails=set(pages.extract_emails(text))) if text else None

    monkeypatch.setattr(search_pool.tavily, "web_search", web_search)
    monkeypatch.setattr(pages, "fetch_page", fetch_page)
    return world


def found_submission(facts, email=None, name="Dr. Maria Lee"):
    return {"status": "found", "recipient_kind": "professional",
            "person": {"name": name, "title": "Associate Professor", "organization": "University of South Florida",
                       "profile_url": PROFILE, "profile_title": "Maria Lee | USF"},
            "facts": facts, "email": email or {"address": "", "url": ""}, "candidates": []}


GOOD_FACT = {"text": "The Lee Lab builds low-cost sensors to track coral bleaching.", "url": PROFILE,
             "source_title": "Maria Lee"}
TARGET = {"name": "Maria Lee", "organization": "University of South Florida", "url": ""}


# ── The research loop ────────────────────────────────────────────────────────

def test_the_model_searches_reads_a_page_and_submits_what_it_read(monkeypatch, web):
    web.index["Maria Lee University of South Florida"] = [
        {"title": "Maria Lee | USF", "url": PROFILE, "snippet": "Associate Professor of Marine Science"}]
    web.pages[PROFILE] = PROFILE_TEXT
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "Maria Lee University of South Florida"})),
        turn(tool_use("open_page", {"url": PROFILE})),
        turn(tool_use("submit_research", found_submission([GOOD_FACT], {"address": "mlee@usf.edu", "url": PROFILE}))),
    ])
    emitted = Events()
    out = run(research.research_person(TARGET, emit=emitted))
    assert out["status"] == "found" and out["facts"] == [{"text": GOOD_FACT["text"], "url": PROFILE}]
    assert out["verified_email"] == "mlee@usf.edu"
    assert web.queries == ["Maria Lee University of South Florida"]
    # The search results and the page text both went back to the model.
    assert "URL: " + PROFILE in m.last_results(1)[0]
    assert "low-cost sensors" in m.last_results(2)[0] and "mlee@usf.edu" in m.last_results(2)[0]
    assert m.calls[0]["model"] == OUTREACH_AGENT_MODEL
    assert m.tool_names(0) == ["search", "open_page", "submit_research"]
    labels = [label for _, _, label in emitted.lines()]
    assert "Searching: Maria Lee University of South Florida" in labels and "Read Maria Lee | USF" in labels


def test_the_screen_shows_the_real_search_and_the_page_it_read(monkeypatch, web):
    web.index["Maria Lee University of South Florida"] = [
        {"title": "Maria Lee | USF", "url": PROFILE, "snippet": "Associate Professor of Marine Science"}]
    web.pages[PROFILE] = PROFILE_TEXT
    Model(monkeypatch, [
        turn(tool_use("search", {"query": "Maria Lee University of South Florida"})),
        turn(tool_use("open_page", {"url": PROFILE})),
        turn(tool_use("open_page", {"url": ELSEWHERE})),          # refused: never on the screen
        turn(tool_use("submit_research", found_submission([GOOD_FACT], {"address": "mlee@usf.edu", "url": PROFILE}))),
    ])
    emitted = Events()
    run(research.research_person(TARGET, emit=emitted))
    shots = emitted.shots()
    search = [s for s in shots if s["kind"] == "search"]
    assert [s["status"] for s in search] == ["active", "done"]
    assert search[-1]["query"] == "Maria Lee University of South Florida"
    assert search[-1]["results"] == [{"title": "Maria Lee | USF", "url": PROFILE, "domain": "usf.edu",
                                      "snippet": "Associate Professor of Marine Science"}]
    opened = [s for s in shots if s["kind"] == "page"]
    assert {s["url"] for s in opened} == {PROFILE}                 # the refused page never shows
    assert opened[-1]["status"] == "done" and opened[-1]["title"] == "Maria Lee | USF"
    assert opened[-1]["excerpt"].startswith("Dr. Maria Lee is an Associate Professor")
    assert len({s["id"] for s in shots}) == 2                       # one tab each, updated in place


def test_a_link_that_is_not_http_never_reaches_the_screen():
    from app.nodes.agents import screen
    got = Events()
    run(screen.search(got, "s", "q", [{"url": "javascript:alert(1)", "title": "x"},
                                     {"url": "https://ok.edu/a", "title": "ok"}], status="done"))
    run(screen.page(got, "p", "data:text/html,hi"))
    assert [r["url"] for r in got[0]["results"]] == ["https://ok.edu/a"] and len(got) == 1


def test_a_broken_screen_stream_never_stops_the_work():
    from app.nodes.agents import screen

    async def broken(event):
        raise RuntimeError("the page went away")
    run(screen.page(broken, "p", "https://ok.edu/a"))      # does not raise


def test_only_a_page_a_search_returned_can_be_opened(monkeypatch, web):
    web.pages[ELSEWHERE] = PROFILE_TEXT
    m = Model(monkeypatch, [
        turn(tool_use("open_page", {"url": ELSEWHERE})),
        turn(tool_use("submit_research", {"status": "not_found", "recipient_kind": "professional",
                                          "person": {}, "facts": [], "email": {}, "candidates": []})),
    ])
    monkeypatch.setattr(graph, "MAX_REFLECTIONS", 0)
    run(research.research_person(TARGET, emit=Events()))
    assert web.fetched == []                                     # never fetched
    assert "Not opened" in m.last_results(1)[0]


def test_past_the_search_cap_the_model_is_told_and_then_made_to_submit(monkeypatch, web):
    monkeypatch.setattr(research, "PERSON_SEARCHES", 2)
    monkeypatch.setattr(research, "PERSON_OPENS", 0)
    web.index["a"] = [{"title": "Lee", "url": PROFILE, "snippet": "Marine science"}]
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "a"}), tool_use("search", {"query": "b"}), tool_use("search", {"query": "c"})),
        turn(tool_use("submit_research", found_submission([GOOD_FACT]))),
    ])
    run(research.research_person(TARGET, emit=Events()))
    assert web.queries == ["a", "b"]                             # the third never ran
    assert "No searches left" in m.last_results(1)[2]
    assert m.calls[1]["tool_choice"] == {"type": "tool", "name": "submit_research"}


def test_the_turn_cap_forces_a_submission_on_the_last_turn(monkeypatch, web):
    monkeypatch.setattr(research, "PERSON_ROUNDS", 2)
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "x"})),
        turn(tool_use("submit_research", found_submission([GOOD_FACT]))),
    ])
    run(research.research_person(TARGET, emit=Events()))
    assert m.calls[0]["tool_choice"] == {"type": "auto"}
    assert m.calls[1]["tool_choice"] == {"type": "tool", "name": "submit_research"}


def test_a_reply_in_prose_is_asked_once_more_for_the_submission(monkeypatch, web):
    m = Model(monkeypatch, [
        turn({"type": "text", "text": "I think I have enough."}, stop="end_turn"),
        turn(tool_use("submit_people", {"people": []})),
    ])
    monkeypatch.setattr(graph, "MAX_REFLECTIONS", 0)
    run(research.find_people("coral reefs", record_text="", emit=Events()))
    assert m.calls[1]["tool_choice"] == {"type": "tool", "name": "submit_people"}
    assert "Call submit_people now" in m.calls[1]["messages"][-1]["content"]


def test_a_thin_first_answer_gets_one_more_look_with_the_reason(monkeypatch, web):
    """The first submission's facts are not on the page it cites: dropped, and
    the model is told why and looks again. The second answer stands."""
    web.index["Maria Lee"] = [{"title": "Maria Lee | USF", "url": PROFILE, "snippet": "Professor"}]
    web.pages[PROFILE] = PROFILE_TEXT
    invented = {"text": "Her team discovered a heat resistant gene in elkhorn coral in 2019.", "url": PROFILE,
                "source_title": "Maria Lee"}
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "Maria Lee"})),
        turn(tool_use("open_page", {"url": PROFILE})),
        turn(tool_use("submit_research", found_submission([invented]))),
        turn(tool_use("submit_research", found_submission([GOOD_FACT]))),
    ])
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["status"] == "found" and [f["text"] for f in out["facts"]] == [GOOD_FACT["text"]]
    feedback = m.last_results(3)[0]
    assert feedback.startswith("Not accepted yet.") and "None of the facts could be checked" in feedback


def test_it_looks_again_only_once(monkeypatch, web):
    nobody = {"status": "not_found", "recipient_kind": "professional", "person": {}, "facts": [], "email": {},
              "candidates": []}
    web.index["Maria Lee"] = [{"title": "x", "url": PROFILE, "snippet": "y"}]
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "Maria Lee"})),
        turn(tool_use("submit_research", nobody)),
        turn(tool_use("submit_research", nobody)),
    ])
    emitted = Events()
    assert run(research.research_person(TARGET, emit=emitted)) == {"status": "not_found"}
    assert len(m.calls) == 3 and "Not found yet" in m.last_results(2)[0]
    assert emitted.lines()[-1] == ("pick", "failed", "Could not find enough about Maria Lee")


def test_a_different_name_is_named_back_to_the_model(monkeypatch, web):
    web.index["Maria Lee"] = [{"title": "x", "url": PROFILE, "snippet": "y"}]
    web.pages[PROFILE] = PROFILE_TEXT
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "Maria Lee"})),
        turn(tool_use("submit_research", found_submission([GOOD_FACT], name="Dr. Mariah Leigh"))),
        turn(tool_use("submit_research", found_submission([GOOD_FACT]))),
    ])
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["status"] == "found"
    assert "named Dr. Mariah Leigh" in m.last_results(2)[0]


def test_a_minor_is_refused_on_the_first_answer_with_no_second_look(monkeypatch, web):
    m = Model(monkeypatch, [
        turn(tool_use("submit_research", {**found_submission([GOOD_FACT]), "recipient_kind": "minor"})),
    ])
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["reason"] == research.REFUSE_MINOR and len(m.calls) == 1


def test_with_no_tavily_key_the_model_gets_anthropics_search(monkeypatch, web):
    monkeypatch.setattr(config, "TAVILY_API_KEYS", [])
    m = Model(monkeypatch, [
        turn({"type": "server_tool_use", "id": "srv_1", "name": "web_search", "input": {"query": "coral lab Tampa"}},
             {"type": "web_search_tool_result", "tool_use_id": "srv_1",
              "content": [{"type": "web_search_result", "url": PROFILE, "title": "Maria Lee | USF"}]},
             tool_use("submit_people", {"people": [{"name": "Dr. Maria Lee", "title": "Professor", "organization": "USF",
                                                    "why": "Runs a coral lab.", "source_url": PROFILE,
                                                    "source_title": "Lee"}]})),
    ])
    emitted = Events()
    people = run(research.find_people("coral reefs", record_text="", emit=emitted))
    assert [p["name"] for p in people] == ["Dr. Maria Lee"]
    tools = m.calls[0]["tools"]
    assert "search" not in m.tool_names(0)
    server = next(t for t in tools if t.get("type") == "web_search_20250305")
    assert server["max_uses"] == research.SHORTLIST_SEARCHES and "rocketreach.co" in server["blocked_domains"]
    assert ("search-1", "active", "Searching: coral lab Tampa") in emitted.lines()


def test_when_tavily_is_down_the_next_turn_has_anthropics_search(monkeypatch, web):
    web.down = True
    m = Model(monkeypatch, [
        turn(tool_use("search", {"query": "coral lab"})),
        turn(tool_use("submit_people", {"people": []})),
    ])
    monkeypatch.setattr(graph, "MAX_REFLECTIONS", 0)
    run(research.find_people("coral reefs", record_text="", emit=Events()))
    assert "web_search" in m.tool_names(1) and "search" in m.tool_names(1)
    assert "That search did not go through" in m.last_results(1)[0]


def test_an_unreachable_model_is_a_failed_search_the_service_refunds(monkeypatch, web):
    Model(monkeypatch, [], raises=ModelUnavailable("down"))
    assert run(research.find_people("coral reefs", record_text="", emit=Events())) is None
    assert run(research.research_person(TARGET, emit=Events())) is None


def test_the_students_name_never_reaches_the_researcher(monkeypatch, web):
    m = Model(monkeypatch, [turn(tool_use("submit_people", {"people": []}))])
    monkeypatch.setattr(graph, "MAX_REFLECTIONS", 0)
    record = "Name: Samira Quintero\nYear: currently grade 11\nActivities: Marine Science Club"
    run(research.find_people("coral reefs", record_text=record, emit=Events()))
    sent = str(m.calls[0]["messages"]) + m.calls[0]["system"]
    assert "Samira" not in sent and "Quintero" not in sent and "Marine Science Club" in sent


def test_a_fact_is_checked_against_the_text_seen_at_its_url():
    page = PROFILE_TEXT
    assert research.fact_supported(GOOD_FACT["text"], page)
    assert not research.fact_supported("Her team discovered a heat resistant gene in elkhorn coral.", page)
    facts = [GOOD_FACT, {"text": "She won a Nobel Prize for deep sea vents.", "url": PROFILE},
             {"text": "Anything at all about her paper.", "url": PAPER}]
    kept = research.supported_facts(facts, {PROFILE: page, PAPER: "Coral paper"})
    assert kept == [GOOD_FACT, facts[2]]                     # a bare title is too little to check against


# ── The reviewed draft ───────────────────────────────────────────────────────

RESEARCH = {"status": "found", "person": {"name": "Dr. Maria Lee", "title": "Professor", "organization": "USF",
                                          "profile_url": PROFILE},
            "facts": [{"text": GOOD_FACT["text"], "url": PROFILE}]}
ARGS = dict(research=RESEARCH, record_text="Activities: Marine Science Club", student_name="Sam Rivera", grade="11",
            purpose="informational", voice="warm", length="brief", student_note="", answer=None,
            allow_question=True, emit=None, question=None)
FIRST = {"subject": "Coral sensors", "body": "Dear Dr. Lee,\nfirst\nSam", "claims": [{"text": "x", "source_url": PROFILE}],
         "facts_to_verify": []}
BETTER = {**FIRST, "body": "Dear Dr. Lee,\nbetter\nSam"}


@pytest.fixture
def writer(monkeypatch):
    w = types.SimpleNamespace(drafts=[FIRST], review={"ok": True, "issues": []}, revised=BETTER, calls=[])

    async def write_draft(**kw):
        w.calls.append("draft")
        return w.drafts.pop(0)

    async def review_draft(**kw):
        w.calls.append("review")
        assert kw["draft"]["body"] and set(kw) >= set(draft.REVIEW_ARGS)
        return w.review

    async def revise_draft(**kw):
        w.calls.append("revise")
        assert kw["issues"] == w.review["issues"]
        return w.revised

    monkeypatch.setattr(draft, "write_draft", write_draft)
    monkeypatch.setattr(draft, "review_draft", review_draft)
    monkeypatch.setattr(draft, "revise_draft", revise_draft)
    return w


def test_a_draft_that_reads_well_is_kept_as_written(writer):
    assert run(graph.write_reviewed_draft(**ARGS)) == FIRST
    assert writer.calls == ["draft", "review"]


def test_a_flagged_draft_is_revised_once(writer):
    writer.review = {"ok": False, "issues": [{"kind": "fact", "quote": "first", "fix": "Say only what the page says."}]}
    assert run(graph.write_reviewed_draft(**ARGS)) == BETTER
    assert writer.calls == ["draft", "review", "revise"]


def test_a_revision_that_breaks_the_rules_keeps_the_first_draft(writer):
    writer.review = {"ok": False, "issues": [{"kind": "ask", "quote": "first", "fix": "Make the ask smaller."}]}
    writer.revised = None
    assert run(graph.write_reviewed_draft(**ARGS)) == FIRST


def test_a_question_goes_straight_back_without_a_review(writer):
    writer.drafts = [{"question": "Which of her projects interests you most?"}]
    assert run(graph.write_reviewed_draft(**ARGS)) == {"question": "Which of her projects interests you most?"}
    assert writer.calls == ["draft"]


def test_the_draft_fails_as_before_when_drafting_fails(writer, monkeypatch):
    async def fails(**kw):
        raise draft.DraftFailed(draft.COULD_NOT_WRITE)
    monkeypatch.setattr(draft, "write_draft", fails)
    with pytest.raises(draft.DraftFailed):
        run(graph.write_reviewed_draft(**ARGS))


def test_an_unreachable_reviewer_passes_the_draft(monkeypatch):
    async def down(**kw):
        raise ModelUnavailable("down")
    monkeypatch.setattr(draft, "tool_completion", down)
    emitted = Events()
    out = run(draft.review_draft(draft=FIRST, research=RESEARCH, record_text="", purpose="research", voice="warm",
                                 student_note="", emit=emitted))
    assert out == {"ok": True, "issues": []} and emitted.lines()[-1][1] == "done"


def test_the_reviewer_is_believed_only_with_real_issues(monkeypatch):
    replies = [{"ok": False, "issues": []},
               {"ok": False, "issues": [{"kind": "bogus", "quote": "q", "fix": "Cut the second sentence."}] * 6}]

    async def reviewer(**kw):
        assert kw["tool"]["name"] == "review_email" and "Coral sensors" in kw["prompt"]
        return replies.pop(0)
    monkeypatch.setattr(draft, "tool_completion", reviewer)
    kw = dict(draft=FIRST, research=RESEARCH, record_text="", purpose="research", voice="warm", student_note="")
    assert run(draft.review_draft(**kw)) == {"ok": True, "issues": []}
    out = run(draft.review_draft(**kw))
    assert out["ok"] is False and len(out["issues"]) == draft.MAX_ISSUES and out["issues"][0]["kind"] == "other"


def test_a_revision_must_keep_its_sourced_details(monkeypatch):
    body = ("Dear Dr. Lee,\n\nI'm Sam, a junior in high school who runs our Marine Science Club. I read that the Lee "
            "Lab builds low-cost sensors to track coral bleaching, and I have been wondering how those sensors hold "
            "up in warm, shallow water like the reefs near Tampa. Would you be open to a short email exchange about "
            "how a high school student could start learning this kind of fieldwork? No worries at all if you're "
            "too busy this term.\n\nThank you,\nSam")
    claim = "the Lee Lab builds low-cost sensors to track coral bleaching"

    async def model(**kw):
        assert "A CAREFUL READER FLAGGED THESE" in kw["prompt"]
        return {"subject": "Coral sensors", "body": body, "claims": replies.pop(0), "facts_to_verify": [],
                "safety_stop": False}
    replies = [[], [{"text": claim, "source_url": PROFILE}]]
    monkeypatch.setattr(draft, "tool_completion", model)
    issues = [{"kind": "voice", "quote": "first", "fix": "Sound less formal."}]
    args = {**ARGS, "allow_question": False}
    assert run(draft.revise_draft(draft=FIRST, issues=issues, **args)) is None           # lost its sourced detail
    out = run(draft.revise_draft(draft=FIRST, issues=issues, **args))
    assert out["body"].startswith("Dear Dr. Lee") and out["claims"][0]["source_url"] == PROFILE


def test_the_review_prompts_carry_no_em_dashes():
    texts = [prompts.REVIEW_PROMPT, graph.AGENT_SYSTEM, prompts.revision(FIRST, [{"quote": "a", "fix": "b"}]),
             research.NO_FACTS, research.NOT_FOUND_YET, research.NO_PEOPLE_KEPT, research.NO_PEOPLE_YET]
    assert not [t for t in texts if "—" in t or "–" in t]
