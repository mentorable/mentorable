"""
Quill's rules: what a line a model wrote must pass before a student sees it.

Pure: no I/O, no clock and no model, so every rule can be checked with plain
values (tests/test_essay_rules.py). talk.py, topics.py and review.py run them
on what the model returned. Nothing a model says is taken on trust: the
promise Quill makes (it never writes, rewrites or corrects any part of an
essay, never comments on spelling, grammar or word choice, and never predicts
an outcome) is kept here, in code, never by a prompt alone.

- find_quote, prepare: a quote counts only when it is a real piece of the
  draft. The offsets it returns are into the original text, so the page
  highlights the student's own words, not the model's copy of them.
- breaks_rules, clean_line: a line is dropped when it tells the student what to
  write ("rewrite"), puts quotation marks around words that are not theirs or
  the record's ("new_text"), comments on mechanics, or talks about admission
  odds; when its own words are not plain English in plain letters
  ("unreadable") or name someone the student never named ("new_name"); and
  when it is not what a line of its kind has to be (an observation that is a
  sentence of story or says what would be, a question that does not ask). A
  dropped line is never repaired: the note goes with it.
- crisis_now: the short list of first-person, present or future tense
  statements that get the hand-off instead of a review or a next question.
- record_wording, record_items: the record's own words for an activity or an
  award, built from the row, so nothing shown as "your record says" is the
  model's wording.
- validate_review, validate_areas: the whole code check of a review, and of
  the areas found in a record.

Everything here runs on text a student or a model wrote, so it is treated as
hostile. Each function is linear in its input: the phrase patterns only ever
see a line capped at LINE_MAX characters, the crisis patterns are anchored on
literal words, and quote matching is one pass to prepare a text and one
substring search, so a 20000-character draft or note cannot stall the single
worker.
"""
import re
import unicodedata
from typing import Optional

CHECKS = ("prompt", "specificity", "presence", "point", "length", "consistency", "overlap")
NOTE_CHECKS = tuple(c for c in CHECKS if c != "length")      # length is written by code, never by the model
KINDS = ("personal_statement", "supplement")
ESSAY_STATUS = ("idea", "drafting", "revising", "done")

PS_MIN, PS_MAX = 250, 650
LIMIT_MIN, LIMIT_MAX = 50, 1000
REVIEW_MIN_WORDS = 50
BODY_MAX = 20000

MAX_NOTES = 12
MAX_CUTS = 6
QUOTE_MIN_WORDS, QUOTE_MAX_WORDS = 3, 60
CUT_MAX_WORDS = 150

# Where a brainstorm can begin; the student picks one.
TALK_STARTS = {
    "personal": "Something personal about who you are",
    "challenge": "A challenge, setback or failure",
    "growth": "A time you changed or grew",
    "curiosity": "Something you can't stop thinking about",
    "people": "Your family, a community, or someone who shaped you",
    "open": "Not sure yet",
}

_HANDOFF_HELP = ("This sounds like more than an essay. Please talk to an adult you trust or your school counselor "
                 "today. If you are in crisis or thinking about hurting yourself, call or text 988, the Suicide and "
                 "Crisis Lifeline, any time.")
# For a draft: the essay stays exactly where it is, so "saved" is true.
HANDOFF = _HANDOFF_HELP + " Your writing is saved, and Quill will be here after."
# For a brainstorm: a talk that ends this way keeps nothing they typed, so it
# does not say anything was saved.
TALK_HANDOFF = _HANDOFF_HELP + " Quill will be here after."

# Field limits (the model is told the same numbers), and the lines code writes
# when the model's own line cannot be shown.
OBSERVATION_CHARS = 240
QUESTION_CHARS = 200
CHECK_LINE_CHARS = 200
CUT_REASON_CHARS = 160
SUMMARY_CHARS = 400
LINE_MAX = 400                  # the longest field: no checked line is ever longer
RAW_LINE_CHARS = 2000           # of a model's line, before it is cleaned
QUOTE_CHARS = 3000              # of a model's quote, before it is matched

DEFAULT_SUMMARY = "Quill read your draft. Its notes are below."
LINE_FLAG = "Quill looked at this and has a note below."
LINE_OK = "Nothing flagged here."
LINE_NA = {
    "consistency": "Your record has no activities or awards to compare with yet.",
    "overlap": "There is nothing else of yours to compare this with yet.",
}

AREA_CHARS = 80                 # essay_topics.area
AREA_MAX_WORDS = 8
MAX_AREAS = 5
AREA_QUESTIONS_MIN, AREA_QUESTIONS_MAX = 2, 3
AREA_QUESTION_CHARS = 200
EVIDENCE_KINDS = ("activity", "award", "course", "major", "theme", "voice")
MAX_EVIDENCE = 4
EVIDENCE_CHARS = 300

MAX_RECORD_ROWS = 30            # activities, and awards, a prompt lists
MAX_COURSES = 30
MAX_MAJORS = 8
MAX_VOICE = 8
MAX_GAPS = 6
OTHER_BODY_CHARS = 6000         # of another essay, for overlap only
MAX_OTHERS = 8
AWARD_LEVELS = ("school", "regional", "state", "national", "international")

# How much of a model's reply is looked at, so an oversized one cannot make
# the checks slow. Well above what the prompts ask for.
MAX_RAW_NOTES = 30
MAX_RAW_CUTS = 15
MAX_RAW_AREAS = 12


# ── Text ─────────────────────────────────────────────────────────────────────

# Every mark a keyboard, a phone or a model uses for a quotation mark or an
# apostrophe: curly and low ones, primes, angle and corner brackets, the
# heavy ornaments and the full-width forms.
_SINGLE_MARKS = "\u2018\u2019\u201a\u201b\u2032\u2035\u02bc\u02b9\u00b4`\u2039\u203a\u275b\u275c\uff07"
_DOUBLE_MARKS = ("\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033\u2036\u02ba\u275d\u275e\u301d\u301e\u301f\uff02"
                 "\u300c\u300d\u300e\u300f")
# Hyphens, en and em dashes, the minus sign and their small and full-width forms.
_DASH_MARKS = "\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d"
_MARKS = {**{c: "'" for c in _SINGLE_MARKS}, **{c: '"' for c in _DOUBLE_MARKS}, **{c: "-" for c in _DASH_MARKS}}
_FLAT_MAP = str.maketrans(_MARKS)
_TOKEN = re.compile(r"\S+")

# Characters that draw nothing but are letters or symbols to Unicode, so no
# category test finds them: the Hangul fillers and the blank braille cell.
# On a page each looks like a space.
_BLANKS = "\u115f\u1160\u2800\u3164\uffa0"
# Letters of other alphabets that are drawn like Latin ones. Only the phrase
# checks read through this: "\u0443ou could s\u0430y" must not get past a
# list because two of its letters are Cyrillic. A short list of the common
# ones, not every confusable there is.
_LOOKALIKES = {
    # Cyrillic
    "\u0430": "a", "\u0441": "c", "\u0435": "e", "\u0456": "i", "\u0458": "j", "\u043e": "o", "\u0440": "p",
    "\u0455": "s", "\u0443": "y", "\u0445": "x", "\u0501": "d", "\u051b": "q", "\u051d": "w", "\u04bb": "h",
    "\u04cf": "l", "\u043a": "k", "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u0406": "I", "\u0408": "J",
    "\u041a": "K", "\u041c": "M", "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0405": "S", "\u0421": "C",
    "\u0422": "T", "\u0423": "Y", "\u0425": "X",
    # Greek
    "\u03b1": "a", "\u03b5": "e", "\u03b9": "i", "\u03ba": "k", "\u03bd": "v", "\u03bf": "o", "\u03c4": "t",
    "\u03c5": "u", "\u03c1": "p", "\u03c7": "x", "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z",
    "\u0397": "H", "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O", "\u03a1": "P",
    "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
    # Latin letters drawn like plainer ones
    "\u0251": "a", "\u0261": "g", "\u0131": "i", "\u0269": "i", "\u01c0": "l",
}
_PLAIN_MAP = str.maketrans({**_MARKS, **_LOOKALIKES, **{c: " " for c in _BLANKS}})


def _text(value, limit: int = 300) -> str:
    """A record field as one line of plain text, clipped."""
    return " ".join(value.split())[:limit].strip() if isinstance(value, str) else ""


def _unseen(ch: str) -> bool:
    """A character that takes up no room on a page: a format control (the
    zero-width space and joiners, the soft hyphen, the word joiner, the
    byte-order mark, direction marks and overrides, tag characters), a
    variation selector, or the combining grapheme joiner. A text reads the
    same with or without them, so matching ignores them."""
    code = ord(ch)
    if code < 0xAD:
        return False
    return (code == 0x034F or 0xFE00 <= code <= 0xFE0F or 0x180B <= code <= 0x180F or 0xE0100 <= code <= 0xE01EF
            or unicodedata.category(ch) == "Cf")


def _flat(text: str) -> str:
    """A short text in one plain form, for comparing two labels: lowercase,
    straight quotes, every dash a hyphen, single spaces."""
    return " ".join(text.translate(_FLAT_MAP).lower().split())


def _plain(text: str, gap: str = "") -> str:
    """A line as the phrase checks read it, and only they: what a reader would
    see, in plain characters. Full-width and styled letters, ligatures and
    accented letters become plain ones, a letter of another alphabet that is
    drawn like a Latin one becomes that one, quote marks are straight, every
    dash is a hyphen, invisible characters are gone and spaces are single.
    Case is kept. Nothing shown to a student is ever made from this: a line is
    read through it, then shown as it was written.

    gap: what an invisible character becomes. Nothing, as a rule: one inside
    a word hides the word ("gram<zero width space>mar"). A space for the
    second reading breaks_rules takes of a line that has any: one standing in
    for the space between two words hides the phrase instead."""
    out = []
    for ch in unicodedata.normalize("NFKD", text.translate(_FLAT_MAP)):
        if ch.isascii():
            out.append(ch)
        elif _unseen(ch):                                   # a format control, a selector
            out.append(gap)
        elif unicodedata.category(ch) not in ("Mn", "Me"):  # not an accent a letter carries
            out.append(ch)
    return " ".join("".join(out).translate(_PLAIN_MAP).split())


def word_count(text) -> int:
    """Words separated by any whitespace: the one rule the page's live counter
    and the backend share."""
    return len(text.split()) if isinstance(text, str) else 0


def word_bounds(kind, word_limit) -> tuple[Optional[int], int]:
    """(min, max) words for an essay. A personal statement is 250 to 650
    whatever word_limit says; a supplement has no minimum and the limit the
    student set (50 to 1000)."""
    if kind == "personal_statement":
        return PS_MIN, PS_MAX
    if isinstance(word_limit, bool) or not isinstance(word_limit, int):
        return None, LIMIT_MAX
    return None, max(LIMIT_MIN, min(LIMIT_MAX, word_limit))


# ── Quotes ───────────────────────────────────────────────────────────────────

class Source:
    """A text made ready for find_quote: `norm` is the text as it is compared,
    `index[i]` is where normalised character i sits in the original, and
    `ends[i]` is where it stops there (past any invisible character that rides
    on it, so a match never splits an emoji from its variation selector)."""
    __slots__ = ("norm", "index", "ends")

    def __init__(self, norm: str, index: list[int], ends: list[int]):
        self.norm = norm
        self.index = index
        self.ends = ends


def _fold(ch: str) -> str:
    """One character as it is compared: nothing for an invisible one, a
    straight quote or a hyphen for any of their forms, lowercase otherwise. A
    ligature or an ellipsis character becomes the letters or dots it stands
    for, which is why one character can give several."""
    if ch.isascii():
        return "'" if ch == "`" else ch.lower()
    mark = _MARKS.get(ch)
    if mark is not None:
        return mark
    if _unseen(ch):
        return ""
    out = []
    for c in unicodedata.normalize("NFKD", ch).casefold():
        if c.isspace() or _unseen(c):
            continue
        out.append(_MARKS.get(c, c))
    return "".join(out)


def prepare(text) -> Source:
    """A text normalised for matching, with a map back to itself.

    Case is folded, every run of whitespace is one space, curly quotes are
    straight, every kind of dash is a hyphen with no space around it (and a run
    of them is one), and invisible characters are gone: a draft pasted with a
    direction mark, a zero-width space or an emoji's variation selector in it
    still holds the words a model copies from it. One pass, linear. Pass the
    result to find_quote or breaks_rules in place of the text when the same
    long text is searched many times (a draft, another essay)."""
    if not isinstance(text, str) or not text:
        return Source("", [], [])
    chars: list[str] = []
    index: list[int] = []
    ends: list[int] = []
    pending: Optional[int] = None       # where the whitespace before the next kept character began
    last_end = 0
    for m in _TOKEN.finditer(text):
        start, end, token = m.start(), m.end(), m.group()
        if chars and pending is None:
            pending = last_end
        last_end = end
        if token.isascii() and "-" not in token and "`" not in token:
            if pending is not None:
                if chars[-1] != "-":
                    chars.append(" ")
                    index.append(pending)
                    ends.append(pending + 1)
                pending = None
            chars.extend(token.lower())
            index.extend(range(start, end))
            ends.extend(range(start + 1, end + 1))
            continue
        for at, ch in enumerate(token, start):
            folded = _fold(ch)
            if not folded:                              # invisible: it rides on the character before it
                if ends and ends[-1] == at:
                    ends[-1] = at + 1
                continue
            for c in folded:
                if c == "-":
                    pending = None                      # no space before a dash, and none after it
                    if chars and chars[-1] == "-":
                        continue
                elif pending is not None:
                    if chars[-1] != "-":
                        chars.append(" ")
                        index.append(pending)
                        ends.append(pending + 1)
                    pending = None
                chars.append(c)
                index.append(at)
                ends.append(at + 1)
    return Source("".join(chars), index, ends)


def _as_source(text) -> Source:
    return text if isinstance(text, Source) else prepare(text)


_WRAP = " \t\r\n\"'" + _SINGLE_MARKS + _DOUBLE_MARKS + "\u2026"
_EDGE_PUNCT = " .,;:!?()[]"


def _unwrap(quote: str) -> str:
    """A quote without what a model wraps around it: quotation marks, a
    leading or trailing ellipsis, spaces. A single final full stop is the
    student's own punctuation and stays."""
    while True:
        bare = quote.strip(_WRAP)
        if bare.startswith(".."):
            bare = bare.lstrip(".")
        if bare.endswith(".."):
            bare = bare.rstrip(".")
        if bare == quote:
            return bare
        quote = bare


def _needles(quote: str) -> list[str]:
    """The forms of a quote to look for, strictest first: as given, then
    without punctuation at its edges (a model often ends a quote with a full
    stop the draft does not have there)."""
    bare = _unwrap(quote[:QUOTE_CHARS])
    first = prepare(bare).norm
    second = prepare(_unwrap(bare.strip(_EDGE_PUNCT))).norm
    return [n for n in dict.fromkeys((first, second)) if n]


def _find(needle: str, source: Source) -> Optional[tuple[int, int]]:
    at = source.norm.find(needle) if needle else -1
    if at < 0:
        return None
    return source.index[at], source.ends[at + len(needle) - 1]


def find_quote(quote, body) -> Optional[tuple[int, int]]:
    """(start, end) character offsets of `quote` in `body`, or None.

    Matching ignores case, runs of whitespace, and the difference between
    straight and curly quotes and between hyphens and dashes; a leading or
    trailing ellipsis or quote mark on `quote` is stripped first. The offsets
    are into the ORIGINAL body: body[start:end] is the student's own text,
    whatever the model's copy of it looked like. Linear time. `body` may be a
    string or a prepare()d Source."""
    if not isinstance(quote, str):
        return None
    source = _as_source(body)
    if not source.norm:
        return None
    for needle in _needles(quote):
        hit = _find(needle, source)
        if hit:
            return hit
    return None


def _quote_ranges(s: str) -> list[tuple[int, int]]:
    """Where the quoted words sit in `s`, whose marks are already straight:
    (start, end) of what is between each pair, the double-quoted ones first.

    An apostrophe inside a word (don't, coach's) is not a quotation mark. A
    double quote that is opened and never closed still counts, to the end of
    the line: a line cut short must not hide what it was quoting."""
    doubles: list[tuple[int, int]] = []
    singles: list[tuple[int, int]] = []
    at = 0
    for n, piece in enumerate(s.split('"')):
        end = at + len(piece)
        if n % 2:
            doubles.append((at, end))
        else:
            opened = None
            for i in range(at, end):
                if s[i] != "'":
                    continue
                before = s[i - 1] if i > at else " "
                after = s[i + 1] if i + 1 < end else " "
                if opened is None:
                    if not before.isalnum() and not after.isspace():
                        opened = i
                elif not after.isalnum() and not before.isspace():
                    singles.append((opened + 1, i))
                    opened = None
        at = end + 1
    return [(a, b) for a, b in doubles + singles if any(c.isalnum() for c in s[a:b])]


def quoted_spans(text) -> list[str]:
    """Every "..." or '...' span (straight or curly) in a line.

    An apostrophe inside a word (don't, coach's) is not a quotation mark. A
    double quote that is opened and never closed still counts, to the end of
    the line: a line cut short must not hide what it was quoting."""
    if not isinstance(text, str) or not text:
        return []
    straight = text.translate(_FLAT_MAP)
    return [straight[a:b].strip() for a, b in _quote_ranges(straight)]


# ── What a line may not say ──────────────────────────────────────────────────
# The promise made concrete. A line a model wrote is read in four steps
# (breaks_rules), and each closes a way round the step before it.
#
# 1. It is read as a reader sees it (_plain): invisible characters, full-width
#    and styled letters, accents and look-alike letters cannot hide a phrase.
#    A line that has invisible characters is read twice, once with each taken
#    out and once with each as a space.
# 2. The words inside quotation marks must be the student's own or the
#    record's ("new_text"). Once they are proven so they are masked, together
#    with the record's own names (name_pattern), so everything after this step
#    reads the model's words only. Quoting a draft about a spelling bee never
#    trips the mechanics list, and a rule can say something about every word
#    that is the model's. What is masked is exactly what was proven
#    (_mask_quotes), or the line goes.
# 3. What is left must be an observation or a question. It may not speak in
#    the first person ("first_person": an essay is written as "I", and
#    Quill's notes never are, so a sentence with "I" or "my" in it outside a
#    quote is essay text), open a sentence with an instruction (_instructs:
#    "Add a line", "Move this up"), say what should be or where something
#    could go (_prescribes), start a new sentence of story after a colon or
#    a dash (_introduces), or use any of the phrasings a suggestion, an
#    addition or a move is actually written in (_REWRITE, _STEERS): all
#    "rewrite".
# 4. And it may not comment on mechanics or predict how the essay will do.
#    These two lists read past the words that are the student's own subject
#    (_own_subject): a typo on a sign in their story is not a typo in their
#    draft.
# 5. Its own words are plain English in plain letters ("unreadable"), and the
#    names in them are ones the student used ("new_name").
# 6. It is what a line of its kind has to be (STATEMENT, QUESTION, OPEN,
#    further down): the lists say what no line may say, and these say what an
#    observation or a question is. They are rules of shape, so they hold
#    whatever words a line finds: a sentence of story has no word for the
#    draft in it, a forecast says "will", a suggestion dressed as a question
#    opens "could the".
#
# The lists are phrasings, and no list of phrasings is complete. Run against
# suggestions, corrections and forecasts worded on purpose to avoid them, a
# large share still gets through ("the lab has earned a paragraph of its
# own", "the last line clunks", "this is a yes"), and a model set on it can
# still write a new essay sentence by dressing it as a note ("The draft says
# the gym smelled of rain") or putting it in the present tense. What the
# lists do is take away the plain ways of saying it, the ones a model reaches
# for first, and the rules of shape take away the forms those come in. The
# schema (no field for essay text), the length limits and the prompts carry
# the rest. Every pattern only ever sees a line
# of at most LINE_MAX characters, and every gap in one is bounded, so none can
# run long.

_FILLERS = r"(?:(?:maybe|perhaps|then|also|just|please|simply|instead|next|now|here|first|so|or|and|but),? ){0,2}"
# Where an instruction can begin: the start of the line, or just after the end
# of a sentence, a colon, a comma, a dash or an opening bracket.
_AT = r"(?:^|(?<=[.!?;:,] )|(?<=[.!?]['\")] )|(?<= - )|(?<=\())"
_START = _AT + _FILLERS
_YOU = (r"(?:\byou (?:could|might|should|can|may|ought to|(?:may|might|will|would) (?:want|need) to)"
        r"(?: (?:also|even|just|always|simply|instead|then|maybe|perhaps|probably|still)){0,2}"
        r"|\byou(?:'ll|'d) (?:want|need) to)")
_LEAD = rf"(?:{_START}|{_YOU} |\bwhy (?:don't|not|do not) (?:you )?|\bi(?:'d| would) |\bworth )"
_WRITING = (r"(?:writing|saying|rephrasing|rewording|rewriting|opening|starting|beginning|ending|closing|adding|"
            r"describing|using|putting|phrasing|wording|showing|telling|replacing|changing|swapping|including|"
            r"mentioning|focusing|leading)")
_WRITE = (r"(?:write|say|rephrase|reword|rewrite|open|start|begin|end|close|add|describe|use|put|phrase|show|tell|"
          r"replace|change|swap|include|mention|focus|lead)")
_BETTER = (r"(?:better|stronger|clearer|sharper|tighter|punchier|more (?:vivid|specific|powerful|effective|concise|"
           r"direct|precise|engaging|compelling|descriptive|interesting|memorable|natural))")
_PIECE = (r"(?:word|phrase|phrasing|wording|sentence|line|opening|opener|ending|closing|conclusion|hook|title|verb|"
          r"adjective|transition|introduction|intro|way to (?:say|put|phrase|open|start|begin|end|close|write))")
_TEXT_PIECE = (r"(?:words?|phrases?|sentences?|lines?|opening|ending|paragraphs?|title|verbs?|order|wording|"
               r"introduction|intro|conclusion)")
# A piece of an essay that could be added, and a part of one that could be
# said to need something.
_PIECES = (r"(?:sentences?|lines?|paragraphs?|scenes?|examples?|descriptions?|anecdotes?|transitions?|sections?|"
           r"openings?|endings?|conclusions?|introductions?|intros?|hooks?|images?|quotes?|dialogue|passages?)")
_PART = (r"(?:essay|draft|piece|story|paragraph|opening|opener|ending|introduction|intro|conclusion|sentence|line|"
         r"passage|scene|section|part|beginning|middle|closing)")
# The ones of those that mean nothing but the essay ("the part would not fit"
# is a robot, "the scene would repeat every night" is a play).
_ESSAY_PART = r"(?:essay|draft|paragraph|opening|ending|introduction|intro|conclusion|sentence)"
_PLACING = r"(?:open|start|begin|end|close|finish|lead)"
# What a verified quotation, and a name from the record, are replaced with
# before the phrase checks run. Neither is a word, so no list matches inside
# one, and a pattern can still say where a quotation stands ("move qzq up").
_MASK, _NAME_MASK = "qzq", "qzn"

