"""
What memory never keeps.

Two rules, checked before anything is embedded or written:

  * Thin lines. Under six words ("did it", "ok thanks") says nothing worth
    finding again. The same bar as a thin check-in.
  * Serious disclosures. Anything about feeling unsafe, hurting themselves,
    abuse or a mental-health crisis is filtered out, so it is never recalled
    into a later reply. Two layers do this. A model that already read the text
    (the chat summary, the check-in reply) returns a `sensitive` flag, and it
    has to clear the line: a missing flag counts as sensitive. This screen is
    the layer that runs on every path, and the only one on paths where no model
    reads the text (a follow-up answer, the one-off backfill).

The screen is deliberately broad, and it is a filter, not a guarantee: a false
alarm only means one line is not remembered, while a miss keeps a disclosure,
so every phrasing we can think of goes in, and the copy students read says
"filtered", never "never saved". Add to it whenever a miss turns up.
"""
import re
import unicodedata

MIN_WORDS = 6

# Phones type curly apostrophes and quotes; every pattern below uses straight ones.
_QUOTES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "“": '"', "”": '"'})

_SELF_HARM = [
    r"suicid\w*", r"kill(ing)?\s+my\s*self", r"end(ing)?\s+(it\s+all|my\s+life)",
    r"(thinking|thoughts?)\s+(about|of)\s+ending\s+(it|things)",
    r"(want|wanted|wanna|wants)\s+(to\s+)?(die|be\s+dead|disappear)",
    r"wish\s+i\s+(were|was)\s+(dead|gone)", r"wish\s+i\s+(wasn'?t|weren'?t|was\s+not|were\s+not)\s+(here|alive|born)",
    r"wish\s+i\s+(was|were)?\s*never\s+(been\s+)?born", r"better\s+off\s+(dead|without\s+me)",
    r"(no|any)\s+(reason|point)\s+(to|in)\s+(live|living|going\s+on|being\s+alive|life)",
    r"don'?t\s+want\s+to\s+(be\s+alive|live|exist|be\s+here|wake\s+up)",
    r"can'?t\s+(go\s+on|take\s+(it|this)\s+any\s*more|do\s+this\s+any\s*more)",
    r"self[\s-]?(harm|injur)\w*",
    r"(hurt|hurting|harm|harming|cut|cutting|burn|burning|starv\w*|punish\w*)\s+my\s*self", r"cutting\s+again",
    r"overdos\w*", r"hopeless\w*", r"worthless", r"hate\s+my\s*self",
]
_ABUSE = [
    r"abus(e|ed|es|ing|ive)", r"rape\w*", r"sexual(ly)?\s+(assault|harass|abus|molest|coerc)\w*",
    r"assault(ed)?", r"molest\w*", r"groom(ed|ing)", r"harass(ed|ing)\s+me", r"touch(ed|es|ing)\s+me",
    r"hit(s|ting)?\s+me(?!\s+up)",
    r"(beats?|beating|hurts?|chok(e|es|ed|ing)|slap(s|ped|ping)?|punch(es|ed|ing)?|kick(s|ed|ing)?|shoves?|shoved"
    r"|threatens?|threatened)\s+me",
    r"(threat\w*|going|gonna|wants?|trying|tries)\s+to\s+kill\s+me",
    r"(not|(do(es)?n'?t|do(es)?\s+not)\s+feel|isn'?t|wasn'?t)\s+safe\s+(at|in)\s+(home|my\s+house)",
    r"(afraid|scared|terrified|fear)\s+(to|of)\s+(go(ing)?\s+home|be(ing)?\s+home|my\s+(dad|mom|mother|father|parents?"
    r"|step\w*|boyfriend|girlfriend|uncle|aunt|brother|sister|teacher|coach))",
    r"domestic\s+violence", r"kick(ed|s)?\s+me\s+out", r"homeless\w*", r"nowhere\s+to\s+(go|sleep|live|stay)",
    r"enough\s+(food|to\s+eat)", r"skip(ping)?\s+meals",
]
_MENTAL_HEALTH = [
    r"depress(ed|ion)", r"(panic|anxiety)\s+attacks?", r"mental\s+breakdown", r"eating\s+disorders?",
    r"anorexi\w*", r"bulimi\w*", r"crisis\s+(line|text|hotline)", r"therap(y|ist|ists)", r"psychiatr\w*",
    r"antidepress\w*", r"trauma\w*", r"addict\w*", r"rehab", r"pregnan\w*",
]
# Wider net for the backfill, which has no model check at all: it also drops
# ordinary-sounding distress, so a doubtful line is never imported.
_DISTRESS = [
    r"falling\s+apart", r"give\s+up\s+on\s+(everything|life)", r"nothing\s+(matters|feels\s+worth)",
    r"no\s+one\s+(cares|would\s+notice)", r"so\s+(alone|lonely)", r"breaking\s+down", r"hate\s+my\s+life",
    r"cry(ing)?\s+(every|all)", r"(scared|afraid)\s+of\s+(him|her|them)", r"can'?t\s+(do|handle|take)\s+(this|it)\b",
]


def _compile(*groups):
    return re.compile(r"\b(" + "|".join(p for g in groups for p in g) + r")\b", re.IGNORECASE)


_SENSITIVE = _compile(_SELF_HARM, _ABUSE, _MENTAL_HEALTH)
_STRICT = _compile(_SELF_HARM, _ABUSE, _MENTAL_HEALTH, _DISTRESS)


def normalize(text) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(text or "")).translate(_QUOTES).split())


def looks_sensitive(text, strict: bool = False) -> bool:
    return bool((_STRICT if strict else _SENSITIVE).search(normalize(text)))


def worth_saving(text, strict: bool = False) -> bool:
    """Whether a line is worth remembering: substantive, and not a disclosure."""
    body = normalize(text)
    return len(body.split()) >= MIN_WORDS and not looks_sensitive(body, strict)
