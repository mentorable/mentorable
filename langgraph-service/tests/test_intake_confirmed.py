"""
Keeping the interviewer's words out of a student's onboarding record.

An interviewer once asked a DECA-only student about "Science Olympiad" (the
example its own instructions used) and the name reached the student's summary.
Extraction is told to ignore what only the interviewer said, and
_keep_confirmed enforces it in code.

    python3 -m pytest tests/
"""
import os
import sys
import types

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

from app.nodes.onboarding.intake import INTERVIEW_SYSTEM, _keep_confirmed, _unconfirmed_names  # noqa: E402

RECORD = "Name: Test Student\nYear: currently grade 11\nActivities: DECA"
TRANSCRIPT = (
    "Interviewer: Tell me about Science Olympiad. What events did you do?\n\n"
    "Student: idk\n\n"
    "Interviewer: Okay. What about DECA? Did you go to the State Career Development Conference?\n\n"
    "Student: i did the stock market game and we won at states. honestly I just like money stuff"
)


def draft(**over):
    base = {
        "theme": "A business-minded student. Their Science Olympiad work shows range.",
        "theme_evidence": ["Science Olympiad Circuit Lab event", "DECA Stock Market Game, won at states"],
        "concerns": [],
        "gaps": ["No Science Olympiad results", "No leadership role in DECA yet"],
        "student_voice": ["I just like money stuff", "I love building circuits"],
        "summary": "Active in Science Olympiad and DECA. Won at states in DECA's stock market game.",
        "enriched_activities": [{"id": "a1"}],
    }
    return {**base, **over}


def test_names_only_the_interviewer_used_are_found():
    names = _unconfirmed_names(TRANSCRIPT, RECORD)
    assert {"science olympiad", "state career development conference"} <= names
    assert "deca" not in names


def test_a_name_on_the_form_or_in_the_students_words_is_confirmed():
    said = TRANSCRIPT + "\n\nStudent: oh and i also do science olympiad"
    assert "science olympiad" not in _unconfirmed_names(said, RECORD)
    assert "deca" not in _unconfirmed_names(TRANSCRIPT, RECORD)


def test_unconfirmed_names_are_taken_out_of_the_narrative():
    out = _keep_confirmed(draft(), TRANSCRIPT, RECORD)
    assert out["theme_evidence"] == ["DECA Stock Market Game, won at states"]
    assert out["gaps"] == ["No leadership role in DECA yet"]
    assert out["theme"] == "A business-minded student."
    assert out["summary"] == "Won at states in DECA's stock market game."
    assert out["enriched_activities"] == [{"id": "a1"}]


def test_quotes_must_be_the_students_own_words():
    out = _keep_confirmed(draft(), TRANSCRIPT, RECORD)
    assert out["student_voice"] == ["I just like money stuff"]


def test_em_dashes_are_replaced():
    out = _keep_confirmed(draft(gaps=["No leadership — yet"], summary="Driven — and curious."),
                          TRANSCRIPT, RECORD)
    assert "—" not in out["gaps"][0] and "—" not in out["summary"]


def test_voice_transcripts_use_other_labels():
    voice = "Mentorable: How is Model United Nations going?\nStudent: i dont do that\nInterviewer: And DECA?"
    names = _unconfirmed_names(voice, RECORD)
    assert "model united nations" in names and "deca" not in names


def test_activity_text_is_guarded_too():
    enriched = [{"id": "a1", "organization": "Science Olympiad", "position": "Member",
                 "description": "Competed at State Career Development Conference \u2014 placed"},
                {"id": "a2", "organization": "DECA", "description": "Won states \u2014 stock market game"}]
    out = _keep_confirmed(draft(enriched_activities=enriched), TRANSCRIPT, RECORD)["enriched_activities"]
    assert out[0]["organization"] is None and out[0]["description"] is None and out[0]["position"] == "Member"
    assert out[1] == {"id": "a2", "organization": "DECA", "description": "Won states, stock market game"}


def test_an_expanded_name_the_student_confirmed_is_kept():
    # "DECA Nationals" after "we placed at nationals"; NHS spelled out; VP spelled out.
    cases = [
        ("Activities: DECA", "Interviewer: Did you compete at DECA Nationals?\nStudent: yes! we placed top 10 at nationals",
         "Top 10 at DECA Nationals in Business Law"),
        ("Activities: NHS", "Interviewer: Tell me about National Honor Society.\nStudent: im the treasurer",
         "Treasurer of National Honor Society"),
        ("Activities: Robotics", "Interviewer: Were you something like Vice President?\nStudent: im VP of competitions",
         "Vice President of the robotics club"),
    ]
    for record, transcript, evidence in cases:
        out = _keep_confirmed(draft(theme_evidence=[evidence], summary="", theme=""), transcript, record)
        assert out["theme_evidence"] == [evidence], (record, _unconfirmed_names(transcript, record))


def test_admissions_words_are_not_activity_names():
    t = ("Interviewer: What worries you most, like the SAT or ACT, or your GPA, or STEM classes?\n"
         "Student: honestly my test scores, i havent taken anything yet")
    out = _keep_confirmed(draft(gaps=["No SAT or ACT score yet"], concerns=["Worried about SAT and ACT scores"],
                                summary="She has not yet taken the SAT or ACT.", theme="A hands-on STEM student."),
                          t, RECORD)
    assert out["gaps"] == ["No SAT or ACT score yet"]
    assert out["concerns"] == ["Worried about SAT and ACT scores"]
    assert out["summary"] and out["theme"]


def test_a_name_joined_to_other_words_is_still_caught():
    for line in ["How do you balance DECA and Science Olympiad?", "During Science Olympiad season, what did you do?",
                 "Speaking of Science Olympiad, any events?"]:
        names = _unconfirmed_names(f"Interviewer: {line}\nStudent: idk", RECORD)
        assert "science olympiad" in names, (line, names)
        assert "deca" not in names
    assert "first robotics" in _unconfirmed_names("Interviewer: Have you tried FIRST Robotics?\nStudent: no", RECORD)


def test_quotes_survive_restored_apostrophes():
    t = "Interviewer: What about DECA?\nStudent: im obsessed with the stock market, its basically my whole personality lol"
    out = _keep_confirmed(draft(student_voice=["I'm obsessed with the stock market", "it\u2019s basically my whole personality"]),
                          t, RECORD)
    assert out["student_voice"] == ["I'm obsessed with the stock market", "it\u2019s basically my whole personality"]


def test_the_interviewer_prompt_names_no_example_activity():
    assert "Science Olympiad" not in INTERVIEW_SYSTEM
    assert "Never name, suggest or ask about any other activity" in INTERVIEW_SYSTEM