_REWRITE = [re.compile(p) for p in (
    # "you could say", "you might open with", "you should rephrase"
    rf"{_YOU} (?:say|write|open with|open by|start with|start by|begin with|begin by|end with|end on|end by|"
    r"close with|close by|finish with|lead with|rephrase|reword|rewrite|phrase (?:it|this|that)|"
    r"word (?:it|this|that)|put (?:it|this|that))\b",
    rf"{_YOU} add (?:\w+ ){{0,3}}?(?:sentences?|lines?|details?|examples?|scenes?|paragraphs?|descriptions?|"
    r"anecdotes?|reflection|context|explanation|transitions?|dialogue|quotes?|specifics|more|here|something)\b",
    r"\byou (?:need|have|ought) to (?:add|include|mention|rewrite|rephrase|reword|cut (?:this|that|the|it)|"
    r"(?:open|start|begin|end|close|lead) with)\b",
    # "The essay could open with the dock." (Open with / End on, as an
    # instruction, is _instructs.)
    r"\b(?:essay|draft|piece|story|paragraph|opening|ending|introduction|conclusion|sentence|line) "
    r"(?:could|should|might|can|needs to|ought to) (?:instead )?(?:open|start|begin|end|close|lead|say|read)\b",
    # "try writing", "try saying", "you could try to describe", "Try: ..."
    rf"{_LEAD}try (?:to )?(?:{_WRITING}|{_WRITE})\b",
    rf"{_START}try\s*:",
    rf"{_START}try (?:this|that|it|a|an|the|some|something)\b",
    # "consider writing", "you might consider rephrasing"
    rf"(?:{_LEAD}|\bmight |\bcould |\bshould )consider(?:ing)? (?:\w+ ){{0,2}}?{_WRITING}\b",
    # "instead write", "instead, say", "instead of listing them, describe one"
    r"\binstead,? (?:of [^.!?]{1,80}?, ?)?(?:you (?:could|might|should|can) )?(?:just |simply |try (?:to )?)?"
    r"(?:write|say|open|start|begin|end|use|put|describe|show|tell|add|writing|saying|describing|showing|telling|"
    r"using)\b",
    # "replace ... with", "change ... to", "swap ... for". "change" is also an
    # ordinary word in feedback ("how did that change the way you talk to
    # him?"), so it counts only where it is an instruction (it opens a
    # sentence, or follows "you could"), or where what is changed is a piece
    # of the text.
    r"\breplac(?:e|es|ed|ing)\b[^.!?]{1,80}?\bwith\b",
    rf"(?:{_LEAD}|\bconsider |\btry |\bsuggest )chang(?:e|ing) [^.!?]{{1,80}}?\b(?:to|into)\b",
    rf"\bchang(?:e|ing) (?:the|this|that|your|its|a|an|one|each|every) (?:\w+ )?{_TEXT_PIECE}\b[^.!?]{{0,60}}?"
    r"\b(?:to|into)\b",
    r"\bchang(?:e|ing) (?:it|this|that) (?:to|into)\b",
    r"\bchang(?:e|ing) (?:qzq|[\"'][^\"']{1,60}[\"']) (?:to|into)\b",
    r"\bswap(?:ping)? [^.!?]{1,60}?\b(?:for|with)\b",
    # "rewrite it as", "rephrase", "reword"
    r"\b(?:rephras|reword)\w*",
    r"\brewrit(?:e|ing|ten) (?:it|this|that|them|these|those)\b",
    rf"(?:{_LEAD}|\bconsider |\btry (?:to )?)rewrit(?:e|ing)\b",
    r"\ba rewrite\b|\brewritten (?:as|to|so)\b|\brewrite (?:\w+ ){0,4}?as\b",
    # "something like", "along the lines of", "a line like"
    r"\bsomething (?:like|along the lines of|such as|similar to|more like)\b|\balong the lines of\b",
    r"\b(?:a|an|one|another) (?:\w+ )?(?:line|sentence|opening|ending|phrase|word|paragraph) like\b[^.!?]{0,80}?"
    r"\b(?:would|could|might|should|can)\b",
    # "a better word", "a stronger opening", "a stronger first line", "a clearer way to say it"
    rf"\b(?:a|an|the|some|one) (?:(?:much|far|slightly|even) )?{_BETTER} (?:\w+ )?{_PIECE}\b",
    r"\bbetter (?:word|phrase|phrasing|wording)s?\b",
    # "how about: ...", "how about opening with"
    r"\b(?:how|what) about\s*:",
    rf"\bhow about (?:{_WRITING}|something\b|this\b|a (?:line|sentence|scene|paragraph)\b|an opening\b)",
    # The ways new text gets introduced, and a reader's verdict on how it "reads".
    r"\b(?:for example|for instance|e\.g\.?|such as|like this|like so)\s*:",
    r"\bhere(?:'s| is| are) (?:a|an|one|another|my|some|the) (?:\w+ )?(?:version|rewrite|example|way to|option|"
    r"revision|suggestion|alternative|draft|take|fix|edit)\b",
    r"\b(?:revised|rewritten|improved|edited|polished|corrected|suggested|reworked) (?:version|sentence|line|"
    r"opening|ending|paragraph|wording|draft|text)\b",
    r"\bmy (?:suggestion|rewrite|version|edit|revision|fix)\b",
    r"\bi(?:'d| would)(?: (?:also|just|probably|instead|personally))? (?:say|write|open|start|begin|end|rephrase|"
    r"reword|rewrite|change|replace|cut|add|put|use|phrase|go with|suggest|recommend)\b",
    r"\bi (?:suggest|recommend|propose)\b",
    r"\bwhy not (?:say|write|open|start|begin|end|add|use|try|describe|show|tell|put)\b",
    r"\b(?:could|should|might|can) be (?:re)?(?:written|phrased|worded)\b(?! (?:about|by|for|in) (?:any|every|"
    r"anyone|anybody|someone|many|most|a thousand)\b)",
    r"\b(?:should|could|might) (?:instead )?read\s*(?::|as\b|like\b|[\"'])",
    r"\b(?:reads?|sounds?|flows?) (?:better|stronger|clearer|smoother)\b",
)]

# The phrasings a suggestion, an addition or a move is written in when it is
# not one of the plain ones above: dressed as a question, said about the essay
# ("the draft needs", "the ending could"), made of the student's own quoted
# words ("qzq belongs first"), or introduced by a label and a colon.
_STEERS = [re.compile(p) for p in (
    # A suggestion dressed as a question: "could you add a line", "can you
    # start with the dock", "have you considered adding a scene", "what if
    # the essay opened with the call". "Could you describe the dock?" asks for
    # a memory and is left alone.
    r"\b(?:could|can|would|will|might|should|may|shall) you (?:\w+ ){0,2}?(?:add|include|insert|put in|work in|"
    r"weave in|mention|write|rewrite|state)\b",
    r"\b(?:could|can|would|will|might|should|may|shall) you (?:\w+ ){0,2}?(?:say|tell (?:us|the reader|readers)|"
    r"explain|show) that\b",
    r"\b(?:could|can|would|will|might|should|may|shall) you (?:\w+ ){0,2}?show (?:us|the reader|readers|the|this|"
    r"that|more)\b",
    rf"\b(?:could|can|would|will|might|should|may|shall) you (?:\w+ ){{0,2}}?{_PLACING} (?:with|by|at|on|in|off|"
    r"the essay|the draft|the piece|it|this)\b",
    r"\b(?:do you want to|would you like to|are you willing to|might you|why don't you|why do you not|how about|"
    r"should you|shouldn't you) (?:\w+ ){0,2}?(?:add(?:ing)?|includ(?:e|ing)|insert(?:ing)?|mention(?:ing)?|"
    r"writ(?:e|ing)|rewrit(?:e|ing)|(?:open|start|end|lead)(?:ing)? with|begin(?:ning)? with|clos(?:e|ing) with|"
    r"say(?:ing)? (?:that|you)\b|mov(?:e|ing) (?:the|this|that|it|qzq)|us(?:e|ing) qzq)",
    r"\bwhat about (?:\w+ ){0,2}?(?:adding|including|inserting|mentioning|writing about|(?:opening|starting|ending|"
    r"leading|closing|beginning) with|moving (?:the|this|that|it|qzq))\b",
    rf"\bwhat if (?:the|this|that|your) (?:\w+ ){{0,2}}?{_PART}\b",
    rf"\bwhat if you (?:\w+ )?(?:add(?:ed)?|includ(?:e|ed)|insert(?:ed)?|mention(?:ed)?|wrote|rewrote|described|"
    rf"(?:{_PLACING}(?:e?d)?|began|led) (?:with|by|at|on|off|the essay|the draft|it|this)|"
    r"moved (?:the|this|that|it|qzq)|cut (?:the|this|that|it|qzq)|said that|swapped|used qzq)\b",
    rf"\bhave you (?:ever )?(?:thought (?:about|of)|considered|tried) (?:\w+ ){{0,2}}?(?:(?:adding|including) "
    rf"(?:\w+ ){{0,3}}?(?:{_PIECES}|details?|more|something)|(?:opening|starting|beginning|ending|closing|leading) "
    r"(?:with|by|at|on|the essay|the draft)|moving (?:the|this|that|it|qzq)|cutting (?:the|this|that|it|qzq)|"
    r"rewriting|rephrasing|mentioning)\b",
    # The same thing as a what-would-happen: "if you began with the dock",
    # "what would a first line about the dock look like".
    rf"\bif (?:you (?:opened|began|started|ended|closed|led) (?:with|at|on|in|by)|(?:the|this|that|your) "
    rf"(?:\w+ ){{0,2}}?{_PART} (?:opened|began|started|ended|closed|said|read|were|was|came|went|moved)|"
    r"it (?:opened|began|started|ended|closed) (?:with|at|on|in|by))\b",
    r"\bwhat (?:would|might|could) (?:a|an|the|your) (?:\w+ ){0,2}?(?:lines?|sentences?|paragraphs?|opening|"
    r"ending|scene)\b[^.!?]{0,60}?\b(?:look like|be|say|sound like|read)\b",
    r"\bwhat would you (?:write|add|put in|open with|start with|begin with|end with|close with)\b",
    r"\bwhat would it (?:look|sound|feel|read) like (?:to|if) (?:you )?(?:start|begin|open|end|close|lead|say|write|"
    r"add|tell|show|describe|put|move|cut)",
    r"\b(?:to|could|should|might|would|can|just|simply) (?:say|write|state|mention|add|tell (?:us|the reader)) "
    r"(?:that |so |how )?you (?:learned|realized|realised|grew|became|discovered|overcame|changed)\b",
    rf"\b(?:should|shouldn't|could|couldn't|might|would|wouldn't|can) (?:the|this|that|your|its) (?:\w+ ){{0,2}}?"
    rf"{_PART} (?:not )?(?:instead )?(?:open|start|begin|end|close|lead|say|read|be|include|mention|show|name|"
    r"move|go|come|have|use|answer|return|work)\b",
    r"\b(?:should|shouldn't) (?:it|this|that|you) (?:not )?(?:say|write|open|start|begin|end|add|include|mention|"
    r"use|move|cut|be (?:first|last|earlier|later|moved|cut))\b",
    r"\bwould it (?:work|help|be (?:better|worth|possible|stronger|clearer)) (?:to|if)\b",
    r"\bwould (?:opening|starting|beginning|ending|closing|leading|adding|including|moving|cutting|using) \w",
    rf"\b(?:would|could|should|might) (?:\w+ ){{0,4}}?{_PLACING} the (?:essay|draft|piece|paragraph|story)\b",
    # What the essay "needs": never said, because it says what to add.
    r"\b(?:needs?|could use|can use|would benefit from|benefits? from|calls? for|cries out for) "
    r"(?:(?:an?|another|one more|one|some|more|a few|a bit of|a little|further|its own) )?(?:\w+ ){0,2}?"
    rf"(?:{_PIECES}|details?|specifics|context|reflection|explanation|background)\b",
    r"\b(?:needs?|could use|can use|wants?) (?:\w+ )?more (?:about|of you|on|details?|description|context|"
    r"specifics|explanation|reflection|development|depth|background)\b",
    r"\bmore (?:details?|description|context|specifics|explanation|reflection|background|depth)\b[^.!?]{0,60}?"
    r"\b(?:is|are) needed\b",
    r"\b(?:lacks?|is missing|are missing|has no|have no|is without|there is no|there's no) "
    r"(?:(?:an?|any|its|one) )?(?:\w+ ){0,2}?(?:sentences?|lines?|paragraphs?|scenes?|examples?|descriptions?|"
    r"anecdotes?|transitions?|sections?) (?:about|on|of|describing|showing|saying|that (?:shows|says|tells|"
    r"explains|names)|to (?:show|say|explain|tell))\b",
    # "The ending could ...", "the line needs to ...", "this should be moved".
    # "This part could go" is how a cut is talked about, and stays.
    rf"\b{_ESSAY_PART} (?:could|might|would|can|may) (?:also |still |instead |then |just |really |simply |even )?"
    r"(?!go\b|be cut\b|be removed\b|come out\b|mean\b|refer\b|be read (?:two|either|both|in two)\b|"
    r"(?:be (?:written|said|told|true|sent|found|used|read)|appear|belong|fit|apply|describe|come) "
    r"(?:about |by |for |in |of |to |at |from )?(?:any|every|anyone|anybody|someone|many|most|another)\b|"
    # "could be in anyone's essay", "would read the same about a different club"
    r"(?:be|appear|belong|fit|apply|describe|come|stand|read the same)\b[^.!?]{0,30}?\b(?:any|anyone|anyone's|"
    r"anybody|anybody's|every|everyone|everyone's|someone else|someone else's|a different|almost)\b)\w",
    rf"\b{_ESSAY_PART} (?:should|must|needs to|need to|has to|have to|ought to|wants to)\b",
    rf"\b{_PART} (?:could|might|would|can|may|should|must|needs to|need to|has to|have to|ought to) "
    r"(?:also |still |instead |then |just |really |simply |even )?(?:open|start|begin|end|close|lead|say|"
    r"read(?! the same\b)|become|move|use|include|mention|show|benefit|land|answer|serve|carry|do more|work better|"
    r"be (?:cut down|moved|shortened|trimmed|split|merged|expanded|developed|replaced|rewritten|stronger|clearer|"
    r"sharper|tighter|better|your|the|first|last|earlier|later)|go (?:first|last|earlier|later|at the|in the|"
    r"before|after)|come (?:first|last|earlier|later|sooner|before|after)|have (?:a|an|more|another))\b",
    r"\b(?:this|that|it) (?:could|should|might|would|can|must|needs to|ought to|has to) (?:instead |also |just )?"
    rf"(?:{_PLACING} (?:with|by|at|on|in|here|there|earlier|sooner|later|the essay)|say (?:that|more|so)\b|"
    r"read (?:as|like)\b|become\b|be (?:re)?(?:written|phrased|worded|moved|fixed|shortened|trimmed|split|merged|"
    r"expanded|developed|replaced|changed|deleted|tightened|condensed|combined)\b|move (?:to|up|down|earlier|later)"
    r"|go (?:first|last|earlier|later|at the|in the|before|after)|come (?:first|last|earlier|later|sooner|before|"
    r"after)|use (?:a|an|more|some|qzq)\b|include\b|mention\b|benefit\b|have (?:a|an|more|another) )",
    # An edit made of the student's own words: "qzq could move to the top",
    # "qzq belongs first", "works better as the opening".
    r"\bqzq (?:could|should|might|would|can|must|needs to|ought to|has to) (?:also |instead |just )?(?:move|go|"
    r"come|open|start|begin|end|close|lead|be (?:your|the|a|an|moved|cut|placed|first|last|earlier|later)|become|"
    r"replace|serve|work|sit|stand|anchor|frame)\b",
    rf"\b(?:{_PIECES}|qzq|details?|moments?|stor(?:y|ies)|parts?)\b[^.!?]{{0,60}}?\bbelongs (?:first|last|earlier|"
    r"later|here|there|up top|at the (?:top|start|beginning|end|bottom|front)|in the (?:opening|first|last|ending|"
    r"introduction|conclusion|middle)|near the (?:top|start|beginning|end)|before|after)\b",
    rf"\b(?:{_ESSAY_PART}|line|passage|qzq) (?:\w+ )?(?:fits?|works?|lands?|reads?|sounds?|flows?|hits?|goes) "
    r"(?:much |far |even |a lot |a bit |a little )?(?:better|best|stronger|harder|cleaner|smoother|"
    r"more naturally)\b",
    # Length is the app's to count, and what to do with spare words is never said.
    r"\b(?:room|space) (?:to (?:add|include|say|tell|write|expand|describe|explain|mention|show|go deeper|develop)|"
    rf"for (?:(?:an?|another|more|one more|some|a whole|a few) )?(?:\w+ )?(?:{_PIECES}|details?|words))\b",
    r"\b\d+ (?:more|extra|additional|or so more) words\b|\b\d+ words? (?:short|under|shy|to spare|left|below|"
    r"to go|to fill|to work with)\b",
    r"\banother (?:paragraph|sentence|line|scene)\b[^.!?]{0,60}?\b(?:would|could|might)\b",
    # "Adding a detail here would strengthen it", "would be stronger with a scene".
    rf"{_START}(?:adding|including|inserting|mentioning|opening with|starting with|beginning with|ending with|"
    r"closing with|leading with|cutting|moving|expanding|developing|describing|naming|showing|using) "
    r"[^.!?]{0,80}?\b(?:would|could|might|may|will|can|should|helps?|strengthens?|improves?)\b",
    r"\bwould (?:make (?:it|this|that|the \w+|this \w+|that \w+|your \w+)|read|sound|land|flow) "
    r"(?:\w+ )?(?:stronger|clearer|sharper|tighter|punchier|harder|richer|improved|more (?:vivid|specific|"
    r"powerful|effective|concise|direct|precise|engaging|compelling|descriptive|interesting|memorable|natural|"
    r"complete|concrete))\b",
    r"\b(?:this|that|it) would be (?:\w+ )?(?:stronger|clearer|sharper|tighter|punchier|richer|improved|"
    r"more (?:vivid|specific|powerful|effective|concise|direct|precise|engaging|compelling|complete|concrete)) "
    r"(?:if|with|by|as|were|here)\b",
    r"\bwould (?:strengthen|improve|sharpen|tighten|deepen|enrich|complete|elevate|enhance) (?:the|this|that|your) "
    r"(?:\w+ )?(?:essay|draft|paragraph|passage|opening|ending|piece|story|scene|sentence|line|point|writing)\b",
    rf"\b{_PART} would (?:be|read|sound|work|land|flow) better\b",
    r"\bimagine (?:the|this|your) (?:\w+ )?(?:essay|draft|piece|paragraph|opening|ending|first|last)\b",
    # New text introduced by a label and a colon: "Opening line: ...",
    # "Shorter: ...", "Your last line could be: ...".
    r"(?:^|(?<=[.!?;] ))(?:\w+ ){0,3}?(?:line|sentence|paragraph|opening|opener|ending|version|hook|title|thesis|intro|"
    r"introduction|conclusion|transition|wording|phrase|suggestion|option|alternative|idea|rewrite|revision|fix|"
    r"correction|closer|shorter|tighter|better|stronger|clearer|simpler|cleaner|briefer|instead|maybe|perhaps|"
    r"new|revised|edited|corrected)(?: \w+)?\s?: ?(?!qzq)\S",
    r"\b(?:could|would|might|should|can) (?:be|read|say|go|open|start|begin|end)\s?:",
    # A statement with a question mark hung on it is not a question.
    r", (?:right|correct|no|yes|true|isn't it|is it not|doesn't it|didn't it|wasn't it|aren't you|weren't you|"
    r"don't you(?: think)?|didn't you|wouldn't it|wouldn't you(?: say| agree)?|huh|eh|ok|okay)\?",
    # What is "missing", said of a piece of writing: it names what to add.
    # (The review prompt asks for "the point is missing" and for the part of
    # the essay prompt that goes unanswered, and "you are missing from this
    # paragraph" says what the draft does: all three pass.)
    rf"\b(?:{_PIECES}|details?)\b[^.!?]{{0,60}}?\b(?:is|are) (?:still |also )?missing\b",
    rf"\bmissing (?:a|an|another|one more|some|any|its) (?:\w+ )?(?:{_PIECES}|details?)\b",
    r"\b(?:paragraph|opening|ending|introduction|intro|conclusion|sentence|passage|scene|section|beginning|middle|"
    r"closing|line) (?:is|are|seems?|feels?) (?:still |also )?missing (?:the|a|an|your|its|any|some|one)\b",
    # What something "deserves", what "would help", what is "worth" doing,
    # what is "an option": advice in the words advice is not usually given in.
    rf"\b(?:deserves?|earns?|has earned|have earned|merits?|warrants?) (?:\w+ ){{0,3}}?(?:{_PIECES}|space|room|"
    r"attention|time|words|detail|page)\b",
    r"\bbelongs? (?:in|at|near) (?:the )?(?:paragraph|opening|first|last|beginning|end|top|start|intro|introduction|"
    r"conclusion|ending)\b|\bbelongs? (?:first|last|earlier|later|up front|here)\b|\bup front\b",
    r"\bwould (?:gain|profit) from\b",
    r"\b(?:would|might|could|may|will|does) help (?:to (?:see|hear|know|read|have|learn|show|say|name|describe|add|"
    r"include|explain)|if (?:the|this|that|you|your|qzq))\b",
    r"\bmore (?:\w+ ){0,2}?(?:about|on|of|from) [^.!?]{1,60}?\b(?:would|could|might|will) (?:help|go a long way|"
    r"be (?:good|welcome|useful|helpful|nice|worth))\b",
    r"\bworth (?:a try|trying|adding|describing|ending|opening|starting|including|mentioning|saying|showing|naming|"
    r"expanding|exploring|cutting|moving|keeping|developing|telling (?:us|the reader|readers)|writing|stating|"
    r"explaining|a (?:line|sentence|paragraph|scene|whole|full))\b",
    r"\b(?:is|are|as|be) (?:an|one|another|a good|a better|also an) option\b|\bone option is\b|\banother option\b"
    r"|\bnext step\b",
    # What a reader "needs", and what there "should be".
    r"\b(?:the |a |any |your |every )?readers? (?:needs?|deserves?|ought to|will want|would want|will need|"
    r"would need) (?:to )?\w",
    r"\bthere (?:should|needs to|ought to|has to|must) be\b"
    r"|\bthere (?:could|might|can) be (?:a|an|another|more|one more|some|room|space)\b",
    # "You need a scene here", "you'd do well to", "it would be better to".
    rf"\byou (?:need|want|could use|will need|will want|might need|may need|might want|may want)(?: to have)? "
    rf"(?:an?|another|more|some|one more|a few) (?:\w+ )?(?:{_PIECES}|details?|specifics|context)\b",
    r"\byou(?:'d| would) (?:do well|be (?:better off|wise|smart|right)) to\b|\byou(?:'re| are) better off\b"
    r"|\byour best (?:bet|move) is\b",
    r"\b(?:it|this|that) (?:would|might|may|could|will) be (?:\w+ )?(?:better|best|good|wise|smart|helpful|useful|"
    r"stronger|clearer|nice|great|worth it|worthwhile|effective) (?:to|if)\b",
    r"\b(?:essay|draft|paragraph|story|piece|opening|ending) (?:wants?|asks? for|is asking for|begs for|"
    r"cries out for) (?:an?|another|more|some)\b",
    # A verdict on an order or a cut: "stronger if", "the real opening".
    # (Where something "could return" or "should appear" is _prescribes, below.)
    rf"\b(?:{_PART}|draft|it|this|that|qzq) (?:is|would be|will be|reads|gets|feels|becomes|works) (?:\w+ )?"
    r"(?:stronger|better|tighter|clearer|sharper|richer|cleaner|faster|weaker) (?:if|with|without|once|when|after)\b",
    r"\bwithout qzq\b|\bup top\b",
    r"\b(?:real|true|actual|natural|better|best|stronger|strongest|right|proper|ideal|perfect) (?:opening|opener|"
    r"first line|ending|last line|closing line|title|hook|conclusion|order|place for|spot for|home for)\b",
    r"\bqzq (?:would|could|might|can|may|should) (?:also |really |easily )?(?:make|be|serve as|work as)\b",
    r"\b(?:if|when|once) qzq (?:comes|came|goes|went|is|were|was|moves|moved|sits|sat|opens|opened|starts|started|"
    r"ends|ended|leads|led)\b",
    r"\bfirst,? qzq,? (?:and )?then\b",
    r"(?:^|(?<=[.!?;] ))(?:start|open|begin|end|close|first|top|order|move|instead|better|new \w+)\s?: ?qzq",
    r"\b(?:should|shouldn't|could|couldn't|would|wouldn't|might|can) qzq (?:not )?(?:be|come|go|open|start|begin|"
    r"end|close|lead|move|sit|stand|work|serve|make|replace)\b",
    # The same as questions: "what if the gym came first", "would a sentence
    # about your mother fit", "is there room for the call".
    r"\bwhat if\b[^.!?]{0,80}?\b(?:came|comes|went|goes|were|was|moved|sat|stood|appeared|returned|opened|ended|"
    r"began|started|closed|led)\b[^.!?]{0,40}?\b(?:first|last|earlier|sooner|later|at the (?:end|start|top|"
    r"beginning|bottom))\b",
    rf"\b(?:would|could|might|should|wouldn't|couldn't|shouldn't|can|does|do|is there|are there) (?:an?|another|"
    rf"one more|the|some|more) (?:\w+ ){{0,2}}?(?:{_PIECES}|details?)\b[^.!?]{{0,60}}?\b(?:fit|belong|help|work|"
    r"make sense|strengthen|be worth)\b",
    r"\b(?:might|could|would|should|does|doesn't|wouldn't|couldn't|shouldn't) [^.!?]{1,40}? belong "
    r"(?:in|at|near|before|after|here|there|earlier|first)\b",
    r"\bma(?:ke|kes|de) (?:a|an|the) (?:good|great|strong|better|stronger|natural|fitting|nice|perfect|powerful) "
    r"(?:\w+ )?(?:ending|opening|opener|first line|last line|closing|conclusion|title|hook|scene|paragraph|essay|"
    r"topic|subject)\b",
    r"\b(?:is|are) there (?:any |enough |still |some )?(?:room|space) (?:for|to)\b"
    r"|\bthere(?: is|'s| may be| might be) (?:still |enough |some |plenty of |also )?(?:room|space) (?:for|to)\b",
    r"\bhave you (?:ever )?(?:thought (?:about|of)|considered|tried) (?:bringing|putting|placing|ending|starting|"
    r"opening|closing|beginning|describing|showing|naming|expanding|developing|splitting|trimming|shortening|"
    r"focusing) [^.!?]{0,60}?\b(?:at the (?:end|start|top|beginning)|in the (?:essay|draft|opening|ending|first|"
    r"last|final)|earlier|here|back)\b",
)]

