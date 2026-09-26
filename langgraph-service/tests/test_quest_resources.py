"""
The link filter for Quest task resources.

The model is asked to search and submit links, but a model asked for links will
invent plausible ones. clean_resources is what makes every link a student sees
a page the search actually returned, so it is tested on its own.

    python3 -m pytest tests/
"""
import os

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")

from app.nodes.quest.resources import MAX_RESOURCES, clean_resources  # noqa: E402

EPA = "https://www.epa.gov/lead"
KHAN = "https://khanacademy.org/stats"
RETURNED = {EPA, KHAN, "https://old.reddit.com/r/x", "http://plain.example.edu/p",
            "https://a.org/1", "https://b.org/2", "https://c.org/3", "https://d.org/4"}


def item(url, title="A page", note="Helps with the task."):
    return {"title": title, "url": url, "note": note}


def test_a_link_the_search_never_returned_is_dropped():
    out = clean_resources({"resources": [item("https://made-up.example.org/guide"), item(EPA)]}, RETURNED)
    assert [r["url"] for r in out] == [EPA]


def test_insecure_and_blocked_sites_are_dropped_even_if_returned():
    raw = {"resources": [item("http://plain.example.edu/p"), item("https://old.reddit.com/r/x"), item(KHAN)]}
    assert [r["url"] for r in clean_resources(raw, RETURNED)] == [KHAN]


def test_duplicates_collapse_and_the_list_is_capped():
    raw = {"resources": [item(EPA), item(EPA)] + [item(f"https://{c}.org/{i}") for i, c in enumerate("abcd", 1)]}
    out = clean_resources(raw, RETURNED)
    assert len(out) == MAX_RESOURCES == 3
    assert len({r["url"] for r in out}) == 3


def test_text_is_cleaned_and_the_domain_is_shown_without_www():
    out = clean_resources({"resources": [item(EPA, note="Shows the action level — step one.")]}, RETURNED)
    assert "—" not in out[0]["note"]
    assert out[0]["domain"] == "epa.gov"


def test_an_unusable_reply_is_none_and_an_honest_empty_one_is_empty():
    assert clean_resources(None, RETURNED) is None
    assert clean_resources({"resources": "nope"}, RETURNED) is None
    assert clean_resources({"resources": []}, RETURNED) == []
    assert clean_resources({"resources": [item("https://made-up.example.org/x")]}, RETURNED) == []