# "The gym could return at the end", "the coach might speak again before the
# end": where a thing comes in the essay, put as a possibility.
_PLACED = re.compile(
    r"\b(?:could|might|can|may)(?! you\b)(?! not\b) (?:\w+ )?(?:return|come back|reappear|appear|show up|speak|"
    r"be heard|be seen)\b[^.!?]{0,40}?\b(?:at the (?:end|start|beginning|top|bottom|close)|earlier|sooner|again|"
    r"before the end|in the (?:opening|first|last|final|closing) \w+|near the (?:end|start|top|beginning)|here)\b"
)
# "Should" outside a question is the plainest way there is to say what an
# essay ought to do: "your mother should appear earlier", "there should be a
# scene here". "Should have" is about what happened, and passes.
_SHOULD = re.compile(r"\b(?:should|shouldn't|ought to)\b(?! (?:not )?have\b)")
# The same words said back as the draft's own ("you say he told you that you
# should quit") are an observation.
_SAID_BY_THE_DRAFT = re.compile(
    r"\byou (?:say|said|write|wrote|mention|call|describe|claim|note|state|explain|tell)\b"
    r"|\b(?:draft|essay|paragraph|passage|sentence|line|opening|ending) (?:says|claims|states|mentions|describes|"
    r"calls|notes|explains|tells|names|lists)\b|\bprompt (?:asks|says|wants to know)\b"
)
_SENTENCE_STOP = re.compile(r"[.!?;](?= |$)")


def _sentence_around(flat: str, at: int) -> tuple[str, str]:
    """(the sentence up to `at`, the mark that ends it or ""). The full stop
    of "Mrs." or "a.m." ends nothing."""
    start, mark = 0, ""
    for m in _SENTENCE_STOP.finditer(flat):
        if _ABBREVIATION.search(flat[max(0, m.start() - 6):m.start()]):     # the longest is four characters
            continue
        if m.start() < at:
            start = m.end()
        else:
            mark = m.group()
            break
    return flat[start:at], mark


def _own_claim(flat: str, at: int) -> bool:
    """Whether the words at `at` are Quill's own: the sentence they stand in
    does not hand them back as something the draft says."""
    return not _SAID_BY_THE_DRAFT.search(_sentence_around(flat, at)[0])


def _prescribes(flat: str) -> bool:
    """A sentence that says where something could go, or what should be."""
    if any(_own_claim(flat, m.start()) for m in _PLACED.finditer(flat)):
        return True
    for m in _SHOULD.finditer(flat):
        before, mark = _sentence_around(flat, m.start())
        if mark != "?" and not _SAID_BY_THE_DRAFT.search(before):
            return True
    return False


# A capital letter after a colon, a dash or an opening bracket starts a new
# sentence. When that sentence opens the way a story does ("The radio hummed
# before the sun came up"), tells something in the past, and has no word in
# it about the student or the draft, it is not a note about the essay: it is
# a sentence for it. Narrow on purpose: "One thing stands out: The shop never
# appears again" is an observation, and passes.
_NEW_SENTENCE = re.compile(
    r"(?:(?<=: )|(?<= - )|(?<=\())(?:The|A|An|His|Her|Their|He|She|They|Every|On|In|At|After|Before|When|While|By|"
    r"From|With|Nobody|Everyone|Once|Until|Since|During)\b[^.!?:;()]{12,200}"
)
_ABOUT_THE_DRAFT = re.compile(
    r"\b(?:you|your|yours|draft|essay|passage|paragraph|sentences?|lines?|prompt|record|readers?|story|scene|"
    r"section|opening|ending|details?|point|subject|qzq|qzn|appears?|mentions?|names?|describes?|lists?|tells?|"
    r"says?|stops?|moves?|shifts?|turns?|skips?|stays?|repeats?|covers?|returns?|comes up|shows up)\b", re.I)
_TOLD_IN_THE_PAST = re.compile(
    r"\b(?:was|were|had|did|came|went|said|told|ran|sat|stood|took|got|made|knew|felt|saw|heard|kept|left|gave|"
    r"found|began|taught|held|fell|broke|brought|caught|grew|learned|learnt|lost|met|rode|rang|sang|spoke|spent|"
    r"swam|threw|woke|won|wore|wrote|rose|hung|shook|drove|flew|blew|drew|slid|swept|bent|lit|froze|slept|crept|dug|"
    r"sank|spun|swung|tore|bit|hid|fled|built|knelt|sent|paid|laid|sold|bought|thought|fought|chose|stole|ate|drank|"
    r"became|understood|forgot|set|[a-z]{2,}ed)\b")


def _introduces(masked: str) -> bool:
    for m in _NEW_SENTENCE.finditer(masked):
        clause = m.group()
        if (len(clause.split()) >= 4 and not _ABOUT_THE_DRAFT.search(clause)
                and _TOLD_IN_THE_PAST.search(clause)):
            return True
    return False

# "try writing", "consider saying": an instruction wherever it sits in a line,
# unless the sentence is asking about something the student did ("did you ever
# try saying no?"), which is a question about their life, not their essay.
_SUGGESTS = re.compile(r"\b(?:try|consider(?:ing)?) (?:writing|saying|rephrasing|rewording|rewriting)\b")
_ASKS_ABOUT_THE_PAST = re.compile(r"\b(?:did|didn't|have you|had you|ever)\b")
_SENTENCE_BREAK = re.compile(r"[.!?;:] ")


def _suggests(flat: str) -> bool:
    for m in _SUGGESTS.finditer(flat):
        sentence = _SENTENCE_BREAK.split(flat[:m.start()])[-1]
        if not _ASKS_ABOUT_THE_PAST.search(sentence):
            return True
    return False


# A sentence that opens with a bare verb is an instruction: "Add a line about
# the dock.", "Move this up.", "Use qzq as your first line." Quill's notes
# say what is on the page or ask, so none of theirs begins this way. The first
# list is verbs that open a sentence only as an instruction. The second is
# verbs that also open ordinary sentences ("Close to the end, the draft
# turns", "Cut from the team, you came back"), so each counts only with the
# word that makes it one.
_BARE = (
    r"add|insert|include|mention(?! of\b)|describe|rewrite|rephrase|reword|revise|restructure|reorder|rearrange|"
    r"rework|expand|elaborate|develop|flesh out|delete|remove|merge|join|combine|condense|shorten|trim|tighten|polish|"
    r"proof-?read|proof(?! of\b)|copy-?edit|copy edit|edit|fix|correct|substitute(?! teachers?\b)|replace|swap|"
    r"switch|flip|prefer|try|consider|imagine|picture|think (?:about|of)|say|write|tell|"
    r"show(?! (?:choir|business|and tell)\b)|use(?! of\b)|move(?!-in\b)|put|make|let|give|keep|drop|avoid|pick|"
    r"choose|find|be|hook|link|connect|clean up|smooth|clarify|specify|explain|illustrate|emphasi[sz]e|highlight|"
    r"introduce|unpack|zoom|slow down|dig|linger|dwell|look for|bring|weave|reframe|frame|lead|convey|"
    r"reveal|quote|cite|skip|lose|save|leave (?:out|off)|take out|go (?:deeper|further|back|into|beyond)|"
    r"return to|come back to|circle back|stay (?:with|in|on)|stick (?:with|to)|spend more|"
    r"focus (?:on|the|this|your)|go with|remember to|don't forget|do not forget|feel free to|aim (?:to|for)|"
    r"lowercase|capitali[sz]e|spell out|read it"
)
_BARE_WITH = (
    r"(?:start|begin|open|end|close|finish|conclude|wrap up|round out) (?:with|by|at|in|on|off|from|the|this|"
    r"that|your|it|here|there|where|when|each|every|a|an|qzq)|"
    r"cut (?:this|that|the|it|these|those|your|out|down|back|a|an|some|one|everything|all|qzq)|"
    r"change (?:the|this|that|your|it|these|those|qzq)|"
    r"name (?:the|a|an|one|your|this|that|what|who|it|them|each|some|at least|where|when|how)|"
    r"state (?:the|what|that|how|why|your|it|this|clearly|plainly|outright)|"
    r"split (?:this|that|the|it|these|those|your|up|qzq)|break (?:this|that|the|it|these|those|your|up|qzq)|"
    r"tie (?:this|that|the|it|these|those|your)|turn (?:this|that|the|it|these|those|your)|"
    r"shift (?:the|this|that|it|your)|place (?:the|this|that|it|your|qzq)|"
    r"hold (?:the|this|that|it|off|back)|ground (?:the|this|that|it|your)|anchor (?:the|this|that|it|your)"
)
_IMPERATIVE = re.compile(
    rf"{_AT}(?P<filler>{_FILLERS})"
    rf"(?:(?:{_BARE}) (?!(?:or|and|but|nor)\b)[\w\"']|(?:{_BARE_WITH})\b|show, don't tell)"
)
_HARD_BREAK = re.compile(r"[.!?;] ")
_CONTINUES = frozenset({"and", "then", "but", "or", "also", "next"})
_SUBORDINATE = re.compile(r"(?:if|when|once|since|because|to|before|after|while|as|for|with|whenever|unless|until|"
                          r"given)\b")
_SECOND_PERSON = re.compile(r"\byou\b")


def _instructs(flat: str) -> bool:
    """Whether a sentence of the line opens with a bare instruction verb.

    After a comma or a colon the same words can be the rest of what "you" do
    in the draft ("You open with the tournament, then describe the bus ride",
    "What did you see, say or do?"), which is an observation or a question
    and passes. "If you want the reader in the room, describe it" is still an
    instruction: the clause before the comma only sets it up."""
    for m in _IMPERATIVE.finditer(flat):
        at = m.start()
        if at >= 2 and flat[at - 2:at] in (", ", ": "):
            sentence = _HARD_BREAK.split(flat[:at])[-1]
            fillers = m.group("filler").replace(",", " ").split()
            if (all(word in _CONTINUES for word in fillers) and _SECOND_PERSON.search(sentence)
                    and (fillers or not _SUBORDINATE.match(sentence))):
                continue
        return True
    return False


def _steers(flat: str) -> bool:
    return (_suggests(flat) or _instructs(flat) or _prescribes(flat) or any(p.search(flat) for p in _REWRITE)
            or any(p.search(flat) for p in _STEERS))


# Essay text is written in the first person. Quill's notes are not: they say
# "this passage", "the draft", "you". So a first-person word in the model's
# own words (the student's quoted ones are masked by now) is the surest sign
# of a sentence written for the essay, whatever introduces it: a colon, a
# dash, brackets, "would land harder as", or nothing at all.
_FIRST_PERSON = re.compile(
    r"(?<![\w'-])(?:i(?:'m|'d|'ll|'ve)?|me|my|myself|(?<!the )(?<!a )(?<!coal )(?<!gold )mine|"
    r"we(?:'re|'ve|'ll|'d)?|our|ours|ourselves|us)(?![\w'-])", re.I)
# "Algebra I", "World War I": a capital I after a capitalised word, where the
# sentence stops or goes on the way it does after a numeral.
_NUMERAL_GOES_ON = re.compile(r"(?:$|[.,;:!?)]| (?:and|or|in|at|as|with|for|to|class|classes|course|honors|"
                              r"through|level)\b)")
_TELL_ME = re.compile(r"\btell me\b", re.I)


def _first_person(masked: str) -> bool:
    for m in _FIRST_PERSON.finditer(masked):
        word = m.group()
        if word == "US" or (word.lower() == "i" and masked.startswith(".e", m.end())):
            continue                                        # the country, and "i.e."
        if word == "I" and m.start() and masked[m.start() - 1] == " ":
            before = masked[:m.start() - 1].rsplit(" ", 1)[-1]
            if before[:1].isupper() and _NUMERAL_GOES_ON.match(masked, m.end()):
                continue
        return True
    return False


# "tense" is also an ordinary word (a tense room), so it only counts where it
# is grammar: named ("past tense"), plural, doing something ("the tense
# shifts"), or standing as a noun at the end of its phrase ("watch your tense").
_TENSE = (
    r"\b(?:past|present|future|verb|perfect|progressive) tenses?\b"
    r"|\btenses\b"
    r"|\btense (?:shift|shifts|shifting|switch|switches|switching|change|changes|agreement|consistency|"
    r"is (?:in)?consistent|issues?|errors?|problems?|usage|slips?|drifts?|moves|jumps|wavers|mismatch)\b"
    r"|\b(?:in|into|of|your|the|same|one|between|which|what|switch(?:es|ed|ing)?|shift(?:s|ed|ing)?|"
    r"chang(?:e|es|ed|ing)|mix(?:es|ed|ing)?|keep(?:s|ing)?|watch|check|consistent|inconsistent|wrong) "
    r"(?:the |a |one |your |its )?tense\b(?= ?(?:[.,;:!?)]|$)| (?:and|or|while|when|but|here|there|throughout|in|"
    r"for|to|from|midway|halfway|between|within|across|at|after|before|then|is|are|was|does|doesn't)\b)"
)
_MECHANICS = re.compile(
    r"\bgramma\w*|\bspelling\b(?! bee\b)|\bspell(?:ed|t)\b(?! out\b)|\bmisspel\w*|\bspell-?check\w*"
    r"|\btypos?\b|\btypographical\b|\bpunctuat\w*|\bcommas?\b(?!-)|\bsemi-?colons?\b|\bapostrophes?\b"
    r"|\brun-?ons?\b|\brun on sentences?\b|\bsentence fragments?\b|\bcapitali[sz](?:e|ed|es|ing|ation)\b(?! on\b)"
    r"|\bword choices?\b|\bchoice of words?\b|\bwordy\b|\bwordiness\b|\bwording\b|\bphrasing\b|\bdiction\b"
    r"|\bverbos\w*|\bproof-?read\w*|\bpassive voice\b|\bsyntax\b|\bsubject-verb\b|" + _TENSE
)
# A correction or a comment on a word that names no rule of grammar: "their
# should be there", "this sentence is a fragment", "you overuse the word
# felt", "resilient is better than strong". Each is about the text itself (a
# sentence, a word, a quoted one), never a bare word: "awkward", "fragment"
# and "repeat" are ordinary words in a note about what happened ("What was
# awkward about being the new kid?").
_UNIT = r"(?:sentences?|lines?|phrases?|words?|paragraphs?|clauses?|passages?)"
_COUNTED = (r"(?:a lot|too (?:much|often|many times)|(?:\d+|two|three|four|five|six|seven|eight|several|many|"
            r"multiple) times|repeatedly|over and over)")
_WORDING = [re.compile(p) for p in (
    rf"\b{_UNIT} (?:is|are|has|have|reads?|feels?|sounds?|seems?|looks?|comes? across|runs?) (?:\w+ ){{0,2}}?"
    r"(?:a fragment|fragments?|incomplete|awkward|awkwardly|clunky|clumsy|choppy|too long|too short|so long|very long|"
    r"overly long|long-winded|ungrammatical|incorrect|wrong|misused|redundant|repetitive|stilted|unfinished|"
    r"cut off|unclear|confusing|(?:hard|difficult) to (?:follow|read|parse)|"
    r"missing (?:a |an |its |the )?(?:verb|subject|word|article))\b",
    r"\b(?:missing|lacks|lacking|has no|have no) (?:a |an |its |the |any )?(?:verb|subject|article|predicate|"
    r"pronoun|preposition|conjunction)\b",
    r"\b(?:is|are|'s) (?:just |only |also )?(?:a |an )?(?:sentence )?fragments?\b(?! of\b)",
    r"\bhomophones?\b|\bmisus(?:e|ed|es|ing)\b|\bwrong (?:word|one|form|homophone)\b"
    r"|\b(?:incorrect|improper) (?:use|usage|word|form)\b|\b(?:word|verb|pronoun|article) usage\b"
    r"|\busage of (?:the word|the phrase|qzq|')",
    r"\b(?:overus\w+|repeat(?:s|ed|ing)?|reus\w+) the (?:word|phrase|term)\b",
    r"\bthe (?:word|phrase|term) (?:qzq|'[^']{1,40}'|\w+) (?:appears?|is used|is repeated|comes up|shows up|"
    r"occurs|repeats)\b",
    rf"\buse[sd]? (?:the (?:word|phrase|term) )?(?:qzq|'[^']{{1,40}}') (?:\w+ ){{0,2}}?{_COUNTED}\b",
    rf"\buse[sd]? the (?:word|phrase|term) \w+ (?:\w+ ){{0,2}}?{_COUNTED}\b",
    r"\b(?:is|fits?|works?|sounds?|reads?|says? it|would (?:be|fit|work|sound)) (?:\w+ )?(?:better|stronger|"
    r"clearer|more precise|more accurate) than (?!(?:you|me|him|her|them|us|he|she|they|i|it|this|that|everyone|"
    r"anyone|most|before|ever|usual|expected|yours?|his|hers|mine|theirs|the|a|an|your|my|their)\b)"
    r"(?:qzq|'?\w+'?)(?: here| there)?(?= ?[.,;!?]|$)",
    r"\w ?(?:->|=>|→) ?\w|\b\w+ = \w+\b",
    r"(?:^|(?<=[.!?;] ))\W*(?:qzq|'?\w+'?) should be (?:qzq|'?\w+'?)\W*(?=$|[.!?;])",
    r"\bshould (?:that|this|it|qzq|'\w+') be (?:qzq|'\w+'|there|their|they're|its|it's|your|you're|then|than|to|"
    r"too|whose|who's|affect|effect|lose|loose)\b",
    r"\b(?:did|do) you mean (?:to (?:say|write|use|put) )?(?:qzq|'[^']{1,40}'|\w+) (?:here|there|instead|rather)\b"
    r"|\bmean \w+ instead of\b",
    r"\bthe word you (?:meant|mean|want|wanted|intended)\b|\b(?:could|should|might|would) the word be\b",
    r"\b(?:the|this|that) word (?:qzq |'\w+' |\w+ )?(?:could|should|might|would|can) be\b",
    r"\b(?:there is|there's|there are|this has|it has|that has|contains?) (?:(?:an?|some|several|a few|many|two|"
    r"three|a couple of) )?(?:\w+ )?(?:errors?|mistakes?)\b",
    r"\b(?:should|needs to|must|has to) be (?:fixed|corrected|edited|cleaned up)\b",
    r"\bsentence (?:length|structure|variety)\b|\bruns on(?= ?(?:[.,;!?]|$))",
    r"\b(?:is|are|feels?|sounds?|reads?) (?:like )?(?:a |an )?cliche[sd]?\b",
    r"\b(?:more precise|more accurate|more specific|stronger|better|different|weaker|vaguer?) (?:verb|adjective|"
    r"noun|adverb)s?\b",
    r"\b(?:instead of|rather than) (?:the word |the phrase )?(?:qzq|'\w+')",
    r"\bcheck (?:the |your |this |that )?(?:(?:first|last|second|third|next) )?(?:qzq|'\w+'|word|words|usage|verb)",
    # Grammar's own vocabulary, which a note about what happened has no use for.
    r"\bmodifiers?\b|\bhomonyms?\b|\bdouble negatives?\b|\bparagraph breaks?\b"
    r"|\bquotation marks?\b|\bexclamation (?:points?|marks?)\b|\bcapital letters?\b|\blowercased?\b|\buppercase\b"
    r"|\bhyphenat\w+|\bverb forms?\b|\bplural form\b|\bdangling (?:participle|phrase|clause)s?\b",
    r"\b(?:verb|verbs|subject|pronoun|noun)s? (?:does not|doesn't|do not|don't) agree\b"
    r"|\b(?:does not|doesn't|do not|don't) agree with (?:its|the|their) (?:subject|verb|noun)\b",
    r"\b(?:verb|subject|article|pronoun|preposition|conjunction|word|period|full stop|capital|hyphen|letter)s? "
    r"(?:is|are) missing\b|\bmissing (?:a |an |the )?(?:period|full stop|capital|hyphen|letter|space)\b",
    r"\b(?:plural|singular|verb|pronoun|article|preposition|form|ending)s? (?:is|are|seems?|looks?) "
    r"(?:wrong|off|incorrect|inconsistent)\b|\bpronouns? (?:is|are|reference is) (?:unclear|vague|ambiguous)\b",
    # The shape of a sentence: its length, its joins, the tense it moves through.
    rf"\b{_UNIT} (?:\w+ ){{0,3}}?from (?:the )?(?:past|present) to (?:the )?(?:past|present)\b",
    rf"\b{_UNIT} (?:starts|begins|opens) in the (?:past|present) and (?:ends|finishes|moves|shifts|switches|closes) "
    r"(?:in|to) the (?:past|present)\b",
    r"\b(?:one|a|an) (?:\w+ )?long sentence\b|\bsentences? (?:\w+ )?(?:goes|go|runs|run|drags?) on\b",
    r"\bsentences? (?:in a row )?(?:all )?(?:start|begin|open)s? with (?:the same|i\b|qzq|'\w+')"
    r"|\bthe same word (?:opens|starts|begins)\b|\b(?:start|begin|open)s? with the same word\b",
    r"\b(?:two|three|several|both) (?:sentences|clauses) are joined\b|\bjoined (?:with|by) (?:only |just )?a\b"
    r"|\b(?:two|three|several|multiple) verbs\b",
    r"\btoo (?:many|much|few) (?:\w+ )?(?:adjectives|adverbs|words|sentences|verbs|pronouns|syllables|clauses)\b",
    # The register of the writing, and single words weighed.
    r"\b(?:vocabulary|language|writing|prose|wording|sentence|phrase) (?:here |there |itself )?(?:is|are|feels?|"
    r"sounds?|reads?|seems?|gets?|comes across as) (?:\w+ )?(?:too formal|formal|informal|too casual|casual|"
    r"flowery|stiff|clumsy|clumsily|stilted|oddly|odd|off|purple|overwritten|childish|sophisticated|elevated|fancy|"
    r"plain|simple|strange|strangely)\b|\b(?:sentence|phrase|line) trips\b",
    r"\b(?:makes?|is|sounds?|feels?) (?:it |this |that )?too (?:casual|formal|chatty|stiff)\b",
    r"\b(?:qzq|'\w+'|the word \w+|the phrase \w+|this word|that word|this phrase|that phrase|word) (?:\w+ )?"
    r"(?:sticks out|adds nothing|adds little|is unnecessary|is not needed|is filler|does no work|"
    r"is doing (?:the wrong|too much|no))\b|\b(?:adverbs|adjectives|verbs|words) are doing\b",
    r"\b(?:simpler|plainer|fancier|thesaurus|more precise|more exact|more formal|less formal) words?\b",
    r"\b(?:written as|spelled as|should be|is actually|are actually) (?:one|two) words?\b"
    r"|, which is (?:one|two) words?\b|\bspelled wrong\b",
    rf"\b(?:{_UNIT}|verbs?|writing|voice|construction)s? (?:is|are|reads?|sounds?|stays?) (?:\w+ )?passive\b"
    r"|\bpassive (?:verbs?|constructions?|sentences?|phrasing)\b|\bactive (?:verbs?|voice)\b",
    r"\b(?:break|mark|marks|period|word|phrase) (?:\w+ ){0,3}?in the wrong place\b",
    r"\b(?:spell|write|written|spelled) out (?:the|a|that|this|each|every|any) (?:\w+ )?(?:number|numbers|word|"
    r"abbreviation|acronym)\b|\bnumbers? (?:under|below|over|above) \w+ are\b",
    r"\b(?:it's|its|their|there|they're|your|you're|whose|who's|then|than|to|too|affect|effect|lose|loose) "
    r"(?:is|are) the (?:form|word|one) you (?:want|need|mean)\b"
    r"|\b(?:affect|effect|their|there|its|it's|then|than|your|you're) and (?:affect|effect|their|there|they're|its|"
    r"it's|then|than|your|you're) are (?:swapped|mixed up|confused|switched)\b|\byou mean (?:qzq|'\w+') here\b",
    r"\b(?:verbs?|nouns?) (?:here )?(?:is|are) (?:\w+ )?(?:weak|strong|flat|vague|abstract|generic|dull|lifeless|limp)\b"
    r"|\bverbs? (?:\w+ )?disagree\b|\b(?:loses|lacks|drops) its (?:subject|verb)\b"
    r"|\breads? (?:as|like) a (?:sentence )?fragment\b|\bextra space\b|\bindent(?:ed|ation|s)?\b|\bsentence[- ]level\b",
    r"\brhythm\b[^.!?]{0,30}?\b(?:is|feels|sounds) (?:off|wrong|odd|clunky)\b|\bclunks?\b|\btongue twister\b"
    r"|\ba mouthful\b|\bin one breath\b",
    # Mistakes, named as mistakes.
    # ("The first mistake arrives in the second sentence" is the story's
    # mistake, and where the draft tells it.)
    r"\b(?:errors?|mistakes?|slips?) (?:(?!arrives?\b|comes?\b|happens?\b|lands?\b|returns?\b|begins?\b|"
    r"starts?\b|ends?\b)\w+ )?(?:in|on) (?:the|this|that|your) (?:\w+ )?(?:line|sentence|paragraph|"
    r"draft|essay|writing|passage)\b|\b(?:writing|draft|essay|paragraph|sentence) has (?:\w+ )?(?:errors|mistakes|"
    r"slips)\b|\bcatch (?:the|any|those|your|small|a few|some) (?:\w+ )?(?:errors|mistakes|slips)\b"
    r"|\bread (?:it|this|that) (?:aloud|out loud)\b",
    # Told to look at them: said whatever the story around the word is.
    r"\b(?:check|double-check|recheck|watch|fix|correct|mind|review|clean up|look (?:at|over)) (?:for )?"
    r"(?:the |your |this |that |its |any )?(?:\w+ )?(?:spelling|grammar|punctuation|commas?|typos?|"
    r"capitali[sz]ation|wording)\b",
)]

_COLLEGES = r"(?:college|colleges|university|universities|ivy|ivies)"
_JUDGES = r"(?:colleges|universities|schools|admissions|committees?|officers?)"
# What a reader is forecast to do with a passage. "The reader will already
# have the hours from your activities list" is not one of these: it says what
# is in the application, not how anyone takes it.
_REACTS = (r"(?:see|find|feel|think|wonder|ask|know|understand|get|assume|conclude|judge|question|doubt|believe|"
           r"trust|sense|picture|imagine|wish|miss|forget|notice|care|love|like|enjoy|appreciate|admire|remember|"
           r"want|expect|respond|react|connect|relate|root|skim|stop|lose|tune out|take (?:this|it|that)|"
           r"read (?:this|it|that)|come away|walk away|be (?:lost|bored|confused|moved|impressed|hooked|drawn|won|"
           r"left|able|surprised|struck|tired))")
_ODDS = [re.compile(p) for p in (
    # chances, odds, guarantees ("took chances", "against the odds" are about life, not admission)
    r"(?<!take )(?<!took )(?<!takes )(?<!taking )(?<!taken )\bchances\b",
    rf"\b(?:chance|shot|likelihood|probability) (?:of|at|for) (?:\w+ ){{0,3}}?(?:admission|acceptance|getting in|"
    rf"getting accepted|getting admitted|being admitted|being accepted|{_COLLEGES})\b",
    r"(?<!at )(?<!against the )(?<!against all )(?<!beat the )(?<!beating the )(?<!defied the )\bodds\b(?! and ends)",
    r"\bguarante\w*|\bshoo-?in\b",
    # admission and acceptance, as a decision about the student
    r"\badmissions?\b|\b(?:admit|acceptance) rates?\b|\bacceptance (?:odds|chances)\b",
    # (as a prediction: "you were afraid the team would not accept you" is the
    # student's story, and an ordinary thing for a note to say back)
    r"\b(?:will|won't|may|might) (?:\w+ )?(?:admit|accept|reject) (?:you\b(?! (?:were|was|did|had|are|that)\b)|"
    r"your application|students|applicants)",
    r"\b(?:will|won't|you'll|you will|going to|likely to|unlikely to|sure to|helps? you|gets? you) (?:\w+ ){0,2}?"
    r"(?:be |get )?(?:admitted|accepted|rejected|waitlisted|denied)\b",
    rf"\b(?:admitted|accepted|rejected|waitlisted|denied) (?:to|into|at|by|from) (?:\w+ ){{0,3}}?"
    rf"(?:{_COLLEGES}|your (?:top|dream|first|reach|target|safety))\b",
    # getting in
    r"\b(?:gets?|getting|got) you (?:in\b|into\b|admitted|accepted)",
    r"\b(?:will|would|could|might|may|can|to|you'll|help you|helps you|likely to|chance to|enough to) get in\b"
    r"(?! (?:the|a|an|my|your|his|her|their|our|touch|trouble|shape|line|front|on|bed|that|this|to)\b)",
    rf"\bget(?:s|ting)? into (?:\w+ ){{0,2}}?(?:{_COLLEGES}|your (?:top|dream|first|reach|target|safety))\b",
    # what colleges want, and how a reader will react
    rf"\b{_JUDGES} (?:\w+ ){{0,2}}?(?:admits?|accepts?|rejects?|want|wants|like|likes|love|loves|look for|looks for|"
    r"are looking for|is looking for|value|values|prefer|prefers|expect|expects|care about|cares about|reward|"
    r"rewards|notice|notices)\b",
    r"\bwhat (?:colleges|schools|admissions|readers|they) (?:want|are looking for|look for|like|expect|care about)\b",
    r"\b(?:college|application|scholarship) (?:officers?|readers?|committees?|counselors?|offices?|staff|teams?|"
    r"deans?)\b",
    r"\breaders? (?:will|would|won't|might|may|could|is going to|are going to) (?:\w+ )?(?:love|like|enjoy|"
    r"appreciate|remember|be impressed|be moved|be bored|be hooked|be drawn|be won|care|respond|react|connect|"
    r"relate|admire|root|want|expect|skim|stop reading|lose interest|tune out)\b",
    r"\breaders? (?:want|wants|like|likes|love|loves|expect|expects|look for|looks for|are looking for|prefer|"
    r"prefers)\b",
    # (any forecast of a reader, whatever the verb: "a reader will find this
    # moving", "readers tend to skim lists". What the reader knows at a point
    # in the draft, in the present tense, is an observation and passes.)
    rf"\b(?:a|the|any|every|your|each) reader (?:will|would|may|might|could|won't|wouldn't|can't|cannot|"
    rf"is going to|is likely to) (?:\w+ )?{_REACTS}\b",
    rf"\breaders (?:will|would|may|might|could|won't|wouldn't|can't|cannot|tend to|are going to|are likely to|"
    rf"often|usually|always) (?:\w+ )?{_REACTS}\b",
    r"\breaders? (?:\w+ )?(?:loses?|lose) (?:interest|track|the thread|patience|focus)\b"
    r"|\breaders? (?:gets?|is|are|becomes?|feels?) (?:lost|bored|confused|tired|impatient|hooked|drawn in)\b"
    r"|\breaders (?:respond|react|skim|notice|remember)\b",
    r"\bwhoever (?:reads?|is reading|decides?)\b|\b(?:people|those|anyone|someone|the ones?|the person) "
    r"(?:who (?:reads?|decides?)|reading) (?:this|these|your|it|the essay|applications?|essays)\b",
    r"\b(?:colleges|universities|schools|admissions|committees?) (?:\w+ )?(?:see|sees|hear|hears|read|reads|"
    r"respond|responds|react|reacts|penali[sz]e[sd]?|"
    r"are tired|is tired|get tired|are bored|get bored|favou?rs?|seeks?|are interested|are drawn|can tell|"
    r"see through|tend to)\b",
    # standing out, and the application as a contest
    r"\bstand(?:s|ing)? out (?:to (?!you\b|me\b|him\b|her\b|us\b)|from (?:the |other |every )?(?:crowd|pile|pool|"
    r"rest|others|applicants|stack)|among|amongst|in (?:the|a) (?:pile|pool|stack|crowd))",
    r"\b(?:makes?|making|helps?|helping|lets?) (?:you|your (?:essay|application|story)|this(?: essay)?|it|"
    r"the essay|the application) stand out\b",
    r"\b(?:will|would|could|can|may|might|should|helps?|lets?) (?:\w+ )?(?:set|make|get|keep)s? (?:you|"
    r"your \w+|this|it|the essay) (?:\w+ )?(?:apart|memorable|noticed|remembered|unforgettable)\b",
    r"\bmakes? (?:an?|the|your|this|any) (?:essay|application|draft|statement) (?:\w+ )?(?:memorable|unforgettable|"
    r"stand out|shine|work|pop)\b",
    r"\b(?:will|would|could|might|may|should) (?:\w+ )?hook (?:readers?|them|the reader|a reader|anyone)\b",
    r"\bsets (?:you|this|it|your \w+|the essay) apart\b"
    r"|\bset(?:s|ting)? (?:you|your \w+) apart from (?:other|the other|every|most|many) ",
    r"\b(?:will|would|could|might|may|should) (?:catch|grab|hold|get) (?:their|an?|the|any|every|a reader's|"
    r"the reader's) (?:\w+ )?(?:eye|attention)\b",
    r"\b(?:this|that|it|essay|detail|line|opening|story|topic|kind of \w+) (?:\w+ )?gets? (?:noticed|remembered)\b"
    r"|\bgets? you (?:noticed|remembered)\b|\b(?:will|would|could|might|may|should) get (?:\w+ )?attention\b",
    r"\b(?:this|that|it|which|essay|draft|detail|story|scene|line|opening|ending|topic) (?:will|would|should|"
    r"could|might|may|is likely to|is going to) (?:not )?(?:\w+ )?(?:impress(?! (?:him|her|them|me|us|you|my|your|"
    r"his|their|anyone at|everyone at|(?:the|a|an) (?:coach|judges?|teacher|team|crowd|class|scouts?|girl|boy))\b)|"
    r"resonate|be well received|be received well)\b",
    r"\b(?:this|that|essay|draft|detail|story|scene|opening|ending|topic) (?:will|would|should|could|might|may|"
    r"is likely to|is going to) (?:not )?(?:\w+ )?(?:land|hook|appeal to)\b",
    r"\bresonates? with (?:readers?|admissions|colleges|the committee|them|people|anyone)\b"
    r"|\b(?:likely|sure|bound|going) to (?:resonate|impress|land)\b",
    r"\b(?:every|each) (?:\w+ )?applicant\b"
    r"|\b(?:many|most|other|thousands of|hundreds of|few|countless|all|some) (?:\w+ )?applicants\b"
    r"|\bapplicants? (?:often|usually|always|tend|typically|write|writes|who)\b|\bamong applicants\b",
    r"\b(?:strengthens?|boosts?|weakens?|hurts?|helps?|improves?|raises?|lowers?) your (?:application|chances|odds|"
    r"case|candidacy|profile)\b",
    r"\b(?:strong|stronger|strongest|weak|weaker|competitive|compelling|impressive|standout|stand-out|ideal|top) "
    r"(?:applicant|candidate|application|candidacy)\b",
    r"\bapplicant pool\b|\bimpress(?:es|ed|ing)? (?:admissions|colleges|readers|the reader|a reader|the committee|"
    r"schools)\b|\blikel(?:y|ihood) to (?:get|be) (?:in|admitted|accepted)\b|\bwinning essay\b",
    # the verdicts a prediction hides in: ready to send, a safe topic, an overdone one
    r"\b(?:essay|draft|statement|this|that|it) (?:is|looks|seems|feels|sounds) (?:\w+ )?ready (?:to|for) "
    r"(?:submit|send|go|submission|submitting|sending|be submitted|be sent)\b",
    r"\b(?:topic|essay|subject|story|theme)s? (?:is|are|feels?|seems?|can be|can feel|tends? to be) (?:\w+ )?"
    r"(?:overdone|overused|cliche[sd]?|safe|common|risky|a risk|tired|played out|generic|unoriginal)\b",
    r"\b(?:overdone|overused|safe|risky|winning|cliche[sd]?) (?:\w+ )?(?:topic|subject|bet)\b"
    r"|\bcommon (?:essay|application) topic\b",
    r"\b(?:this|that|it|essay|which) (?:will|would|could|can|may|might) open (?:\w+ )?doors?\b",
    r"\b(?:essay|draft|application) is (?:already |very |quite |highly )?competitive\b",
    r"\b(?:essays?|topics?|stor(?:y|ies)|kind of (?:essay|detail|story)) (?:like (?:this|these) )?(?:tends? to|"
    r"usually|often|always|typically) (?:\w+ )?(?:succeed|do well|work|land|win|stand out)s?\b",
    r"\b(?:cost|hurt|help)s? you with (?:a |the |an )?(?:committee|colleges|readers?|admissions)\b",
    r"\bdifferentiates? you\b|\bdistinguish(?:es)? you from (?:other|the|every|most|many)\b",
    r"\b(?:reads?|comes? across) as (?:memorable|impressive|unique|mature|immature|authentic|genuine|sincere|"
    r"a red flag|bragging|arrogant|cliche[sd]?)\b",
    r"\b(?:this|that) (?:kind|sort|type) of (?:essay|topic|story|detail|opening) (?:\w+ )?(?:works?|lands?|"
    r"succeeds?|wins?|does well)\b",
    r"\b(?:detail|essay|line|opening|story|topic) (?:\w+ )?gets? (?:\w+ )?attention\b",
    r"\b(?:chances?|likelihood|probability) of (?:working|success|succeeding|landing|standing out|being noticed|"
    r"impressing)\b",
    r"\b(?:review|selection) (?:board|panel|committee)s?\b"
    r"|\b(?:the people|those|whoever) (?:who )?decid(?:e|es|ing) (?:will|would|might|may|like|love|want)\b",
    # a grade is a forecast too: "this is a strong essay", "the draft is ready"
    r"\b(?:strong|great|excellent|wonderful|fantastic|amazing|impressive|outstanding|powerful|compelling|perfect|"
    r"winning|finished) (?:essay|draft|statement)\b|\bwinning (?:topic|formula)\b",
    r"\b(?:essay|draft|statement|this (?:opening|ending|hook|topic)) is (?:already |very |really |quite |so )?"
    r"(?:strong|great|excellent|wonderful|fantastic|amazing|impressive|outstanding|powerful|compelling|perfect|"
    r"ready|finished|done)\b",
    # how it will go, in the words a forecast is made in when it names no reader
    r"\b(?:will|would|should|could|is going to|is likely to|is sure to|ought to) (?:\w+ )?(?:be remembered|do well|"
    r"serve you well|pay off|backfire|go far|go over well|work in your favou?r|count (?:for|against) you)\b"
    r"|\b(?:can|could|may|might) backfire\b",
    r"\bputs? you (?:ahead|behind|in (?:a )?(?:good|great|strong|better|solid|bad|tough) (?:position|shape|spot|"
    r"place|standing))\b|\byou(?: are|'re) in (?:good|great|fine|strong|solid) shape\b|\bnothing to worry about\b"
    r"|\byou have (?:a |an )?(?:real |good |great |strong |decent |solid |excellent )?shot\b",
    r"\b(?:your|the|an) application (?:is|will be|would be|looks?|gets?|becomes?) (?:\w+ )?(?:stronger|better|"
    r"weaker|strong|weak|ready|competitive)\b",
    r"\b(?:would|will|should) be (?:lucky|glad|happy|fortunate|thrilled) to have you\b",
    r"\btop of the (?:pile|stack|list)\b|\b(?:in|from|out of) the (?:pile|stack)\b",
    # schools and programs, named by rank or by kind, and what they hope for
    r"\b(?:selective|top|elite|competitive|ivy league|prestigious|highly ranked|top-tier) (?:\w+ )?(?:schools?|"
    r"colleges?|universities|university|programs?)\b",
    r"\b(?:engineering|honors|nursing|business|stem|science|arts|writing|college|university|degree|academic) "
    r"programs? (?:\w+ )?(?:love|loves|like|likes|want|wants|look for|looks for|value|values|prize|prizes|seek|"
    r"seeks|prefer|prefers|reward|rewards|expect|expects|would|will)\b",
    r"\b(?:schools|colleges|universities|committees) (?:\w+ )?(?:hope|prize|appreciate|respect|remember)\b",
    # everyone else who is writing an essay
    r"\b(?:thousands|hundreds|lots|plenty|dozens|countless|a lot|so many|many|most) (?:of )?(?:other )?"
    r"(?:students|seniors|writers|applicants)\b[^.!?]{0,40}?\b(?:write|writes|wrote|writing)\b",
    r"\b(?:essays?|statements?|stories) (?:about|on) [^.!?]{1,40}? (?:are|is|can be|tend to be) (?:\w+ )?"
    r"(?:everywhere|common|overdone|popular|familiar|risky|safe|tricky|hard to pull off|cliche[sd]?)\b"
    r"|\ba dime a dozen\b",
    r"\b(?:writing|an essay|essays|a story) about [^.!?]{1,40}? (?:is|are|can be) (?:\w+ )?(?:risky|safe|common|"
    r"overdone|tricky|popular|a risk|a gamble)\b",
    r"\b(?:this|that|it) is (?:\w+ )?(?:unique|original|one of a kind|a familiar story|a common story|a risk|"
    r"a gamble)\b|\b(?:unique|original|fresh|distinctive|memorable) (?:angle|take|voice|perspective|approach|hook|"
    r"topic|subject|story)\b",
    # whoever reads it, by any other name
    r"\b(?:people|someone|anyone|those|whoever|a person|somebody|everyone) (?:who (?:reads?|reviews?|sees?)|reading|"
    r"reviewing) (?:\w+ ){0,3}?(?:these|essays|applications|thousands|hundreds|dozens|fifty|a lot)\b",
    r"\b(?:scholarship|essay|application|contest|college) (?:judges?|reviewers?|panels?|graders?|evaluators?)\b"
    r"|\binterviewers? (?:will|would|may|might|could|is going to)\b|\bcome up in (?:an|your|the) interview\b",
    r"\b(?:makes?|leaves?|gives?|creates?) (?:a|an) (?:\w+ )?(?:good|strong|great|bad|poor|lasting|weak|positive|"
    r"negative|powerful) impression\b|\bfirst impressions matter\b",
    r"\bvoice\b[^.!?]{0,40}?\b(?:will carry|(?:people|readers|they) (?:respond|react|warm) to)\b"
    r"|\bprompt's authors\b|\bgets (?:students|applicants|people|essays) (?:noticed|in|admitted|remembered)\b",
    r"\b(?:essay|one|draft|version) to (?:send|submit)\b|(?:^|(?<=[.!?;] ))(?:send|submit) (?:this|it|that)\b"
    r"|\b(?:will|would|should) hold up\b|\bholds? up (?:against|well|next to|beside)\b|\bcompetitive with\b"
    r"|\braises? (?:eyebrows|a flag|flags)\b|\bred flags?\b|\ba keeper\b|\bfar along\b",
    # ("Two scenes carry the draft" says how it is built: _BUILT_ON, below.)
    r"\b(?:sink|sinks|make|makes|break|breaks|save|saves|carry|carries) (?:an|the|your|this) (?:essay|application|"
    r"draft)\b(?! (?:about|on|for|in|to|with)\b)|\b(?:yes|no|maybe|reject|admit) pile\b|\bis a yes\b"
    r"|\ba yes and a (?:no|maybe)\b|\byour (?:file|candidacy)\b|\bdecision[- ]makers?\b"
    r"|\b(?:folks|people|ones) (?:deciding|who decide)\b",
    r"\b(?:deans?|alum(?:ni|s)?|faculty|professors) (?:\w+ )?(?:would|will|like|likes|notice|notices|love|loves|"
    r"want|wants)\b|\b(?:scholarship|finalist|winner) material\b|\breads? like a (?:finalist|winner)\b"
    r"|\b(?:most|many|other) seniors\b",
    r"\b(?:this|that|it|essay|draft) is (?:\w+ )?(?:close to|nearly|almost|just about) (?:done|finished|ready|"
    r"there)\b",
    # a mark out of ten is a forecast too, and so is a ranking of its parts
    r"\b[a-d]-(?:level|grade|plus|minus)\b|\b(?:would|will|could|should) (?:get|earn|score|receive) (?:a |an )?"
    r"(?:high|top|full|good|low|great|perfect)\b|\brubric\b|\btop[- ]tier\b|\bbetter than most\b"
    r"|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) out of (?:10|ten|100|a hundred)(?= ?(?:[.,;!?]|$))",
    r"\b(?:strongest|weakest) (?:part|paragraph|line|sentence|section|scene|passage|detail|writing|image|moment)\b"
    r"|\b(?:best|worst) (?:paragraph|sentence|passage|section|writing)\b",
)]

_MASKS = frozenset({_MASK, _NAME_MASK, "qzs", "tellqz"})
# One letter before a full stop: an initial ("Mr. T. Okafor") or the end of
# "U.S.A." or "p.m.". It ends no sentence: at worst two are read as one.
_DOTTED = re.compile(r"(?:^|[\s.])[A-Za-z]$")


def _sentence_spans(flat: str) -> list[tuple[int, int, str]]:
    """(start, end, the mark that ends it or "") for each sentence of a plain
    line. The full stop of "Mrs.", "a.m." or "U.S.A." ends nothing."""
    out, start = [], 0
    for m in _SENTENCE_STOP.finditer(flat):
        before = flat[max(0, m.start() - 6):m.start()]                      # the longest is four characters
        if _ABBREVIATION.search(before) or _DOTTED.search(before):
            continue
        if flat[start:m.start()].strip():
            out.append((start, m.start(), m.group()))
        start = m.end()
    if flat[start:].strip():
        out.append((start, len(flat), ""))
    return out


# ── The student's own subject ────────────────────────────────────────────────
# A word on the mechanics or odds lists is not always Quill's own. A student
# writes about a typo on a sign, a grandmother's grammar, the odds their team
# faced, a store's guarantee, an admissions office they once walked into, and
# a note that says so back is about their story, not their writing or their
# chances. So before those two lists read a line, the words that belong to the
# story are masked (_own_subject), the way quotations and the record's names
# already are. A word belongs to the story in one of two ways:
#
# - The sentence hands it back as what the draft says ("The draft says the
#   sign had a typo", "You mention your admission to the program").
# - It stands where only a story puts it: owned by someone or something ("her
#   grammar", "the recipe's wording", "the store's guarantee"), on a thing ("a
#   spelling mistake on the receipt"), had or found in the past ("the atlas
#   had the wrong spelling of the town"), or asked about as something that
#   happened ("what were the odds", "did the sponsor guarantee").
#
# Neither counts in a sentence that points at the text (a paragraph, a line,
# "here", "this", a quotation): there Quill is talking about the writing, and
# the lists read every word. The bare words stay refused, and so does every
# plain way of commenting ("there is a typo in the first paragraph", "check
# the spelling", "her grammar is shaky", "the odds are good").
_SUBJECT_MASK = "qzs"
_SOFT = re.compile(r"\b(?:grammar|spelling|spelled|spelt|typos?|punctuation|commas?|wording|proofread\w*|chances|odds|"
                   r"guarante\w*|admissions?|rubric)\b")
_TEXT_NOUN = (r"(?:drafts?|essays?|paragraphs?|sentences?|lines?|passages?|openings?|endings?|introduction|intro|"
              r"conclusion|titles?|writing|prose|text|section|dialogue|quotes?|page|names?)")
_POINTS_AT_TEXT = re.compile(
    rf"(?<![-\w]){_TEXT_NOUN}(?![-\w])|\bhere\b|\bthis\b|\bqzq\b|\byours\b|\byour own\b"
    r"|\b(?:the|that|your|each|every|a better|another|which) (?:\w+ )?(?:word|phrase)s?\b")
# A verdict on the thing itself is Quill's, whoever owns it: "the punctuation
# is wrong", "her grammar was shaky".
_JUDGED = re.compile(r" (?:mistakes? |errors? )?(?:is|are|was|were|looks?|seems?|feels?|gets?) (?:\w+ )?(?:wrong|off|bad|"
                     r"poor|shaky|sloppy|inconsistent|incorrect|weak|rough|messy|careless|missing|uneven)\b")
# How a sentence opens when it hands a claim back to the draft. What follows
# has to be the claim ("the sign had a typo"), not a comment on the telling
# ("the draft says it well", "you write with few commas").
_HANDS_BACK = re.compile(
    r"(?:(?:and|but|so) )?(?:the (?:draft|essay|paragraph|passage|sentence|line|opening|ending|record) "
    r"(?:says|mentions|describes|states|notes|tells|names|lists|claims|explains)"
    r"|you (?:say|said|write|wrote|mention|mentioned|describe|described|note|noted|explain|explained|claim|"
    r"claimed))\b(?: (?:that|how|about))?"
    r"(?! (?:it|this|so|them|these|those|things?|more|less|little|nothing|everything|something|with|without|in|"
    r"like|as)\b)")
_OWNER = (r"(?:her|his|their|(?!(?:it|that|there|here|what|who|let|he|she|where|how|one|quill|writer|student|reader|"
          r"draft|essay|paragraph|sentence|line|passage|story|scene|opening|ending|piece)'s\b)[a-z]+'s)")
_LANGUAGE = re.compile(r"\b(?:languages?|dialect|alphabet)\b")
# (where the word stands, and what else its sentence must hold for that to count)
_IN_THE_STORY = [(re.compile(p), needs) for p, needs in (
    # "her grammar", "the recipe's wording", "the school's admissions office".
    # ("Her grammar is shaky" is a verdict on how she is written, and stays.)
    (rf"\b{_OWNER} (?:\w+ )?(?P<w>grammar|spelling|punctuation|wording|typos?|guarantees?|admissions?)\b"
     r"(?! (?:is|are|was|were|feels|seems|sounds|reads|could|should|would|might|needs|gets|has)\b)", None),
    (r"\b(?P<w>spelling|typo) (?:mistakes? |errors? )?on (?:the|a|an|her|his|their|that) \w", None),
    (r"\b(?:had|caught|found|saw|spotted|noticed|fixed) (?:the |a |an |one |its |her |his |their )?(?:\w+ )?"
     r"(?P<w>typos?|spelling)\b", None),
    # How a word of another language is spelled is theirs to tell.
    (r"\b(?P<w>spelled|spelt)\b", _LANGUAGE),
    (r"\b(?:what|how \w+) were the (?P<w>chances|odds)\b", None),
    (r"\bthe (?P<w>chances|odds) were\b", None),
    (r"\bdid (?:the |your |her |his |their )?(?:\w+ ){1,3}?(?P<w>guarantee)\b", None),
    (r"\b(?:does|do|did|would|can|could) (?:she|he|they) (?:\w+ )?(?P<w>guarantee)\b", None),
)]
# Said of how a draft is built, never of how it will do: "Two scenes carry the
# draft". ("This scene will carry the essay" is a forecast, and stays.)
_BUILT_ON = re.compile(
    r"\b(?:two|three|four|five|six|both|several|\d+) (?:\w+ )?(?:scenes|moments|stories|paragraphs|sentences|images|"
    r"people|places|days|parts|halves|events|examples) (?P<w>carry) the (?:draft|essay)\b")


def _own_subject(flat: str) -> str:
    """`flat` as the mechanics and odds lists read it: the words that belong
    to the student's story masked (see above), everything else as it was."""
    cuts = [m.span("w") for m in _BUILT_ON.finditer(flat)]
    if _SOFT.search(flat):
        for start, end, _ in _sentence_spans(flat):
            sentence = flat[start:end]
            if not _SOFT.search(sentence):
                continue
            lead = len(sentence) - len(sentence.lstrip())
            handed = _HANDS_BACK.match(sentence, lead)
            said = handed.end() if handed else lead
            if _POINTS_AT_TEXT.search(sentence, said):
                continue
            if handed:
                # What the draft is said to say runs to the first comma: after
                # it the sentence may be Quill's again.
                comma = sentence.find(",", said)
                found = [m.span() for m in _SOFT.finditer(sentence, said, comma if comma >= 0 else len(sentence))]
            else:
                found = [m.span("w") for pattern, needs in _IN_THE_STORY if needs is None or needs.search(sentence)
                         for m in pattern.finditer(sentence)]
            cuts += [(start + a, start + b) for a, b in found if not _JUDGED.match(sentence, b)]
    if not cuts:
        return flat
    out, at = [], 0
    for a, b in sorted(cuts):
        if a >= at:
            out += [flat[at:a], _SUBJECT_MASK]
            at = b
    return "".join(out) + flat[at:]


# ── Plain letters, plain words ───────────────────────────────────────────────
# Every list here reads English words in Latin letters, so the model's own
# words have to be that, or the lists are blind. Outside a proven quotation
# (the student's own text may hold anything) a line is "unreadable" when it
# holds:
#
# - a character that draws nothing or has no business in a sentence (a
#   control character, a private-use or unassigned code point, a blank
#   braille cell or a Hangul filler, a quotation mark from another script,
#   markup like "&quot;" or "[quote]"), or a letter the lists cannot read: one
#   that does not come down to a plain Latin letter (Armenian, Cherokee,
#   small capitals, squared and negative letters). A word like that is fine
#   when it is the student's: found in the draft, the prompt or the record.
# - letters set apart ("a d d"), joined by marks ("w-r-i-t-e", "l.i.n.e") or
#   swapped for digits and symbols ("y0u c0uld s4y"), unless the same word is
#   in a source;
# - a list mark at the start of a sentence ("* ", "- ", "1. "): a note is
#   sentences, and a bullet is how a line of new text gets set down;
# - words that are not English: a line of five words or more with none of
#   the small words every English sentence is built from (a long one needs
#   more than one).
#
# The look-alikes on _LOOKALIKES and the invisible characters _unseen knows
# are still read through, as before. These rules are for what reading through
# cannot reach.
_COMMON = frozenset("""
a an the and or but nor so yet if then than that this these those there here
i me my mine we us our ours you your yours yourself he him his she her hers it its itself they them their theirs
who whom whose what which when where why how
am is are was were be been being do does did doing done have has had having
can could will would shall should may might must
not no yes none nothing something anything everything someone anyone everyone nobody
of to in on at by for from with without about into onto over under after before between during through
against among around behind beside near off out up down across along until since while because although
though whether as like per via
all any both each every few many more most much other another such some several same own only also
just still even ever never always often once twice again too very quite almost already
one two three four five six seven eight nine ten first second third last next
""".split())
_ENGLISH_WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")
ENGLISH_MIN_WORDS = 5           # shorter lines are not judged: too few words to tell
ENGLISH_SHARE = 0.1             # of a long line's words that have to be common ones
_DEAD = frozenset({"Cc", "Cn", "Co", "Cs"})
_TOKEN_EDGES = ".,;:!?()[]{}\"'*"
_SPELLED_OUT = re.compile(r"(?<![\w'-])(?:[a-z] ){2,}[a-z](?![\w'-])")
_JOINED_LETTERS = re.compile(r"(?<![\w'])(?:(?:[a-z][-_*/|~]){2,}|(?:[a-z]\.){3,})[a-z](?![\w'])")
_DIGIT_WORD = re.compile(r"[a-z][0-9@$|!]+[a-z]|^[0-9@$]+[a-z]{2,}|^[a-z]{3,}[0-9]+$")
# "2nd", "1990s", "5pm", "10k": a number with its ending, not a word in disguise.
_COUNTED_WORD = re.compile(r"\d+(?:st|nd|rd|th|s|x|am|pm|k|km|mm|cm|kg|lb|lbs|oz|ft|mph|min|mins|hr|hrs|yd|ish)")
_DIGIT_WORDS = frozenset({"h2o", "y2k", "b2b", "p2p", "mp3s", "mp4s", "r2d2", "c3po"})
_BULLET = re.compile(r"(?:^|(?<=[.!?] ))(?:[-*\u2022\u00b7\u2023\u25aa\u25cf\u25cb\u25e6>#~+=]+|\d{1,2}[.)]) ")
# "&quot;", "<i>", "[quote]": quotation marks and emphasis by another road.
_MARKUP = re.compile(r"&#?\w{2,8};|</?[a-z][a-z0-9]*>|\[/?[a-z]+\]")


def _in_sources(word: str, sources: list) -> bool:
    needle = prepare(word).norm
    return bool(needle) and any(needle in source.norm for source in sources)


def _odd_characters(written: str, spans: list, sources) -> bool:
    """Whether the model's own words (`written` outside the quotations at
    `spans`, all of them proven) hold a character that draws nothing, or a
    letter the lists cannot read in a word that is not the student's.
    `sources` is called for the prepared sources only when a word needs
    looking up."""
    at = 0
    for a, b in [*spans, (len(written), len(written))]:
        piece, at = written[at:a], b
        if piece.isascii() and piece.isprintable():
            continue
        for m in _TOKEN.finditer(piece):
            token = m.group()
            if token.isascii() and token.isprintable():
                continue
            foreign = False
            for ch in token:
                if ch.isascii():
                    if not ch.isprintable():
                        return True                         # a control character, DEL
                    continue
                kind = unicodedata.category(ch)
                # (A quotation mark _MARKS does not know would hide a quotation.)
                if (kind in _DEAD or kind in ("Pi", "Pf") or ch in _BLANKS
                        or "QUOTATION MARK" in unicodedata.name(ch, "")):
                    return True
                if _unseen(ch):
                    continue                                # read with and without it, further on
                letter = ch.isalpha() or "LETTER" in unicodedata.name(ch, "")
                if not letter:
                    continue
                read = unicodedata.normalize("NFKD", ch).translate(_PLAIN_MAP)
                if kind in ("Mn", "Me") or not all(c.isascii() or unicodedata.category(c) in ("Mn", "Me")
                                                  for c in read):
                    foreign = True
            if foreign and not _in_sources(token.strip(_TOKEN_EDGES), sources()):
                return True
    return False


def _disguised(flat: str, sources) -> bool:
    """Whether the masked, lowercase line holds words spelled so the lists
    cannot read them, a list mark, or too few English words to be English."""
    if _BULLET.search(flat) or _SPELLED_OUT.search(flat) or _MARKUP.search(flat):
        return True
    for token in flat.split():
        word = token.strip(_TOKEN_EDGES)
        if word.endswith("'s"):
            word = word[:-2]
        if not word or word.isalpha():
            continue
        odd = bool(_JOINED_LETTERS.search(word)) or any(
            _DIGIT_WORD.search(part) and not _COUNTED_WORD.fullmatch(part) and part not in _DIGIT_WORDS
            for part in re.split(r"[-/]", word))
        if odd and not _in_sources(word, sources()):
            return True
    return False


def _not_english(flat: str) -> bool:
    words = [w for w in _ENGLISH_WORD.findall(flat) if w not in _MASKS]
    if len(words) < ENGLISH_MIN_WORDS:
        return False
    common = sum(1 for w in words if w in _COMMON or w.split("'")[0] in _COMMON or w.endswith("n't"))
    # A short English sentence can get by on one of them ("You say Harlow
    # College values curiosity."), so a short line is refused only with none.
    return common < max(1.0, ENGLISH_SHARE * len(words))


# ── Names ────────────────────────────────────────────────────────────────────
# A name in Quill's own words has to be one the student used: a person, a
# place or a school that the draft, the prompt and the record never mention
# is something Quill brought in. That is how a forecast about a named college
# is written ("Your shot at Harvard improves", "Yale wants this"), and Quill
# has looked nothing up about anyone. Read from capitals, so it only works on
# the line as it was written (the first reading): a capitalised word that is
# not opening a sentence must be a known word, and a sentence may not open
# with an unknown one that "wants", "values" or "looks for" something.
# (The school a supplement names is known, and what Quill says it wants is
# _school_check's.)
_CAPITALS_OK = frozenset("""
january february march april may june july august september october november december
monday tuesday wednesday thursday friday saturday sunday fall spring summer winter autumn
mr mrs ms mx dr prof jr sr st mt ph phd ap ib sat act psat gpa stem jv esl pe tv ok okay us usa uk dc id ii iii iv am pm
common app quill prompt essay draft paragraph sentence line section part personal statement supplement
activities activity awards award record honors courses grade freshman sophomore junior senior english american
""".split())
_NAME_TOKEN = re.compile(r"[A-Za-z][A-Za-z0-9']*")
_KNOWN_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")
_WANTS = re.compile(
    r" (?:(?:wants|values|likes|loves|looks for|is looking for|seeks|prefers|rewards|expects|prizes|favou?rs|admits|"
    r"accepts|respects|appreciates|cares about)\b|takes (?:students|writers|applicants|people|kids|essays|anyone|"
    r"those)\b|(?:would|will|might|may|could|should|does|won't|wouldn't) (?:not )?(?:\w+ )?(?:want|value|like|love|"
    r"look for|seek|prefer|reward|expect|prize|favou?r|admit|accept|take|respect|appreciate|care about)\b)")
MAX_KNOWN_TEXTS = 400


def known_words(*texts) -> frozenset:
    """Every word of the texts a model was shown (the draft, the prompt, the
    record, other essays), lowercase and in plain letters: the names a line
    of Quill's may use (breaks_rules `known`)."""
    words: set[str] = set()
    for text in texts[:MAX_KNOWN_TEXTS]:
        if not isinstance(text, str) or not text:
            continue
        for word in _KNOWN_WORD.findall(_plain(text[:BODY_MAX * 2]).lower()):
            words.add(word)
            words.add(word.split("'")[0])
    return frozenset(words)


def record_strings(record, limit: int = MAX_KNOWN_TEXTS) -> list[str]:
    """Every piece of text on a record (its rows, the profile, the interview's
    notes), for known_words: all of it is shown to the model in one form or
    another."""
    out: list[str] = []
    stack = [record]
    while stack and len(out) < limit:
        value = stack.pop()
        if isinstance(value, str):
            if value.strip():
                out.append(value[:2000])
        elif isinstance(value, dict):
            stack.extend(value.values())
        elif isinstance(value, (list, tuple)):
            stack.extend(value)
    return out


def _is_known(word: str, known: frozenset) -> bool:
    if word in known or word in _COMMON or word in _CAPITALS_OK or word + "s" in known:
        return True
    return (word.endswith("s") and (word[:-1] in known or word[:-1] in _CAPITALS_OK)) or (
        word.endswith("es") and word[:-2] in known)


def _new_name(masked: str, known: frozenset) -> bool:
    """Whether the line (masked, capitals kept) uses a name that is not in
    `known`."""
    prev_end, prev = 0, None
    for m in _NAME_TOKEN.finditer(masked):
        word, gap = m.group(), masked[prev_end:m.start()]
        # Whether this word opens a sentence: the first one, the one after a
        # quotation (which may have ended its own), after a bracket, or after
        # a stop or a colon that is not an abbreviation's ("Mrs. Okafor").
        opens = (prev is None or prev in _MASKS or "(" in gap or "[" in gap
                 or (any(c in gap for c in ".!?:") and not (
                     gap.startswith(".") and (len(prev) == 1 or _ABBREVIATION.search(
                         masked[max(0, prev_end - 6):prev_end])))))
        prev_end, prev = m.end(), word
        low = word.lower().split("'")[0]
        if not word[0].isupper() or len(low) < 2 or _is_known(low, known):
            continue
        if not opens or _WANTS.match(masked, m.end()):
            return True
    return False


# ── What each kind of line is ────────────────────────────────────────────────
# The lists above say what no line may say. These say what a line has to be,
# by the job it does (breaks_rules `kind`).
#
# "statement" (an observation, a check's line, a summary): every sentence is
# about the draft or the student, and says what is on the page now.
#   - Every sentence has a word in it for what it is about: the draft or a
#     part of it, the student ("you"), what the text does ("names", "is
#     described"), or at least a word that points back at one of those ("it",
#     "that", "both"). A sentence with none is not a note about anything. It
#     is a sentence for the essay, or a thing to add set down bare ("The
#     compressor hummed all shift and the radio played down the hall.", "Cold
#     milk, cardboard, bleach on the floor.", "Needs a number."):
#     "essay_text". Told in the past tense, the way a story is, a sentence
#     needs one of the first kind: "it lifted the cube forty times" points
#     back at nothing of Quill's.
#   - A sentence that says what would, could, might or will be is advice or a
#     forecast, whatever words it uses ("A bit of dialogue would help", "A
#     stranger holding this page will feel the lemon"): "modal". What the
#     draft itself says ("You say you would do it again"), what happened
#     ("could have"), and what a sentence could as well say of anyone ("could
#     describe any store") are observations, and pass.
#
# "question" (a note's question): it has to ask.
#   - It opens, or restarts after a comma or a dash, with a question word or
#     a helping verb. A statement with a question mark on it, and a statement
#     with a tag hung on the end (", did they not?"), are "not_a_question".
#   - What comes before the restart may set the question up ("After the bolt
#     was found, who spoke first?"); it may not be a sentence of story
#     ("...smelled of cardboard and cold milk, what else?"): "essay_text".
#   - It may not be a suggestion in the shape of a question: one that opens
#     "would", "could", "should" about anything but a person, "why not",
#     "what if", "how about", "is it worth", "is there a detail you could
#     slip in", "does the scene want a number": "rewrite".
#
# "open" (a question on an ideas card or in a brainstorm): all of that, and
# it is about their life and leaves the answer to them. "Tell me about" and
# "Describe" are ways of asking. A yes or no question may ask what they
# remember ("Did anyone else notice?", "Was there a day you almost quit?"),
# but it may not offer the answer for them to agree to ("Is the lemon what
# this is all about?", "Would you say you matured at that store?", "Do you
# think...", "Could the scene be..."), and no question opens "what if" or
# "what could": "not_open". Nor does it ask for the lesson or the meaning in
# the words those are handed over in ("teach you about", "the kind of
# person", "who you are", "turning point", "all about"): "lesson".
STATEMENT, QUESTION, OPEN = "statement", "question", "open"

_ABOUT_THE_WORK = re.compile(
    r"\b(?:you|your|yours|yourself|draft|essay|piece|paragraphs?|sentences?|lines?|passages?|openings?|endings?|"
    r"introduction|conclusion|prompt|record|story|scenes?|sections?|phrases?|quotes?|details?|point|page|text|"
    r"writer|student|readers?|rest|qzq|qzn|this|these|here|"
    r"(?:the|these|those|its|which|what|\d+|two|three|four|five|six|seven|eight|nine|ten|few|many|several) words?|"
    r"says|tells|names|mentions|describes|lists|shows|gives|covers|repeats|restates|appears?|moves|shifts|skips|"
    r"stays|stops|returns|opens|closes|ends|begins|starts|jumps|passes|follows|arrives|comes up|shows up|"
    r"(?:is|are|gets?|goes|stays?|remains?) (?:\w+ )?(?:described|named|mentioned|told|shown|stated|given|quoted|"
    r"introduced|listed|explained|covered|repeated|unnamed|unsaid|untold|missing|absent)|"
    r"told (?:through|in|as|from|by|with)|(?:is|are) about)\b")
# What only points back, or counts what the page does. Enough for a sentence
# in the present ("It names a store, a customer and an aisle.", "The boy never
# speaks."), not for one told in the past.
_POINTS_BACK = re.compile(r"\b(?:it|its|itself|that|those|they|them|their|everything|nothing|something|both|each|"
                          r"neither|none|clauses?|images?|half|halves|comes? up|never|once|twice|again|only|"
                          r"no longer|anymore|at all)\b")
_MODAL = re.compile(r"\b(?:would|could|might|shall|must|will|may|can|won't|wouldn't|couldn't|can't|[a-z]+'ll)\b")
# "Would have yelled", "could have been": what did or did not happen, not what the essay could do.
_HAPPENED = re.compile(r" (?:not |never |easily |just |also )?have (?:been|had|done|gone|said|made|known|seen|come|"
                       r"taken|given|told|left|lost|won|kept|felt|meant|[a-z]{2,}(?:ed|en))\b")
# What the draft says or leaves out about what someone would do: "says less about what you would do there".
_REPORTED = re.compile(r"\b(?:says?|said|asks?|tells?|explains?|describes?|mentions?|states?|shows?|about|clear|"
                       r"know|knows) (?:\w+ ){0,3}?(?:what|how|where|why|whether|if|who|that|when) "
                       r"(?:you|he|she|they|we) (?:\w+ )?$")
# What someone in the story thought was coming: "You were afraid the team would not accept you."
_THOUGHT_THEN = re.compile(
    r"\b(?:you|he|she|they) (?:\w+ )?(?:(?:were|was) (?:afraid|worried|sure|certain|scared|hoping|convinced|told|"
    r"unsure|terrified|nervous)|thought|knew|hoped|feared|worried|expected|believed|wondered|assumed|figured|decided|"
    r"promised|doubted|imagined|guessed|suspected)\b")
# "This part could go": how a cut is talked about.
_COULD_GO = re.compile(r" (?:go|be cut|be removed|come out)\b")
# "A detail only someone at that register would have."
_ONLY_SOMEONE = re.compile(r"\bonly (?:someone|somebody|a person|you|the person|people)\b[^.!?]{0,40}$")
_TWO_READINGS = re.compile(r" (?:also |still |just |even |only )?(?:mean|refer|be read|be about|be either|be both)\b")
_OF_ANYONE = re.compile(
    r" (?:\w+ )?(?:be|appear|belong|fit|apply|describe|come|stand|hang|go|read the same)\b[^.!?]{0,40}?\b(?:any|"
    r"anyone|anyone's|anybody|every|everyone|everyone's|someone else|someone else's|a different|almost|many|most)\b")
_READER_CAN = re.compile(r"\b(?:readers?|anyone|nobody|no one|one) $")
_PERCEIVES = re.compile(r" (?:\w+ )?(?:see|hear|tell|know|picture|follow|place|find)\b")
# The same spellings as ordinary nouns: the month, a can of tomatoes, her will, all his might.
_NOT_A_MODAL = {
    "may": (re.compile(r"\b(?:in|to|of|by|until|since|last|next|every|from|through|early|late|mid|before|after|"
                       r"between|during) $"), re.compile(r" (?:\d|and\b|to\b|through\b|of\b)")),
    "can": (re.compile(r"\b(?:a|the|each|every|per|tin|soda|trash|garbage|watering|paint|spray|\d+) $"),
            re.compile(r" of\b")),
    "will": (re.compile(r"\b(?:her|his|their|your|the|a|free|good|own|sheer|strong|ill|at) $"), None),
    "might": (re.compile(r"\b(?:his|her|their|your|all|its) $"), None),
    "must": (re.compile(r"\ba $"), None),
}


def _own_modal(sentence: str, m: re.Match) -> bool:
    """Whether the modal at `m` is Quill saying what would or will be."""
    word, before, after = m.group(), sentence[:m.start()], sentence[m.end():]
    noun = _NOT_A_MODAL.get(word)
    if noun and (noun[0].search(before) or (noun[1] and noun[1].match(after))):
        return False
    if _SAID_BY_THE_DRAFT.search(before) or _REPORTED.search(before) or _HAPPENED.match(after):
        return False
    if word in ("would", "could", "might", "wouldn't", "couldn't") and _THOUGHT_THEN.search(before):
        return False
    if word == "could" and (_COULD_GO.match(after) or after.strip() == "be"):
        return False                                        # ("where the writer's own part could be")
    if word in ("would", "could") and _ONLY_SOMEONE.search(before):
        return False
    # What is already in the application, not how anyone will take it.
    if word == "will" and _READER_CAN.search(before) and re.match(r" (?:already |also )?have\b", after):
        return False
    if word in ("could", "can", "might", "may") and _TWO_READINGS.match(after):
        return False
    if word in ("could", "can", "would", "might") and _OF_ANYONE.match(after):
        return False
    if word in ("can", "can't") and _READER_CAN.search(before) and _PERCEIVES.match(after):
        return False
    return True


def _reads_as_story(sentence: str) -> bool:
    return bool(_TOLD_IN_THE_PAST.search(sentence)) and not _ABOUT_THE_WORK.search(sentence)


def _statement(flat: str) -> Optional[str]:
    for start, end, mark in _sentence_spans(flat):
        if mark == "?":
            continue
        sentence = flat[start:end].strip()
        if not _ABOUT_THE_WORK.search(sentence) and (
                _TOLD_IN_THE_PAST.search(sentence) or not _POINTS_BACK.search(sentence)):
            return "essay_text"
        if any(_own_modal(sentence, m) for m in _MODAL.finditer(sentence)):
            return "modal"
    return None


_WH = r"(?:what|who|whom|whose|where|when|why|how|which)"
_AUX = (r"(?:do|does|did|is|are|was|were|am|can|could|would|will|should|shall|may|might|must|have|has|had|isn't|"
        r"aren't|wasn't|weren't|doesn't|didn't|don't|wouldn't|couldn't|shouldn't|won't|can't|haven't|hasn't|hadn't)")
_LEAD_IN = r"(?:(?:and|but|so|or|then|also|now|well|okay|ok|still|yet|besides),? )?"
_BEFORE_WH = (r"(?:(?:at|in|on|to|for|from|with|by|of|about|after|before|during|since|until|under|into|through|"
              r"exactly|just|roughly|around) )?")
_ASKS = re.compile(rf"{_LEAD_IN}(?:{_BEFORE_WH}{_WH}|{_AUX})\b")
_ASKS_OPENLY = re.compile(rf"{_LEAD_IN}(?:{_BEFORE_WH}{_WH}|{_AUX}|tellqz|tell us|describe)\b")
_WH_WORD = re.compile(rf"\b{_WH}\b")
# Where a question can start again: after a comma, a dash or a colon, after a
# quotation (which may have ended its own sentence), and after a full stop
# that _sentence_spans did not count as an end ("You got a B. What then?").
_RESTART = re.compile(r", | - |: |(?<=qzq) |(?<=\.) ")
_LEADING_MASK = re.compile(r"(?:(?:qzq|qzn)[.,]? )+")
# ", did they not?", ", isn't that so?", ", wouldn't you say that's the point?"
_TAG = re.compile(
    rf", (?:or |and )?{_AUX}(?: not)? (?:it|they|he|she|you|we|that|this|there)(?: not)?"
    r"(?: (?:so|right|true|seem|be|agree|see|know|suppose|think(?: so)?|say\b[^?]{0,40}))?$")
# What a clause opens with when it only sets a question up.
_SETS_UP = re.compile(r"(?:after|before|when|while|once|during|in|on|at|by|since|until|as|if|with|from|for|of|"
                      r"looking|thinking|back|that)\b")
_ASKS_TO_CHANGE = re.compile(
    r"(?:would|could|should|can|might|shall|will|may|must) (?!you\b|he\b|she\b|they\b|we\b|anyone\b|anybody\b|"
    r"someone\b|somebody\b|everyone\b|either\b|any of\b)"
    r"|why not\b|what if\b|how about\b|would it\b|isn't it\b|wouldn't it\b|is it worth\b"
    r"|what about (?![^?]*\b(?:made|makes|make|was|is|were|are|did|do|does|stuck|stays|stayed|felt|feels|scared|"
    r"surprised|bothered|worried|mattered|matters|drew|kept|keeps|struck|changed|you)\b)"
    r"|is there (?:an?|any|some) (?:\w+ ){0,3}?(?:details?|place|spot|way|line|sentence|moment|word)\b[^?]{0,60}?"
    r"\byou (?:could|can|might) (?:slip|add|fit|work|put|include|use|bring|weave|drop|squeeze|show|say|mention)\b"
    r"|do you want (?:(?:the|a|your|any|every) (?:\w+ )?(?:readers?|audience)\b|(?:readers|people|them|us|anyone) to\b)"
    r"|does (?:the|this|that|your)\b[^?]{0,50}?\b(?:want|call for|cry out for|ask for) (?:an?|another|more|one more|"
    r"some|its own)\b")
# ("What would you have done if he had yelled?" and "How would you describe
# him?" ask about what happened and who someone is.)
_ASKS_WHAT_IF = re.compile(r"(?:what if|why not|(?:what|how) (?:would|could|might|should)\b"
                           r"(?! (?:you|he|she|they) have\b| you (?:describe|explain)\b))")
# A yes or no question that puts the answer in front of them.
_OFFERS_THE_ANSWER = re.compile(
    r"(?:is|isn't|are|aren't|was|wasn't|were|weren't) (?:it|that|this|these|those|the|your|what)\b"
    r"|(?:would|wouldn't|could|couldn't|should|shouldn't|might|can|can't|will|won't|shall|may|must) "
    r"(?!you (?:tellqz|tell us|describe|say more|talk about)\b)"
    r"|(?:do|does|doesn't|don't) (?:you (?:think|see|feel|believe|agree|find|consider|suppose|want|mean|wish|hope)\b"
    r"|it\b|that\b|this\b|the\b|these\b|those\b|your\b)"
    r"|(?:did|didn't) (?:it|that|this|the|these|those)\b"
    r"|(?:have|has|had|haven't|hasn't) (?:you (?:thought|considered|decided|realized|realised)\b|it\b|that\b|this\b"
    r"|the\b)")
_LESSON_FRAME = re.compile(
    r"\b(?:teach|teaches|taught) you (?:about|that|anything|something|the value|a lesson)\b"
    r"|\b(?:teach|taught) you$|\bhow (?:did|does|has|have) [^?]{1,40}?\b(?:teach|taught) you\b"
    r"|\bchang(?:e|ed|es) (?:you\b(?!r)|who you\b)|\bshap(?:e|ed|es) (?:you\b(?!r)|who you\b)|\babout yourself\b"
    r"|\b(?:kind|sort|type) of person\b"
    r"|\bwho you (?:are|were|became|have become)(?= ?$| (?:today|now|then|as|at heart|inside|really|becoming)\b)"
    r"|\bturning point\b|\bmatur(?:e|ed|es|ing|ity)\b|\bthe point of\b|\ball about\b"
    r"|\b(?:heart|center|centre|core) of\b|\bin miniature\b|\babout more than\b|\bmore than just\b"
    r"|\b(?:what|which|the|a|that|this|any|one|big|bigger|biggest|life|main|real|hard|first|important|key|your|its|"
    r"his|her|their|no|some) lessons?\b|\bgood place to\b|\bbuild on\b"
    r"|\bsays? about (?:you|who|what kind|the kind|your)\b|\bshows? (?:how|that|who|what) you\b|\bthe answer to\b")


def _one_question(question: str, kind: str) -> Optional[str]:
    """One question, masked, lowercase and without its question mark."""
    question = _LEADING_MASK.sub("", question, count=1) if _LEADING_MASK.match(question) else question
    tag = _TAG.search(question)
    if tag and len(question[:tag.start()].split()) >= 4:
        return "not_a_question"
    opener = _ASKS_OPENLY if kind == OPEN else _ASKS
    at, prefix = (0, "") if opener.match(question) else (None, "")
    if at is None:
        for m in _RESTART.finditer(question):
            if opener.match(question, m.end()):
                at, prefix = m.end(), question[:m.start()]
                break
    if at is None:
        # "Then what?", "Why Thursdays?": a few words around a question word.
        if len(question.split()) <= 4 and _WH_WORD.search(question):
            return None
        return "not_a_question"
    if prefix and _reads_as_story(prefix) and not _SETS_UP.match(prefix):
        return "essay_text"
    asking = re.sub(rf"^{_LEAD_IN}", "", question[at:])
    if _ASKS_TO_CHANGE.match(asking):
        return "rewrite"
    if kind == OPEN:
        if _ASKS_WHAT_IF.match(asking) or _OFFERS_THE_ANSWER.match(asking):
            return "not_open"
        if _LESSON_FRAME.search(question):
            return "lesson"
    return None


def _asks(flat: str, kind: str) -> Optional[str]:
    spans = _sentence_spans(flat)
    asked = [(a, b) for a, b, mark in spans if mark == "?"]
    if not asked and kind == OPEN and spans:
        asked = [spans[-1][:2]]                 # "Tell me about the shop."
    for a, b in asked:
        reason = _one_question(flat[a:b].strip(), kind)
        if reason:
            return reason
    return None


# The one term of Quill's own that may sit in quotation marks: a model asked
# about the point of an essay reaches for it.
_OWN_TERMS = frozenset({"so what", "so what?"})
# More quoted pieces than this in one line is not a note about a passage: it
# is a sentence being assembled out of the student's words, a few at a time.
MAX_QUOTED_SPANS = 4
MAX_NAMES = 200

# *Words like these* and _these_ are quoted words by another mark.
_EMPHASIS = re.compile(r"(?<![\w*])\*{1,3}(?=\S)([^*]{1,300}?)(?<=\S)\*{1,3}(?![\w*])"
                       r"|(?<![\w_])_{1,3}(?=\S)([^_]{1,300}?)(?<=\S)_{1,3}(?![\w_])")


def _emphasis_as_quote(m: re.Match) -> str:
    inner = m.group(1) or m.group(2)
    return f'"{inner}"' if len(inner.split()) > 1 and '"' not in inner else m.group(0)


def name_pattern(names) -> Optional[re.Pattern]:
    """One pattern for the names a line may use without their words being
    read as its own: an activity's title, role and organization, an award, the
    title of another essay. "Admissions Ambassador", "Spelling Bee Club" and
    "We the People" are on the record under those names, and a note that says
    one is not talking about admission, spelling or itself.

    Only names of two words or more: a one-word name ("Reader", "Editor") is
    an ordinary word too, and masking it would blind the lists to it. Pass the
    result to breaks_rules or clean_line as `names`."""
    wanted: set[str] = set()
    for name in names if isinstance(names, (list, tuple)) else []:
        plain = _plain(name).lower() if isinstance(name, str) else ""
        for form in (plain, re.split(r" ?[,(\[]| - ", plain)[0]):
            form = form.strip(" .,;:!?\"'")
            if 5 <= len(form) <= 160 and " " in form:
                wanted.add(form)
    if not wanted:
        return None
    longest_first = sorted(wanted, key=len, reverse=True)[:MAX_NAMES]
    return re.compile(r"(?<!\w)(?:" + "|".join(re.escape(n) for n in longest_first) + r")(?!\w)", re.I)


def breaks_rules(text, allowed_sources: list, *, names: Optional[re.Pattern] = None, allow=(),
                 also=None, kind: Optional[str] = None, known: Optional[frozenset] = None) -> Optional[str]:
    """The reason a model-written line may not be shown, or None.

      "long"          over LINE_MAX characters: no field is that long, and the
                      patterns below are never run on more (clean_line cuts a
                      line to its own limit before it gets here)
      "new_text"      it puts quotation marks (or *asterisks*) around words
                      that are not in any of allowed_sources (the draft, the
                      prompt, the record's wording, another essay): they may
                      only hold the student's own words or the record's
      "rewrite"       it tells the student what to write, add, move or cut, or
                      how to word something: an instruction, a suggestion
                      dressed as a question, what the essay "needs" or
                      "should" do, a new sentence set down after a colon
      "first_person"  it says "I", "my" or "we" outside a quotation: essay
                      text is first person, and Quill's notes never are
      "mechanics"     it comments on grammar, spelling, punctuation or wording,
                      or corrects a word
      "odds"          it talks about admission, chances or how a reader reacts
      "unreadable"    its own words are not plain English in plain letters: a
                      control character, a letter of another alphabet, letters
                      spaced out or swapped for digits, a list mark, another
                      language
      "new_name"      it names someone or something that is not in `known`
                      (only when `known` is given)
      "essay_text", "modal", "not_a_question", "not_open", "lesson"
                      it is not what a line of its `kind` has to be (only
                      when `kind` is given: STATEMENT, QUESTION or OPEN)

    Everything after "new_text" is checked on the model's own words only: the
    quotations that were just proven to be the student's are masked first, and
    so are `names` (name_pattern: the record's own names for things). The
    mechanics and odds lists also read past the words that belong to the
    student's story (_own_subject).

    allowed_sources holds strings or prepare()d Sources. `allow` switches off
    one check for a caller with a reason: "first_person" for a card's label
    ("Fixing bikes with my uncle"), "label" for the same label, which is a few
    nouns and not a sentence of English, "tell_me" for a brainstorm, where
    "Tell me about the shop" is a way of asking. `known` is known_words() of
    everything the model was shown. `also` is one more check for that caller,
    called with the masked, lowercase line; it returns a reason or None."""
    if not isinstance(text, str) or not text.strip():
        return None
    if len(text) > LINE_MAX:
        return "long"
    marked = _EMPHASIS.sub(_emphasis_as_quote, text)
    written = marked.translate(_FLAT_MAP)               # the words as written, marks straight: what is verified
    spans = sorted(_quote_ranges(written))
    # A line made mostly of quoted pieces is a sentence being assembled.
    if len(spans) > MAX_QUOTED_SPANS:
        return "new_text"
    prepared: list = []

    def all_sources() -> list:
        """The sources, made ready once and only when something is looked up."""
        if not prepared:
            prepared.append([_as_source(s) for s in (allowed_sources or [])])
        return prepared[0]

    sources = all_sources() if spans else []
    quoted: list[tuple[str, bool]] = []                 # each quotation, and whether it is masked
    for a, b in spans:
        words = written[a:b]
        if _flat(words).strip(" .,;:!") in _OWN_TERMS:
            quoted.append((words, False))
        elif any(_find(n, source) for n in _needles(words) for source in sources):
            quoted.append((words, True))
        else:
            return "new_text"
    if not (written.isascii() and written.isprintable()) and _odd_characters(written, spans, all_sources):
        return "unreadable"
    # The words as a reader sees them: what the lists read. A line with
    # invisible characters in it is read twice, with each one taken out and
    # with each one as a space, so neither "gram<>mar" nor "you<>could<>say"
    # gets by.
    readings = [_plain(marked)]
    if not text.isascii():
        spaced = _plain(marked, " ")
        if spaced != readings[0]:
            readings.append(spaced)
    for n, plain in enumerate(readings):
        if len(plain) > LINE_MAX * 2:
            return "long"
        masked = _mask_quotes(plain, quoted, " " if n else "")
        if masked is None:
            return "new_text"
        if names is not None:
            masked = names.sub(_NAME_MASK, masked)
        if "tell_me" in allow:
            masked = _TELL_ME.sub("tellqz", masked)
        flat = masked.lower()
        if _steers(flat) or _introduces(masked):
            return "rewrite"
        if "first_person" not in allow and _first_person(masked):
            return "first_person"
        story = _own_subject(flat)                      # the student's own subject is not Quill's comment
        if _MECHANICS.search(story) or any(p.search(story) for p in _WORDING):
            return "mechanics"
        if any(p.search(story) for p in _ODDS):
            return "odds"
        if _disguised(flat, all_sources) or ("label" not in allow and _not_english(flat)):
            return "unreadable"
        if known is not None and n == 0 and _new_name(masked, known):
            return "new_name"
        reason = _statement(flat) if kind == STATEMENT else _asks(flat, kind) if kind in (QUESTION, OPEN) else None
        reason = reason or (also(flat) if also else None)
        if reason:
            return reason
    return None


def _mask_quotes(plain: str, quoted: list, gap: str) -> Optional[str]:
    """`plain` with each verified quotation replaced by _MASK, or None when
    its quotation marks are not the ones that were verified.

    The quotations were found and proven in the line as written; the lists
    read it plainly. The two must hold the same quotations in the same order,
    word for word: a character that only turns into a quotation mark when it
    is read plainly (a half-width corner bracket) would otherwise move the
    marks along, and the mask would land on words nobody checked."""
    places = sorted(_quote_ranges(plain))
    if len(places) != len(quoted):
        return None
    pieces, at = [], 0
    for (start, end), (words, mask) in zip(places, quoted):
        if _plain(words, gap) != plain[start:end].strip():
            return None
        if mask:
            pieces += [plain[at:start - 1], _MASK]
            at = min(len(plain), end + 1)
    return "".join(pieces) + plain[at:]


_SENTENCE_END = re.compile(r"[.!?][\"')\]]?(?= |$)")
_ABBREVIATION = re.compile(r"\b(?:mr|mrs|ms|dr|st|vs|etc|jr|sr|prof|e\.g|i\.e|a\.m|p\.m)$", re.I)
# A dash a model wrote: an em dash anywhere, an en dash or a double hyphen
# standing in for one.
_MODEL_DASH = re.compile(r"\s*—\s*| (?:[–―]|--+) ")
# The marks that turn the direction of a line around. They change what every
# later character looks like, so they never reach a page, even inside a quote.
_DIRECTION = frozenset("؜‎‏‪‫‬‭‮⁦⁧⁨⁩")


def sentences(text) -> list[str]:
    """A line split into its sentences, each with its closing mark. A full
    stop inside a pair of double quotation marks does not end one: the quoted
    words stay whole."""
    if not isinstance(text, str):
        return []
    line = " ".join(text[:RAW_LINE_CHARS].split())
    straight = line.translate(_FLAT_MAP)                # the same length: only to count the quotation marks
    out, start, counted, marks = [], 0, 0, 0
    for m in _SENTENCE_END.finditer(line):
        marks += straight.count('"', counted, m.end())
        counted = m.end()
        if marks % 2 or _ABBREVIATION.search(line[:m.start()]):
            continue
        out.append(line[start:m.end()].strip())
        start = m.end()
    rest = line[start:].strip()
    return [s for s in (*out, rest) if s]


def _whole_sentences(text: str, limit: int) -> str:
    """The whole sentences of `text` that fit in `limit` characters, or ""."""
    end = 0
    for m in _SENTENCE_END.finditer(text[:limit + 1]):
        if m.end() <= limit and not _ABBREVIATION.search(text[:m.start()]):
            end = m.end()
    return text[:end].strip()


def _shown(line: str) -> str:
    """A checked line as a student reads it. The model's own words lose what
    it may not put on a page: an em dash (and an en dash or a double hyphen
    standing in for one) becomes a comma, and invisible characters go. The
    words inside quotation marks are the student's, proven so by now, and stay
    exactly as they wrote them, dashes included: rewriting a dash there made
    an exact quote of "I wanted to leave—but I stayed" into words that
    are not in the draft."""
    straight = line.translate(_FLAT_MAP)                # the same length: only to find the quotation marks
    out, at = [], 0
    for a, b in sorted(_quote_ranges(straight)):
        out += [_own_words(line[at:a]), "".join(c for c in line[a:b] if c not in _DIRECTION)]
        at = b
    out.append(_own_words(line[at:]))
    return " ".join("".join(out).split())


def _own_words(part: str) -> str:
    part = _MODEL_DASH.sub(", ", part).replace("–", "-").replace("―", "-")
    return part if part.isascii() else "".join(c for c in part if not _unseen(c))


def _line(text, limit: int, allowed_sources, **checks) -> tuple[Optional[str], Optional[str]]:
    """(the line as it may be shown, None) or (None, why it was dropped).

    A line over its limit keeps the whole sentences that fit; with none, it is
    "long". It is never cut mid-sentence, because half a sentence of feedback
    reads as broken. The rules are run on the line as the model wrote it, and
    only then is it made ready to show (_shown): the quoted-words check has to
    see the model's exact copy of the student's words. `checks` are
    breaks_rules's own (names, allow, also)."""
    if not isinstance(text, str):
        return None, "missing"
    line = " ".join(text[:RAW_LINE_CHARS].split())
    if not line:
        return None, "missing"
    while len(_shown(line)) > limit:                    # measured as shown: a dash can become two characters
        line = _whole_sentences(line, min(limit, len(line) - 1))
        if not line:
            return None, "long"
    reason = breaks_rules(line, allowed_sources, **checks)
    if reason:
        return None, reason
    shown = _shown(line)
    return (shown, None) if shown else (None, "missing")


def clean_line(text, limit: int, allowed_sources: list, **checks) -> Optional[str]:
    """A model-written line made safe to show, or None when it must be dropped:
    kept to the whole sentences that fit in `limit`, held to breaks_rules, and
    then shown without the dashes and invisible characters a model may not
    put on a page (_shown). A line that breaks a rule is never repaired or
    reworded here: it goes. `checks` are breaks_rules's own."""
    return _line(text, limit, allowed_sources, **checks)[0]


def _question(text, limit: int, allowed_sources, **checks) -> tuple[Optional[str], Optional[str]]:
    """A question a student is asked: a clean line that ends with a question
    mark. Anything after its last question mark is left off before the rules
    run, so "What happened at that practice? I am curious." is the question
    it holds and nothing else."""
    if isinstance(text, str) and "?" in text[:RAW_LINE_CHARS]:
        text = text[:text[:RAW_LINE_CHARS].rfind("?") + 1]
    line, reason = _line(text, limit, allowed_sources, **checks)
    if line is None:
        return None, reason
    if "?" not in line:
        return None, "not_a_question"
    return line[:line.rfind("?") + 1], None


# ── The hand-off ─────────────────────────────────────────────────────────────
# Short on purpose. Essays about loss, illness and hard times are ordinary
# essays and get an ordinary review, so this is not a screen for sad subjects
# (recall/safety.py has a broad one, for a different job, and it is not used
# here). It is only what a student in danger right now would type: "I", a
# present or future tense, and the act. "I wanted to die" is a story about the
# past and does not match. The model's own safety flag is the second layer,
# and reads the context this cannot.

_CONTRACTIONS = [(re.compile(p), r) for p, r in (
    (r"\bi'm\b|\bim\b", "i am"), (r"\bi'll\b", "i will"), (r"\bi've\b", "i have"), (r"\bgonna\b", "going to"),
    (r"\bwanna\b", "want to"), (r"\bdon't\b|\bdont\b", "do not"), (r"\bcan't\b|\bcant\b", "cannot"),
)]
_ADVERBS = (r"(?:(?:really|just|still|honestly|truly|actually|seriously|sometimes|often|always|only|now|kind of|"
            r"sort of|so|badly) ){0,2}")
# "End my life" and "take my life" are also how ordinary essay sentences start
# ("take my life in a new direction", "take my life lessons with me", "end my
# life of crime"), so each counts only where the clause stops there: at
# punctuation, a closing quotation mark, the end of the line, or a word from a
# short list ("tonight", "because"). The list after "take my life" is the
# shorter one, because "and", "so", "if", "when" and "but" are exactly how its
# idioms go on ("take my life and my education seriously"). What this misses
# ("end my life after the exam") is left to the model's own safety flag.
_LIFE_ENDS = (r"(?=\"| ?(?:[.,;!?)]|$)| (?:tonight|today|tomorrow|now|right now|soon|anymore|any more|again|before|"
              r"when|if|because|but|and|so)\b)")
_LIFE_TAKEN = (r"(?=\"| ?(?:[.,;!?)]|$)| (?:tonight|today|tomorrow|now|right now|soon|anymore|any more|again|"
               r"because)\b)")
# "I do not want to be here, I thought, as the bus pulled away" and "I'm ready
# to end it all, I joked" are a story being told: the words that follow say
# who thought it or said it, and when.
_TOLD = (r"(?!,? (?:i (?:thought|said|joked|told myself|whispered|felt|wondered|remember|laughed|wrote|would say|"
         r"used to say)|said|says)\b)")
# "End it all" goes the same way as "end my life": "end it all on a high
# note", "end it all with a perfect recital".
_FATAL = (rf"(?:kill myself(?! laughing\b)|end my (?:own )?life{_LIFE_ENDS}|take my (?:own )?life{_LIFE_TAKEN}|"
          rf"end it all(?![\w-]){_TOLD}{_LIFE_ENDS}|commit suicide)")
_HARM = r"(?:hurt myself|harm myself|cut myself(?! (?:a|an|some|off|out|loose|free|short|shaving|on)\b))"
_FATAL_ING = (rf"(?:killing myself|ending my (?:own )?life{_LIFE_ENDS}|taking my (?:own )?life{_LIFE_TAKEN}|"
              rf"ending it all(?![\w-]){_LIFE_ENDS}|committing suicide|hurting myself|harming myself|cutting myself)")
_INTENT = (r"(?:want to|need to|plan to|intend to|am going to|am planning to|am about to|am ready to|"
           r"have decided to|am trying to)")
# Where a sentence has to stop for "I want to die" or "I do not want to wake
# up" to mean what it says: "die of embarrassment" and "wake up at five" go on.
_STOPS = r"(?= ?(?:[.,;!?)]|$)| (?:anymore|any more|tonight|today|tomorrow|now|right now|soon|again|ever|sometimes)\b)"
_CRISIS = re.compile(
    rf"\bi {_ADVERBS}(?:{_INTENT}|will|might) {_ADVERBS}{_FATAL}"
    rf"|\bi {_ADVERBS}{_INTENT} {_ADVERBS}{_HARM}"
    rf"|\bi {_ADVERBS}(?:am planning on|am thinking (?:about|of)|keep thinking (?:about|of)|think about|"
    rf"am considering|have been thinking (?:about|of)|cannot stop thinking (?:about|of)) {_FATAL_ING}\b"
    # "I think about suicide differently now" is an essay; "I keep thinking about suicide" is not.
    r"|\bi (?:am|keep|have been|cannot stop) thinking (?:about|of) suicide\b"
    r"(?! (?:prevention|awareness|hotlines?|rates?|statistics|differently)\b)"
    rf"|\bi {_ADVERBS}(?:want to|wish to|am ready to) (?:die|be dead)\b{_STOPS}"
    rf"|\bi {_ADVERBS}(?:am|feel) {_ADVERBS}suicidal\b"
    rf"|\bi do not want to (?:be alive\b{_TOLD}|(?:live|exist|wake up|be here)\b{_TOLD}{_STOPS})"
    r"|\bi wish i (?:was|were) dead\b(?! tired\b)"
)


def _quote_turns(line: str, i: int) -> Optional[bool]:
    """What the double quotation mark at line[i] does, read from its shape:
    True when it opens (a space or the start before it, a word after it),
    False when it closes (a word before it, a space or the end after it: an
    inch mark looks like this too), None when its shape does not say."""
    before = line[i - 1] if i else " "
    after = line[i + 1] if i + 1 < len(line) else " "
    opens = before.isspace() or before in "([{-:,;"
    closes = after.isspace() or after in ".,;:!?)]}-"
    if opens and not closes:
        return True
    if closes and not opens:
        return False
    return None


def crisis_now(text) -> bool:
    """True when the writing says, in the first person and the present or
    future tense, that the student intends to hurt or kill themselves ("I want
    to kill myself", "I am going to end my life", "I plan to hurt myself").

    Past tense is not this ("I wanted to die", "I was going to hurt myself"),
    and neither is the same sentence inside quotation marks, which is someone
    being quoted in a story. A statement only counts as quoted when a mark
    opens before it and one closes after it: a stray mark earlier in the
    paragraph (an inch mark, a quotation never closed) hides nothing. Checked
    a paragraph at a time, so nothing in one paragraph can hide another."""
    if not isinstance(text, str) or not text:
        return False
    for paragraph in text[:BODY_MAX * 2].splitlines():
        if paragraph.isascii():
            readings = [" ".join(paragraph.translate(_FLAT_MAP).split())]
        else:
            # Read as a reader sees it: a zero-width space inside "kill
            # myself", or one standing where the space should be (phones and
            # pasted text leave them), must not hide it.
            readings = list(dict.fromkeys((_plain(paragraph), _plain(paragraph, " "))))
        if any(_says_crisis(line.lower()) for line in readings if line):
            return True
    return False


def _says_crisis(line: str) -> bool:
    """crisis_now for one paragraph, already plain and lowercase."""
    for pattern, plain in _CONTRACTIONS:
        line = pattern.sub(plain, line)
    seen, inside, closing = 0, False, -2          # closing: the next mark after the last match, once looked for
    for m in _CRISIS.finditer(line):
        mark = line.find('"', seen, m.start())
        while mark >= 0:
            turn = _quote_turns(line, mark)
            inside = (not inside) if turn is None else turn
            mark = line.find('"', mark + 1, m.start())
        seen = m.start()
        if not inside:
            return True
        if closing < m.end():
            closing = line.find('"', m.end())
        # Opened before it, but never closed after it: not a quotation.
        if closing < 0 or _quote_turns(line, closing) is True:
            return True
    return False


# ── The record ───────────────────────────────────────────────────────────────

def _whole(value, low: int, high: int) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        try:
            value = float(value)
        except ValueError:
            return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return value if isinstance(value, int) and low <= value <= high else None


def _amount(value, unit: str) -> str:
    """ "4 hours", "1 week", "2.5 hours"; "" for nothing usable. """
    if isinstance(value, bool):
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    if not 0 < number <= 168:
        return ""
    number = round(number, 1)
    shown = str(int(number)) if number == int(number) else str(number)
    return f"{shown} {unit}" if number == 1 else f"{shown} {unit}s"


def _listed(numbers: list[int]) -> str:
    """ "10", "10 and 11", "9, 10 and 11" """
    words = [str(n) for n in numbers]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def record_wording(kind, row) -> str:
    """The record's own words for an activity or an award, built from the row,
    so the line a student reads as "your record says" is never a model's.

    activity: "<position> of <title>" or "<title>", then ", <organization>",
              ", grades 10 and 11", ", 4 hours a week, 30 weeks a year"
    award:    "<title>", then ", <level> level", ", grade 11", ", 2025"
    Each part only when the row has it. "" for a row with no title."""
    if not isinstance(row, dict):
        return ""
    title = _text(row.get("title"), 160)
    if not title:
        return ""
    if kind == "activity":
        position = _text(row.get("position"), 80)
        parts = [f"{position} of {title}" if position and position.casefold() != title.casefold() else title]
        organization = _text(row.get("organization"), 120)
        if organization and organization.casefold() != title.casefold():
            parts.append(organization)
        levels = row.get("grade_levels") if isinstance(row.get("grade_levels"), list) else []
        grades = sorted({g for g in (_whole(v, 9, 12) for v in levels) if g is not None})
        if grades:
            parts.append(("grade " if len(grades) == 1 else "grades ") + _listed(grades))
        hours = _amount(row.get("hours_per_week"), "hour")
        weeks = _amount(row.get("weeks_per_year"), "week")
        if hours:
            parts.append(f"{hours} a week")
        if weeks:
            parts.append(f"{weeks} a year")
        return ", ".join(parts)
    if kind == "award":
        parts = [title]
        level = _text(row.get("level"), 40).lower()
        if level in AWARD_LEVELS:
            parts.append(f"{level} level")
        grade = _whole(row.get("grade_level"), 9, 12)
        if grade is not None:
            parts.append(f"grade {grade}")
        year = _whole(row.get("year"), 1990, 2100)
        if year is not None:
            parts.append(str(year))
        return ", ".join(parts)
    return ""


def record_items(record) -> dict:
    """{"activities": [rows], "awards": [rows]}: the rows a prompt lists, in
    the order it lists them. A model points at one by its 0-based index here,
    so the prompts and the checks must both read the record through this."""
    record = record if isinstance(record, dict) else {}

    def rows(key: str) -> list[dict]:
        found = record.get(key) if isinstance(record.get(key), list) else []
        return [r for r in found if isinstance(r, dict) and _text(r.get("title"))][:MAX_RECORD_ROWS]

    return {"activities": rows("activities"), "awards": rows("awards")}


def record_extras(record) -> dict:
    """What else topics.py lists from a record, each in the order a model
    indexes it: {"courses": [names], "majors": [names], "theme": str,
    "gaps": [str], "voice": [the student's own quotes]}."""
    record = record if isinstance(record, dict) else {}
    profile = record.get("profile") if isinstance(record.get("profile"), dict) else {}
    narrative = profile.get("narrative") if isinstance(profile.get("narrative"), dict) else {}

    def strings(values, limit: int, chars: int) -> list[str]:
        out: list[str] = []
        for value in values if isinstance(values, list) else []:
            text = _text(value, chars)
            if text and text not in out:
                out.append(text)
            if len(out) == limit:
                break
        return out

    courses = record.get("courses") if isinstance(record.get("courses"), list) else []
    return {
        "courses": strings([c.get("name") for c in courses if isinstance(c, dict)], MAX_COURSES, 120),
        "majors": strings(profile.get("candidate_majors"), MAX_MAJORS, 120),
        "theme": _text(narrative.get("theme"), EVIDENCE_CHARS),
        "gaps": strings(narrative.get("gaps"), MAX_GAPS, 200),
        "voice": strings(narrative.get("student_voice"), MAX_VOICE, EVIDENCE_CHARS),
    }


def record_description(row) -> str:
    """What an activity or award entry says in its description, if anything."""
    return _text(row.get("description"), 300) if isinstance(row, dict) else ""


def other_essays(others) -> list[dict]:
    """The student's other essays as a review numbers them, from 0:
    [{"title", "body"}], empty ones skipped, each body cut to OTHER_BODY_CHARS.
    The prompt and the checks both read them through this."""
    out = []
    for essay in others if isinstance(others, list) else []:
        if not isinstance(essay, dict) or not isinstance(essay.get("body"), str) or not essay["body"].strip():
            continue
        out.append({"title": _text(essay.get("title"), 120) or "Another essay",
                    "body": essay["body"][:OTHER_BODY_CHARS]})
        if len(out) == MAX_OTHERS:
            break
    return out


def record_names(items: dict, essays: Optional[list] = None, more=()) -> Optional[re.Pattern]:
    """The names on a student's record that a line may say without their words
    being read as its own (name_pattern): each activity's title, role and
    organization, each award's title, the titles of their other essays, and
    whatever else the caller lists (course and major names)."""
    names = [row.get(key) for row in items["activities"] for key in ("title", "position", "organization")]
    names += [row.get("title") for row in items["awards"]]
    names += [essay.get("title") for essay in essays or []]
    return name_pattern([_text(n, 160) for n in (*names, *more) if isinstance(n, str)])


def _record_texts(items: dict) -> list[str]:
    """Every wording of the record a line may quote."""
    texts = []
    for kind, key in (("activity", "activities"), ("award", "awards")):
        for row in items[key]:
            texts.append(record_wording(kind, row))
            texts.append(record_description(row))
    return [t for t in texts if t]


def _at(listed: list, index):
    """The item a model pointed at by its number, or None when there is none."""
    if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(listed):
        return None
    return listed[index]


def _record_row(items: dict, kind, index) -> Optional[dict]:
    if kind not in ("activity", "award"):
        return None
    return _at(items["activities" if kind == "activity" else "awards"], index)


# ── A review ─────────────────────────────────────────────────────────────────

def length_check(kind, word_limit, words: int) -> dict:
    """The length check, which code writes and a model never does. Under the
    minimum it says so and nothing more: Quill never says what to add."""
    low, high = word_bounds(kind, word_limit)
    if words > high:
        verdict, line = "flag", f"{words} words: {words - high} over the limit of {high}."
    elif low is not None and words < low:
        verdict, line = "flag", f"{words} words: {low - words} under the minimum of {low}."
    else:
        verdict, line = "ok", f"{words} words, within the limit of {high}."
    return {"check": "length", "verdict": verdict, "line": line}


def _quote_span(quote, source: Source, low: int, high: int):
    """(start, end) of a quote in the draft, or the reason it does not count."""
    if not isinstance(quote, str) or not quote.strip():
        return "no_quote"
    if not low <= word_count(_unwrap(quote[:QUOTE_CHARS])) <= high:
        return "quote_length"
    return find_quote(quote, source) or "quote_not_in_draft"


def _crowds(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    """This passage shares more than half of itself, or of an earlier kept
    one, with that earlier one."""
    for s, e in spans:
        shared = min(end, e) - max(start, s)
        if shared > 0 and shared * 2 > min(end - start, e - s):
            return True
    return False


def _passage(body: str, start: int, end: int) -> str:
    return " ".join(body[start:end].split())


# A cut is a passage to remove, and its reason says only why the essay holds
# together without it ("this repeats the point made in the second paragraph").
# The moment of shortening is when a model reaches for a shorter version, so a
# reason is held to more than any other line: nothing that introduces text (a
# colon, a semicolon, "such as"), and none of the words a replacement or a
# bridge to the next sentence is offered in.
_NOT_A_REASON = re.compile(
    r"[:;]|\breplac\w*|\bcondens\w*|\bcompress\w*|\babridg\w*|\babbreviat\w*|\bshorten\w*"
    r"|\b(?:be|could|can|to|would) summari[sz]\w*|\bsummari[sz]e (?:it|this|that)\b|\ba summary would\b"
    r"|\bshorter\b|\btighter\b|\bbriefer\b|\bversions?\b|\bbecomes?\b|\bsay it\b|\binstead\b|\bmerg\w+"
    r"|\bcombin\w+|\brework\w*|\bbridg\w+|\btransitions?\b|\bjoin\w*|\bsuch as\b"
    r"|\b(?:begin|start|open|end|close|lead)s? (?:the|this|that|your|it) (?:\w+ ){0,2}?with\b"
    # what would do in its place: "a single clause would cover this", "is
    # enough", "says the same in five words", "can shrink to a phrase"
    r"|\bis enough\b|\benough to\b|\bwould (?:do|cover|say|work|suffice)\b|\bcovers? (?:it|this|that)\b"
    r"|\bsays? the same\b|\bcan (?:be said|shrink|go in|fit)\b|\bcould be (?:a|one|said)\b|\bshrink\w*|\bfold\w*"
    r"|\bin (?:a|one|two|three|four|five|six|ten|\d+|fewer|half|a few) (?:\w+ )?(?:words?|clause|phrase|sentence|"
    r"line)\b|\b(?:half|fewer|\d+|forty|fifty|twenty|thirty) (?:as many |the )?words\b|\bkeep (?:only|just|the)\b"
    r"|\bonly the (?:first|last)\b|\bonly needs?\b|\ball (?:the reader|this|it|the essay) needs\b"
    r"|\bneeds? to (?:know|say|hear)\b|\bmention\b"
    # how what is left would go on: "the next line can open on the gym",
    # "without it the gym leads straight to the lab"
    r"|\bnext (?:line|sentence|paragraph|part)\b[^.!?]{0,40}?\b(?:can|could|starts?|opens?|begins?|picks?|would)\b"
    r"|\bpicks? up\b|\bleads? (?:straight |right |directly )?(?:to|into)\b|\blets? (?:the|you|it)\b"
    # ("This repeats the point made in the sentence before it" is a reason.
    # What the sentence before could do, or take in, is not.)
    r"|\bthe sentence before\b[^.!?]{0,30}?\b(?:can|could|would|will|might|may|should)\b"
    r"|\b(?:to|into|onto|with) the sentence before\b"
)
# And it has to be a reason: that the passage says again what the draft says
# elsewhere, explains what the story shows, or is beside the story. A reason
# says so in one of a small set of words, and a line that has none of them is
# something else: most often the short version itself ("Patience, one word,
# says it.", "Reduce it to the manager's calm."). Having one is not enough on
# its own; the list above still reads the line.
_A_REASON = re.compile(
    r"\b(?:repeat\w*|restat\w*|echo\w*|duplicat\w*|again|already|earlier|above|elsewhere|twice|third|extra|"
    r"redundant|unnecessary|tangent|aside|background|side|detour|general|generally|retells?|listed|lists|states|"
    r"explains?|explanation|told|summari[sz]\w*)\b"
    r"|\bnothing (?:later|else)\b|\b(?:loses?|lose) nothing\b|\bholds together\b|\bmakes? (?:the|this|that) point\b"
    r"|\bmakes? plain\b|\bthe same (?:idea|point|thing|fact|moment|scene|story|detail|claim)\b"
    r"|\bis about\b[^.!?]{0,60}?\b(?:is|are) about\b"
)


def _only_a_reason(flat: str) -> Optional[str]:
    if _NOT_A_REASON.search(flat):
        return "replacement"
    return None if _A_REASON.search(flat) else "not_a_reason"


# What a supplement's school is said to do, when Quill says it. Quill has
# looked nothing up, so "Harlow values curiosity" is a fact it does not have
# and a forecast of what will go over there. The same words handed back as the
# draft's own claim ("You say Harlow values curiosity. Where is yours?") are
# an ordinary note.
_SCHOOL_WORDS = re.compile(r"\b(?:the|university|college|institute|school|of|at|and|technology|state)\b")
_SCHOOL_DOES = (r" (?:\w+ ){0,2}?(?:wants?|values?|likes?|loves?|looks? for|is looking for|seeks?|admits?|accepts?|"
                r"takes?|prefers?|rewards?|expects?|cares? about|favou?rs?|respects?|appreciates?|prizes?|will|would|"
                r"tends? to|is known for|emphasi[sz]es|prides itself)\b")


def _school_check(school_name):
    """A check for breaks_rules's `also`: "odds" when a line of Quill's own
    says what the supplement's school wants, values or will do. None when
    there is no school to speak of."""
    name = " ".join(_plain(school_name).lower().split()) if isinstance(school_name, str) else ""
    short = " ".join(_SCHOOL_WORDS.sub(" ", name).split())
    forms = [re.escape(form) for form in dict.fromkeys((name, short)) if 3 <= len(form) <= 200]
    if not forms:
        return None
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(forms) + r")" + _SCHOOL_DOES)

    def check(flat: str) -> Optional[str]:
        for m in pattern.finditer(flat):
            if not _SAID_BY_THE_DRAFT.search(_HARD_BREAK.split(flat[:m.start()])[-1]):
                return "odds"
        return None

    return check


def validate_review(raw, *, body, prompt_text, record, others, kind, word_limit, school_name: str = "",
                    dropped: Optional[list] = None) -> Optional[dict]:
    """The whole code check of a review a model submitted. Returns the review
    as it is saved, {"handoff": True} when the writing gets the hand-off
    instead, or None when the reply is unusable (no checks object at all).

    The saved review: {summary, word_count, word_limit, word_min,
    checks: [{check, verdict, line}] (the seven, in order),
    notes: [{id, check, quote, start, end, observation, question, record_says, other}],
    cuts: [{id, quote, start, end, reason, words}]}.

    What is enforced, in order:
    1. The hand-off first: the model's safety flag, or crisis_now on the draft.
    2. A note needs a real check (never length), a quote of 3 to 60 words that
       is in the draft, and an observation that passes clean_line. Its
       question must pass too and end with a question mark; only a consistency
       or overlap note may go without one. A consistency note must point at a
       real activity or award, and gets record_says from the row. An overlap
       note must point at a real activity, award or other essay, and gets
       `other` ({kind, label, quote}) from the row, or from the other essay's
       own text. A note on a passage an earlier kept note already covers by
       more than half is dropped. At most 12, in the order of the draft.
    3. The seven checks, in order. Length is written here. A check with a kept
       note is a flag; a flag with no kept note stands only on a usable line
       of its own (and for consistency and overlap, not even then: those make
       a claim about another text, and a claim like that is only shown beside
       that text). "na" is decided here, by whether there is anything to
       compare with.
    4. Cuts only when the draft is over its limit: exact quotes of 3 to 150
       words, a reason that passes clean_line, the words counted here.
    5. The summary through clean_line, or a plain line of our own.

    `quote` is always the draft's own text, never the model's copy, and
    start/end are find_quote's offsets into the body: characters as Python
    counts them (the page converts for a draft with an emoji in it, where
    JavaScript counts differently). `dropped`, when a list is passed, collects
    {"what", "reason"} for everything left out: labels only, never text."""
    if not isinstance(raw, dict):
        return None
    body = body if isinstance(body, str) else ""
    if raw.get("safety") == "crisis" or crisis_now(body):
        return {"handoff": True}
    model_checks = raw.get("checks")
    if not isinstance(model_checks, dict) or not model_checks:
        return None

    def drop(what: str, reason: str) -> None:
        if dropped is not None:
            dropped.append({"what": what, "reason": reason})

    items = record_items(record)
    essays = other_essays(others)
    draft = prepare(body)
    essay_sources = [prepare(e["body"]) for e in essays]
    sources = [draft, prepare(prompt_text), *(prepare(t) for t in _record_texts(items)), *essay_sources,
               *(prepare(e["title"]) for e in essays)]
    names = record_names(items, essays)
    school = _school_check(school_name) if kind == "supplement" else None
    # Every name a line of Quill's may use: all of it was in front of the model.
    known = known_words(body, prompt_text, school_name if isinstance(school_name, str) else "",
                        *record_strings(record), *(f"{e['title']} {e['body']}" for e in essays))
    words = word_count(body)
    low, high = word_bounds(kind, word_limit)

    # 2. Notes.
    notes: list[dict] = []
    raw_notes = raw.get("notes") if isinstance(raw.get("notes"), list) else []
    for n, note in enumerate(raw_notes[:MAX_RAW_NOTES], start=1):
        what = f"note {n}"
        if not isinstance(note, dict):
            drop(what, "not_a_note")
            continue
        check = note.get("check")
        if check not in NOTE_CHECKS:
            drop(what, "bad_check")
            continue
        span = _quote_span(note.get("quote"), draft, QUOTE_MIN_WORDS, QUOTE_MAX_WORDS)
        if isinstance(span, str):
            drop(what, span)
            continue
        start, end = span
        observation, why = _line(note.get("observation"), OBSERVATION_CHARS, sources, names=names, also=school,
                                 kind=STATEMENT, known=known)
        if observation is None:
            drop(what, f"observation_{why}")
            continue
        question, why = _question(note.get("question"), QUESTION_CHARS, sources, names=names, also=school,
                                  kind=QUESTION, known=known)
        if question is None:
            if check not in ("consistency", "overlap"):
                drop(what, f"question_{why}")
                continue
            question = ""
        record_says, other = "", None
        if check == "consistency":
            record_kind = note.get("record_kind")
            record_says = record_wording(record_kind, _record_row(items, record_kind, note.get("record_index")))
            if not record_says:
                drop(what, "no_record_item")
                continue
        elif check == "overlap":
            other_kind, at = note.get("other_kind"), note.get("other_index")
            row = _record_row(items, other_kind, at)
            essay = _at(essays, at) if other_kind == "essay" else None
            if row:
                other = {"kind": other_kind, "label": _text(row.get("title"), 120),
                         "quote": record_wording(other_kind, row)}
            elif essay:
                found = _quote_span(note.get("other_quote"), essay_sources[at], QUOTE_MIN_WORDS, QUOTE_MAX_WORDS)
                if not isinstance(found, str):
                    other = {"kind": "essay", "label": essay["title"], "quote": _passage(essay["body"], *found)}
            if other is None:
                drop(what, "no_other_place")
                continue
        if _crowds(start, end, [(k["start"], k["end"]) for k in notes]):
            drop(what, "repeats_a_note")
            continue
        if len(notes) == MAX_NOTES:
            drop(what, "over_the_cap")
            continue
        notes.append({"check": check, "quote": _passage(body, start, end), "start": start, "end": end,
                      "observation": observation, "question": question, "record_says": record_says, "other": other})

    # 4. Cuts, only when the draft is over its limit.
    cuts: list[dict] = []
    raw_cuts = raw.get("cuts") if isinstance(raw.get("cuts"), list) else []
    for n, cut in enumerate(raw_cuts[:MAX_RAW_CUTS], start=1):
        what = f"cut {n}"
        if words <= high:
            drop(what, "not_over_the_limit")
            continue
        if not isinstance(cut, dict):
            drop(what, "not_a_cut")
            continue
        span = _quote_span(cut.get("quote"), draft, QUOTE_MIN_WORDS, CUT_MAX_WORDS)
        if isinstance(span, str):
            drop(what, span)
            continue
        start, end = span
        reason, why = _line(cut.get("reason"), CUT_REASON_CHARS, sources, names=names, known=known,
                            also=lambda flat: _only_a_reason(flat) or (school(flat) if school else None))
        if reason is None:
            drop(what, f"reason_{why}")
            continue
        if _crowds(start, end, [(k["start"], k["end"]) for k in cuts]):
            drop(what, "repeats_a_cut")
            continue
        if len(cuts) == MAX_CUTS:
            drop(what, "over_the_cap")
            continue
        cuts.append({"quote": _passage(body, start, end), "start": start, "end": end, "reason": reason,
                     "words": word_count(body[start:end])})

    # 3. The seven checks, in order.
    noted = {note["check"] for note in notes}
    has_record = bool(items["activities"] or items["awards"])
    nothing_to_compare = {"consistency": not has_record, "overlap": not (has_record or essays)}
    checks: list[dict] = []
    for name in CHECKS:
        if name == "length":
            checks.append(length_check(kind, word_limit, words))
            continue
        entry = model_checks.get(name) if isinstance(model_checks.get(name), dict) else {}
        verdict = entry.get("verdict")
        line, why = _line(entry.get("line"), CHECK_LINE_CHARS, sources, names=names, also=school, kind=STATEMENT,
                          known=known)
        if line is None and why != "missing":
            drop(f"check {name}", f"line_{why}")
        if name in noted:
            checks.append({"check": name, "verdict": "flag", "line": line if verdict == "flag" and line else LINE_FLAG})
        elif nothing_to_compare.get(name):
            checks.append({"check": name, "verdict": "na", "line": LINE_NA[name]})
        elif verdict == "flag" and line and name not in LINE_NA:
            checks.append({"check": name, "verdict": "flag", "line": line})
        else:
            checks.append({"check": name, "verdict": "ok", "line": line if verdict == "ok" and line else LINE_OK})

    # 5. The summary.
    summary, why = _line(raw.get("summary"), SUMMARY_CHARS, sources, names=names, also=school, kind=STATEMENT,
                         known=known)
    if summary is None:
        if why != "missing":
            drop("summary", why)
        summary = DEFAULT_SUMMARY

    def numbered(kept: list[dict], prefix: str) -> list[dict]:
        """In the order of the draft, with ids n1.. or c1.."""
        ordered = sorted(kept, key=lambda entry: (entry["start"], entry["end"]))
        return [{"id": f"{prefix}{n}", **entry} for n, entry in enumerate(ordered, start=1)]

    return {"summary": summary, "word_count": words, "word_limit": high, "word_min": low,
            "checks": checks, "notes": numbered(notes, "n"), "cuts": numbered(cuts, "c")}


# ── Areas to write about ─────────────────────────────────────────────────────

# The words a lesson is named in. An essay's lesson is the student's to find,
# so a card's label never names one, and a brainstorm never names one the
# student has not said first.
_VIRTUES = (r"(?:resilien(?:ce|cy|t)|persever(?:ance|ing|ed?)|persisten(?:ce|t)|grit|courage(?:ous)?|bravery|"
            r"determination|tenacity|fortitude|adversity|hard work|work ethic|patience|humility|empathy|compassion|"
            r"integrity|selflessness|dedication|self-discipline|growth mindset)")
_VIRTUE = re.compile(rf"\b{_VIRTUES}\b")
# More of them, for a card's label only. In a question each is an ordinary
# word ("What responsibility did you have at the shop?"); as the head of a
# label it is the lesson ("Responsibility at the radio shop", "Quiet
# strength"). "Family responsibilities" are duties, and pass.
_QUALITIES = (r"(?:discipline|maturity|independence|kindness|confidence|generosity|honesty|loyalty|gratitude|"
              r"responsibility|self-reliance|service to others|hard-won|big impact|"
              r"strength (?:in|through|of|from)|(?:quiet|inner|true|real|hidden|mental|emotional) strength|"
              r"\w+ as love)")

# An area names a part of the student's life. A thesis, a lesson, a scene or
# an arc is the essay itself, which is theirs to find: "how robotics taught me
# patience", "the value of hard work", "resilience" and "failure is a teacher"
# are dropped; "robotics", "teaching swim lessons" and "leadership in student
# government" are not.
_NOT_AN_AREA = re.compile(
    r"^(?:how|why|what|when|where|who)\b"
    r"|^the (?:time|day|moment|night|summer|year|morning|afternoon) (?:i|you|we|that|when)\b"
    r"|\b(?:taught|teaches)\b|\b(?:teaching|showed|shows|showing) (?:me|you|us)\b"
    r"|\b(?:made|makes|making|shaped|shapes|shaping|changed|changes|changing) (?:me|you|us|who)\b"
    r"|\b(?:i|we)\b|\byou (?:learned|realized|realised|discovered|became|grew|found|overcame)\b"
    r"|\blearn(?:ed|t)\b|\blessons? (?:i|you|we|learned|from)\b|\bwhat (?:i|you) learned\b"
    r"|\b(?:overcoming|turning point|journey|coming of age)\b"
    r"|\bfrom \w+(?: \w+){0,3} to \w+"
    # a claim ("failure is a teacher"), or a quality held up ("the power of persistence")
    r"|\b(?:is|are|was|were) (?:a|an|the|my|our)\b"
    r"|\b(?:power|value|importance|joy|beauty|meaning) of\b"
    r"|\bas (?:a|an|my) (?:teacher|lesson|gift|blessing|opportunity|strength)\b"
    r"|\b(?:growth|strength|leadership|identity|purpose|confidence|change|success|wisdom) through\b"
    r"|\b(?:never|not) giving up\b|\bfinding (?:my|your|their|our|a|an) (?:own )?(?:voice|place|way|purpose|"
    r"identity|self|path|passion|calling)\b|^becoming\b|^be \b"
    rf"|\b{_VIRTUES}\b|\b{_QUALITIES}\b"
    r"|[:!?]"
)


def _not_a_label(flat: str) -> Optional[str]:
    return "not_a_label" if _NOT_AN_AREA.search(flat) else None


def clean_area(text, max_words: int, allowed_sources: list, names: Optional[re.Pattern] = None) -> Optional[str]:
    """A label for an ideas card: a short, neutral name for a part of the
    student's life, or None. Not a sentence, a question, a thesis or a lesson,
    and held to breaks_rules like any other line, except that it may say "my"
    ("Fixing bikes with my uncle"): it names their life on their own card.
    `names` are the record's own names (record_names), which may hold any of
    these words."""
    if not isinstance(text, str):
        return None
    line, _ = _line(text.strip(_WRAP + "."), AREA_CHARS, allowed_sources, names=names,
                    allow=("first_person", "label"), also=_not_a_label)
    if line is None or len(line) < 2 or word_count(line) > max_words:
        return None
    return line


# ── A brainstorm ─────────────────────────────────────────────────────────────

# A brainstorm asks about a life. The essay is not named in it: "what about
# the radio shop as your essay topic?" picks the subject for them.
_NAMES_THE_ESSAY = re.compile(
    r"\bessays?\b|\bthes[ie]s\b|\bpersonal statement\b|\bsupplements?\b|\byour story\b|\byour theme\b"
    r"|\b(?:write|writing|written|wrote) about (?:this|that|it|the|your|how|what|when|why)\b|\bshould be about\b"
    r"|(?<!\bdid )(?<!\bdo )\byou write about\b|\b(?:to|could|would|might|can|should|will) write about\b"
    r"|\b(?:as|for) (?:a|an|your|the) (?:\w+ )?topic\b|\btopic for\b|\b(?:opening|first|last|closing) "
    r"(?:line|sentence|paragraph)\b|\bhook\b|\b(?:narrative|story) arc\b|\btake-?away\b"
    r"|\b(?:a|your|the) (?:good|great|strong|possible|perfect|right|real) (?:subject|topic)\b"
    r"|\bas (?:a|your|the) subject\b|\bcolleges\b|\b(?:college|your) applications?\b|\b(?:the|a|your) readers?\b"
    r"|\b(?:first|opening|last|closing|final) scene\b|\bbeginning,? middle\b|\b(?:as|into) a story\b|\bthe moral\b"
    r"|\bmessage\b[^.!?]{0,30}?\b(?:readers?|colleges|them|people|take)\b"
)
# A closing line reflects back what they said. It gives no verdict on it, no
# lesson and no next step, so it has none of the words those come in. Held to
# more than a question is, and cheaply: a closing line that fails only becomes
# the canned one.
_NOT_A_REFLECTION = re.compile(
    r"\btopics?\b|\bthemes?\b|\bshould\b|\bcould be\b|\bstrong(?:er|est)?\b|\bwrit(?:e|es|ing|ten)\b|\bwrote\b"
    r"|\bgreat\b|\bperfect\b|\bpowerful\b|\bcompelling\b|\brich\b|\bpromising\b|\binteresting\b"
    r"|\bbuild on\b|\bwork with\b|\bmaterial\b|\bway in\b|\bworth\b|\bthe one(?= ?[.!]|$)|\bfound it\b|\bgo with\b"
    r"|\bit is(?= ?[.!]|$)|\ba lot here\b|\bsubject\b|\bidea\b|\bangle\b|\bdirection\b|\bfocus\b"
    r"|\b(?:made|makes|shaped|shapes|taught|teaches) you\b|\bshaped (?:you|who)\b|\bwho you are\b"
    # ("You learned to solder at nine" is what they said; "you learned that
    # patience matters" is a lesson drawn for them.)
    r"|\byou (?:learned|realized|realised|discovered) (?:that|how|what|why|about|a lot|so much)\b"
    r"|\byou (?:grew|became) (?:as|into|more|a|an)\b|[:;]"
)
# And it has a shape: it says what the student did in the talk ("You kept
# coming back to the dairy cooler", "You described the lemon in the most
# detail"), in a verb for saying or returning. A line with no such verb is
# about the subject, not about what they said, and that is where a thesis is
# handed over ("Noticing people is the through-line here.", "The lemon says
# that noticing is a form of care."). Nor does it draw anything from what
# they said, in the words that is done in.
_REFLECTS = re.compile(
    r"\byou (?:(?:also|often|mostly|mainly|first|then|later|always|both|really|twice|just) )?(?:keep|kept|came|come|"
    r"went|go|returned|return|spoke|talked|described|mentioned|said|wrote|told|slowed|stayed|stuck|lingered|dwelt|"
    r"gave|named|brought|raised|used|repeated|circled|noticed)\b")
_DRAWS_A_LESSON = re.compile(
    r"\b(?:because|means?|meant|shows?|proves?|points?|learn\w*|heart|thread|through-?line|core|cent(?:er|re)|"
    r"essence|truth|lessons?|answers?|begins?|starts?|opens?|matter\w*|why|could)\b"
    r"|\bcar(?:e|es|ed|ing)\b(?! (?:of|for)\b)")
_QUALITY = re.compile(rf"\b{_QUALITIES}\b")
# A trait handed over as what an experience did: "how did the shop make you
# more responsible?" ("What made you more nervous?" asks about a day.)
_MADE_YOU = re.compile(
    r"\bma(?:de|ke|kes) you (?:(?:a|an) (?:better|harder|stronger|kinder|braver|tougher|wiser) (?:person|worker|"
    r"student|leader|friend|teammate|brother|sister|son|daughter)|more (?:responsible|mature|independent|confident|"
    r"resilient|patient|disciplined|compassionate|empathetic|humble|grateful|determined|hardworking))\b"
)


def talk_breaks(flat: str, raised: list, *, closing: bool) -> Optional[str]:
    """What a line of a brainstorm may not do, on top of breaks_rules (pass it
    as `also`, with the line's own flags bound): name the essay or hand over
    its subject ("topic"), close on anything but what the student did in the
    talk ("not_a_reflection"), or name a lesson the student did not raise
    themselves ("lesson"). `raised` is what the student has said or written
    (strings or prepare()d Sources): "What did patience look like that day?"
    is theirs to be asked once they have said "patience", and not before. A
    question is also held to breaks_rules's own kind=OPEN."""
    if _NAMES_THE_ESSAY.search(flat) or (closing and _NOT_A_REFLECTION.search(flat)):
        return "topic"
    if closing and (not _REFLECTS.search(flat) or _DRAWS_A_LESSON.search(flat)):
        return "not_a_reflection"
    if _MADE_YOU.search(flat):
        return "lesson"
    words = {m.group() for m in _VIRTUE.finditer(flat)}
    if closing:
        words |= {m.group() for m in _QUALITY.finditer(flat)}
    if words:
        said = [_as_source(text) for text in raised or []]
        if not all(any(_find(prepare(word).norm, source) for source in said) for word in words):
            return "lesson"
    return None


def _evidence(entry, items: dict, extras: dict) -> Optional[dict]:
    """One piece of evidence, with its text written here from the record: the
    model only says which item it means."""
    if not isinstance(entry, dict):
        return None
    kind, index = entry.get("kind"), entry.get("index")
    text = ""
    if kind == "activity":
        text = record_wording("activity", _at(items["activities"], index))
    elif kind == "award":
        text = record_wording("award", _at(items["awards"], index))
    elif kind == "course":
        text = _at(extras["courses"], index) or ""
    elif kind == "major":
        text = _at(extras["majors"], index) or ""
    elif kind == "theme":
        text = extras["theme"]
    elif kind == "voice":
        text = _at(extras["voice"], index) or ""
    text = _text(text, EVIDENCE_CHARS)
    return {"kind": kind, "text": text} if text else None


def validate_areas(raw, record, existing_areas, dropped: Optional[list] = None) -> list[dict]:
    """The areas a model found in a record, checked: 0 to 5 of
    {"area", "evidence": [{"kind", "text"}], "questions": [str]}.

    An area must be a neutral label of at most 8 words that is not already on
    the board (whatever the capitals). Its evidence must point at real items
    of the record, and the text of each is written here from the row, a course
    or major name, the theme or the student's own quote, so nothing in it is
    the model's wording; with none left the area is dropped. Its questions are
    cleaned to 200 characters, must end with a question mark and pass
    clean_line; with fewer than 2 left the area is dropped. `dropped` collects
    {"what", "reason"} labels, as in validate_review."""
    areas = raw.get("areas") if isinstance(raw, dict) else None
    if not isinstance(areas, list):
        return []

    def drop(what: str, reason: str) -> None:
        if dropped is not None:
            dropped.append({"what": what, "reason": reason})

    items = record_items(record)
    extras = record_extras(record)
    sources = [prepare(t) for t in (*_record_texts(items), *extras["courses"], *extras["majors"], extras["theme"],
                                    *extras["voice"]) if t]
    names = record_names(items, more=(*extras["courses"], *extras["majors"]))
    # (The areas already on their board are in front of the model too.)
    known = known_words(*record_strings(record), *(existing_areas if isinstance(existing_areas, list) else []))
    taken = {_flat(a) for a in (existing_areas if isinstance(existing_areas, list) else []) if isinstance(a, str)}
    out: list[dict] = []
    for n, entry in enumerate(areas[:MAX_RAW_AREAS], start=1):
        what = f"area {n}"
        if not isinstance(entry, dict):
            drop(what, "not_an_area")
            continue
        area = clean_area(entry.get("area"), AREA_MAX_WORDS, sources, names)
        if area is None:
            drop(what, "not_a_neutral_label")
            continue
        if _flat(area) in taken:
            drop(what, "already_on_the_board")
            continue
        evidence: list[dict] = []
        for item in entry.get("evidence") if isinstance(entry.get("evidence"), list) else []:
            found = _evidence(item, items, extras)
            if found and found not in evidence:
                evidence.append(found)
            if len(evidence) == MAX_EVIDENCE:
                break
        if not evidence:
            drop(what, "no_real_evidence")
            continue
        questions: list[str] = []
        for value in (entry.get("questions") if isinstance(entry.get("questions"), list) else [])[:8]:
            question, _ = _question(value, AREA_QUESTION_CHARS, sources, names=names, kind=OPEN, known=known)
            if question and question not in questions:
                questions.append(question)
            if len(questions) == AREA_QUESTIONS_MAX:
                break
        if len(questions) < AREA_QUESTIONS_MIN:
            drop(what, "too_few_questions")
            continue
        if len(out) == MAX_AREAS:
            drop(what, "over_the_cap")
            continue
        taken.add(_flat(area))
        out.append({"area": area, "evidence": evidence, "questions": questions})
    return out
