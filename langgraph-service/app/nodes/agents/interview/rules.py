"""
Poise's rules: what a mock interview's feedback must pass before a student
sees it, and the few numbers that decide whether a call counted.

Pure: no I/O, no clock and no model, so every rule can be checked with plain
values (tests/test_interview_rules.py). feedback.py runs validate_feedback on
what the model returned; service.py uses word_count, refundable and the
crisis screen. Nothing a model says is taken on trust: the promise Poise makes
(it points to the student's own words, never writes an answer for them, never
predicts an admission or an offer, and never comments on grammar) is kept
here, in code, never by a prompt alone.

- student_lines, word_count: what the student said, and how much.
- find_quote: a quote counts only when it is words the student said, in one
  student turn, in order. The interviewer's lines never count: a model that
  quotes the question back has not pointed at the student's answer.
- breaks_rules, clean_line: a line is dropped when it talks about admission,
  odds or an offer, hands the student words to say, or comments on grammar,
  spelling, punctuation, an accent or pronunciation. Pace and filler words are
  fair to mention; how a student speaks English is not. A dropped line is
  never repaired: it goes.
- validate_feedback: the whole code check of one reply, line by line.
- refundable: whether a call is given back, and why.
- crisis_now: Quill's screen, shared, for the hand-off.

Everything here runs on text a student said or a model wrote, so it is treated
as hostile. Every function is linear in its input: a line is capped before any
pattern sees it, every pattern is bounded, and quote matching is one pass to
split each turn into words and one substring search per quote.
"""
import re
import unicodedata
from bisect import bisect_left
from typing import Optional

from app.nodes.agents.essay.rules import crisis_now as _essay_crisis_now
from app.nodes.agents.essay.rules import quoted_spans

RUBRIC = ("examples", "structure", "why", "conversation")
MODES = ("college", "internship")

# Whether a call counted (service.py reads these from here, so the numbers a
# student is held to live in one place).
REFUND_WORDS = 40               # student words below which a mock is given back ("too_short")
SCORE_WORDS = 120               # student words below which there is no rubric ("thin")
NO_CALL_GRACE_S = 120           # seconds after start with no conversation at ElevenLabs: "no_call"

# The transcript as it is stored (elevenlabs.py caps it on the way in).
TURNS_MAX = 200
TURN_CHARS_MAX = 2000

# Field limits for what a student reads.
NOTE_MAX = 220                  # a "worked", "try" or habit line
REASON_MAX = 160                # a score's reason
QUOTE_MAX = 200                 # a quote of the student's words
QUESTION_TEXT_MAX = 200         # the interviewer's question, copied by code
QUESTIONS_MAX = 10
HABITS_MAX = 3
QUOTE_MIN_WORDS = 2

# How much of a model's reply is looked at, so an oversized one cannot make the
# checks slow. Well above what the prompt asks for.
MAX_RAW_QUESTIONS = 20
MAX_RAW_HABITS = 8
RAW_LINE_CHARS = 2000           # of a model's line, before it is cleaned
RAW_QUOTE_CHARS = 1000          # of a model's quote, before it is matched
MAX_TURNS_READ = TURNS_MAX * 2  # of a transcript handed in, whatever its source
MAX_TURN_CHARS_READ = TURN_CHARS_MAX * 2

_HANDOFF_HELP = ("This sounds like more than interview practice. Please talk to an adult you trust or your school "
                 "counselor today. If you are in crisis or thinking about hurting yourself, call or text 988, the "
                 "Suicide and Crisis Lifeline, any time.")
HANDOFF = _HANDOFF_HELP + " Your practice can wait. Nothing from this call was saved."


# Spoken words the speech-to-text keeps and a typed essay never has. They sit
# inside a sentence ("I want to, um, kill myself") and would break Quill's
# phrases apart, so a line is also read with them taken out.
_FILLERS = re.compile(r"\s*,?\s*\b(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m+h*m+|like|you know|i mean)\b\s*,?\s*",
                      re.IGNORECASE)
_SPOKEN_FORMS = [(re.compile(p), r) for p, r in (
    (r"\bi'm\b|\bim\b", "i am"), (r"\bi've\b", "i have"), (r"\bgonna\b", "going to"), (r"\bwanna\b", "want to"),
)]
_OFTEN = r"(?:(?:really|just|still|honestly|sometimes|often|always|kind of|sort of|so|a lot|constantly) ){0,2}"
# What a student in danger says out loud that Quill's list, written for typed
# essays, does not have. Present tense only: "I felt like killing myself back
# then" is a story. "Think about suicide" counts only where the clause stops or
# says how often ("a lot", "every day"); "I think about suicide prevention" and
# "rates" go on, and are an ordinary answer.
_SPOKEN_CRISIS = re.compile(
    rf"\bi {_OFTEN}(?:feel|am feeling|have been feeling|keep feeling) {_OFTEN}like "
    r"(?:i (?:want to|should|could|might|am going to) )?(?:kill(?:ing)? myself|end(?:ing)? (?:my (?:own )?life|it all)"
    r"|hurt(?:ing)? myself|commit(?:ting)? suicide)\b"
    rf"|\bi {_OFTEN}(?:think|am thinking|keep thinking|have been thinking) {_OFTEN}(?:about|of) suicide\b"
    r"(?= ?(?:[.,;!?]|$)| (?:a lot|all the time|every day|every night|sometimes|often|again|lately|constantly|"
    r"too much|more and more|now|right now)\b)"
    r"|\b(?:going to|want to|need to|have to|might|will|should|about to|ready to|to) (?:just )?off myself\b"
)


def _spoken(text: str) -> str:
    line = " ".join(text[:MAX_TURN_CHARS_READ].translate(_SAME_LENGTH).lower().split())
    for pattern, plain in _SPOKEN_FORMS:
        line = pattern.sub(plain, line)
    return line


def crisis_now(text) -> bool:
    """Quill's screen (essay.rules.crisis_now), shared, made for speech: True
    when the words say, in the first person and the present or future tense,
    that the student intends to hurt or kill themselves. The line is read as
    said and again with its filler words taken out ("I want to, um, kill
    myself"), and _SPOKEN_CRISIS adds what is said out loud and not typed
    ("I feel like killing myself", "I'm gonna off myself"). A hard thing that
    already happened, told as a story, is an ordinary answer."""
    if not isinstance(text, str) or not text:
        return False
    if _essay_crisis_now(text):
        return True
    bare = " ".join(_FILLERS.sub(" ", " ".join(text[:MAX_TURN_CHARS_READ].split())).split())
    if bare != text and _essay_crisis_now(bare):
        return True
    return any(_SPOKEN_CRISIS.search(_spoken(reading)) for reading in (text, bare))


# ── The transcript ───────────────────────────────────────────────────────────

def _turns(transcript) -> list[tuple[str, str]]:
    """(who, text) for each entry, index for index. An entry of the wrong
    shape keeps its place as ("", "") so indices still line up with the
    stored transcript."""
    if not isinstance(transcript, list):
        return []
    out = []
    for entry in transcript[:MAX_TURNS_READ]:
        if isinstance(entry, dict):
            who = entry.get("who")
            text = entry.get("text")
            out.append((who if isinstance(who, str) else "",
                        text[:MAX_TURN_CHARS_READ] if isinstance(text, str) else ""))
        else:
            out.append(("", ""))
    return out


def student_lines(transcript) -> list[tuple[int, str]]:
    """(index, text) of every turn the student spoke, in order."""
    return [(i, text) for i, (who, text) in enumerate(_turns(transcript)) if who == "student" and text.strip()]


def word_count(transcript) -> int:
    """Words the student said: len(text.split()) summed over student turns."""
    return sum(len(text.split()) for _, text in student_lines(transcript))


# ── Text ─────────────────────────────────────────────────────────────────────

# Curly quotes and apostrophes become straight ones, and every dash a space,
# one character for one so offsets into the original text still hold.
_SINGLE = "\u2018\u2019\u201a\u201b\u2032\u2035\u02bc\u00b4`"
_DOUBLE = "\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033"
_DASHES = "\u2010\u2011\u2012\u2013\u2014\u2015\u2212-"
_SAME_LENGTH = str.maketrans({**{c: "'" for c in _SINGLE}, **{c: '"' for c in _DOUBLE},
                              **{c: " " for c in _DASHES}})
# A word: letters and digits, with an apostrophe or a dot inside it (don't,
# 3.8, u.s). Punctuation and symbols around words are not part of them, so a
# comma the speech-to-text put in, or left out, never decides a match. No two
# ways to match the same text, so it runs in linear time.
_WORD = re.compile(r"[^\W_]+(?:['.][^\W_]+)*")


def _invisible(ch: str) -> bool:
    return unicodedata.category(ch) == "Cf"


def _words(text: str) -> list[re.Match]:
    """The words of `text`, as matches whose offsets are into `text` itself."""
    flat = text.translate(_SAME_LENGTH)
    if not flat.isascii():
        flat = "".join(" " if _invisible(c) else c for c in flat)
    return list(_WORD.finditer(flat))


class _Turn:
    """One transcript turn made ready for matching: `joined` is its words,
    lowercased and one space apart, `at[i]` is where word i starts in
    `joined`, and `spans[i]` is where it sits in the original text."""
    __slots__ = ("index", "text", "joined", "at", "spans")

    def __init__(self, index: int, text: str):
        self.index = index
        self.text = text
        found = _words(text)
        words = [m.group().casefold() for m in found]
        self.spans = [(m.start(), m.end()) for m in found]
        self.at = []
        pos = 0
        for w in words:
            self.at.append(pos)
            pos += len(w) + 1
        self.joined = " ".join(words)


class Prepared:
    """A transcript made ready for find_quote: every turn split into words
    once, so a reply with twenty quotes costs twenty substring searches and no
    more preparing. `student` holds the student's turns, `everyone` all of
    them (for words a line puts in quotation marks)."""
    __slots__ = ("turns", "who", "student", "everyone")

    def __init__(self, transcript):
        turns = _turns(transcript)
        self.turns = turns
        self.who = [who for who, _ in turns]
        self.everyone = [_Turn(i, text) for i, (_, text) in enumerate(turns) if text.strip()]
        self.student = [t for t in self.everyone if self.who[t.index] == "student"]


def _as_prepared(transcript) -> Prepared:
    return transcript if isinstance(transcript, Prepared) else Prepared(transcript)


def _quote_words(quote) -> list[str]:
    if not isinstance(quote, str):
        return []
    return [m.group().casefold() for m in _words(quote[:RAW_QUOTE_CHARS])]


def _match(words: list[str], turn: _Turn) -> Optional[tuple[int, int]]:
    """(first word, word count) of `words` in `turn`, whole words only."""
    if not words or not turn.joined:
        return None
    needle = " ".join(words)
    pos = (" " + turn.joined + " ").find(" " + needle + " ")
    if pos < 0:
        return None
    first = bisect_left(turn.at, pos)
    if first >= len(turn.at) or turn.at[first] != pos:
        return None
    return first, len(words)


def _excerpt(turn: _Turn, first: int, count: int) -> Optional[str]:
    """The student's own words for a match, from their original text, cut at
    a word boundary to QUOTE_MAX. None when not even its first word fits."""
    start = turn.spans[first][0]
    last = first + count - 1
    while last >= first and turn.spans[last][1] - start > QUOTE_MAX:
        last -= 1
    if last < first:
        return None
    return " ".join(turn.text[start:turn.spans[last][1]].split())


def _locate(quote, prepared: Prepared, prefer: Optional[range] = None) -> Optional[tuple[int, str]]:
    """(the student turn holding `quote`, the student's own words for it), or
    None. The turns in `prefer` (the answer to the question a note is about)
    are searched first, then every other student turn."""
    words = _quote_words(quote)
    if len(words) < QUOTE_MIN_WORDS:
        return None
    turns = prepared.student
    if prefer is not None:
        turns = [t for t in turns if t.index in prefer] + [t for t in turns if t.index not in prefer]
    for turn in turns:
        hit = _match(words, turn)
        if hit:
            excerpt = _excerpt(turn, *hit)
            return (turn.index, excerpt) if excerpt else None
    return None


def find_quote(quote, transcript) -> Optional[int]:
    """The index of the student turn that holds `quote`, or None.

    Matching ignores case, runs of whitespace, punctuation around words and
    the difference between curly and straight quotes, and is whole words only.
    Only student turns are searched: the interviewer's words are never a
    quote of the student. A quote under 2 words never matches (one word is in
    every answer). `transcript` may be a list or a Prepared."""
    hit = _locate(quote, _as_prepared(transcript))
    return hit[0] if hit else None


def _said_by_anyone(span: str, prepared: Prepared) -> bool:
    """Words a line puts in quotation marks must be words someone in the call
    said: one word anywhere in the transcript, or a run of words in one turn."""
    words = _quote_words(span)
    if not words:
        return True                                 # marks around nothing that is a word
    if len(words) == 1:
        word = " " + words[0] + " "
        return any(word in " " + t.joined + " " for t in prepared.everyone)
    return any(_match(words, t) for t in prepared.everyone)


# ── What a line may not say ──────────────────────────────────────────────────
# The promise made concrete. A line is read in plain form (_plain): lowercase,
# straight quotes, every dash a hyphen, accents and invisible characters gone,
# the common contractions spelled out. Then three lists:
#
# - odds: admission, acceptance, an offer, being hired, chances, odds,
#   guarantees, "you will be", and what colleges or employers want.
# - script: words handed to the student ("you could say", "try saying", "a
#   better answer", "here's how you might", "next time, say", "word it
#   differently"), and any first person outside a quotation: a note is
#   written to "you", so "I", "my" or "we" in it is an answer for them.
# - mechanics: grammar, spelling, punctuation, an accent, pronunciation.
#
# Words in quotation marks are the student's (or the interviewer's) and are
# checked against the transcript by validate_feedback, then masked, so a
# student who said "I hope to get in" can be quoted without the line going.
# clean_line on its own masks nothing, which only makes it stricter.
#
# The lists are phrasings, and no list of phrasings is complete: an answer
# worded on purpose to avoid them can still get through. The schema (no field
# for a sample answer), the length limits and the prompt carry the rest.

_CONTRACTIONS = [(re.compile(p), r) for p, r in (
    (r"\byou'll\b", "you will"), (r"\byou'd\b", "you would"), (r"\byou're\b", "you are"),
    (r"\bhere's\b", "here is"), (r"\bthat's\b", "that is"), (r"\bwon't\b", "will not"),
    (r"\b(should|could|would|might|must)'ve\b", r"\1 have"), (r"\bthey'll\b", "they will"),
    (r"\bit'll\b", "it will"),
)]

_ODDS = [re.compile(p) for p in (
    r"\badmi(?:t|ts|tting|ssion|ssions)\b",
    # "admitted" on its own, but not "you admitted you were nervous".
    r"(?<!you )\badmitted\b",
    r"\b(?:be|been|being|get|gets|getting|help|helps|helping) (?:you |them )?"
    r"(?:admitted|accepted|hired|selected|chosen|picked)\b",
    r"\baccepted (?:to|into|at|by)\b",
    r"\bacceptance (?:letters?|rates?)\b",
    r"\bget(?:s|ting)? in\b(?! (?:the|a|an|your|my|their|touch|line|front|on|trouble|shape|there)\b)",
    r"\b(?:your|their|the|good|strong|better|best|real|high|low) chances?\b",
    r"\bodds\b",
    r"\blikel(?:y|ier) to\b",
    r"\b(?:an?|the|job|internship|receive|receiving|received|get|gets|getting|extend|extends|extended|"
    r"make|makes|making|earn|earning|land|landing) offers?\b",
    r"\boffers? (?:letter|of (?:admission|a place|a spot|a position|the (?:job|role|position|internship)))\b",
    r"\boffer you\b",
    r"\bhire(?:s|d)? you\b",
    r"\bguarantee",
    r"\byou will (?:definitely |probably |surely |likely |certainly |easily )?be\b",
    r"\b(?:shoo-?in|sure thing|in the running|top (?:candidate|applicant)s?)\b",
    r"\b(?:strong|competitive|weak|ideal|perfect) (?:candidate|applicant)s?\b",
    r"\bwill (?:\w+ ){0,2}(?:impress|win over|wow)\b",
    r"\b(?:colleges?|schools?|universities|admissions|admissions officers?|interviewers?|employers?|recruiters?|"
    r"companies|hiring managers?|hiring teams?|committees?|panels?) (?:want|wants|look for|looks for|"
    r"are looking for|is looking for|love|loves|like to see|likes to see|value|values|prefer|prefers)\b",
    # Plural only: "you asked what the interviewer cares about" is a question back.
    r"\b(?:colleges|schools|universities|admissions|admissions officers|interviewers|employers|recruiters|companies|"
    r"hiring managers|hiring teams|committees|panels) (?:care about|reward|appreciate|are after)\b",
    # The employer's side of an outcome: the role, the spot, the next round.
    r"\b(?:land|lands|secure|secures|win|wins|earn|earns|landing|securing|winning|earning) (?:you |yourself )?"
    r"(?:the |a |an |this |that )?(?:role|job|internship|spot|place|position|seat|callback)\b",
    r"\b(?:will|would|should|could) (?:\w+ )?get (?:you )?(?:the |a |an |this |that )?"
    r"(?:role|job|internship|spot|place|position|seat|callback)\b(?! done\b)",
    r"\bcall-?backs?\b",
    r"\b(?:to|into|through) the (?:next|final|later|last) (?:round|stage)s?\b",
    r"\b(?:pass|passes|passing|clear|clears|clearing) (?:the |a |an |this |that |any |your )?(?:real |actual )?"
    r"(?:interview|screen|screening|round)\b",
    r"\blucky to have you\b",
    r"\b(?:will|would) (?:\w+ ){0,2}(?:impressed|be won over)\b|\bbe impressed\b",
    r"\blikelihood\b",
    r"\bchances? (?:are|is)\b",
    r"\b(?:certain|sure|bound|likely|set|expected) to (?:move forward|advance|progress)\b",
    r"\b(?:move|moves|moving) forward in the (?:\w+ )?process\b",
    r"\b(?:would|will) (?:\w+ )?recommend you\b|\brecommend you (?:for|to)\b|\badvocate for you\b",
    r"\b(?:rank|rate|score) you (?:highly|well|high|at the top)\b",
    r"\bshoe-? ?in\b",
)]

# "say" or "answer" followed by one of these describes what to talk about,
# not the words to use ("you could say more about the lab", "say why").
_ABOUT = r"(?! (?:more|less|why|what|how|which|who|whom|where|when|whether|a bit more|a little more)\b)"
_SCRIPT = [re.compile(p) for p in (
    rf"\byou (?:could|can|might|may|should|would|ought to) (?:also |just |simply )?(?:say|answer|reply|respond)"
    rf"{_ABOUT}\b",
    rf"\bwhat if you (?:said|say|answered|replied|told them){_ABOUT}\b",
    r"\btry (?:saying|answering with|replying with|responding with|something like|phrasing|wording|this)\b",
    r"\b(?:say|saying|answer|answering|reply|replying) something (?:like|along)\b",
    r"\balong the lines of\b",
    r"\b(?:a|an) (?:better|stronger|good|great|ideal|perfect|model|sample|winning|polished) "
    r"(?:answer|response|reply)\b",
    r"\b(?:an|the|a) (?:answer|response|reply) like\b",
    r"\bhere is how you (?:might|could|would|can|should)\b",
    r"\bhere is (?:a|an|one) (?:way|example|version|answer|response|script)\b",
    r"\b(?:sample|model|example) (?:answers?|responses?|replies)\b",
    r"\b(?:should|could|might|would) have (?:said|answered|replied|responded)\b",
    rf"\b(?:next time|instead),? (?:just |simply )?(?:say|answer|tell (?:them|the interviewer)){_ABOUT}\b",
    r"\b(?:rephras(?:e|es|ed|ing)|reword(?:s|ed|ing)?|rewr(?:ite|ites|iting|ote|itten))\b",
    r"\bword for word\b",
    # Wording handed over ("word it differently", "phrase it like", "use
    # wording such as", "replace it with:"), never advice on what to cover.
    r"(?:^|[.!?;:,] |\b(?:to|could|can|might|should|would|maybe|perhaps|just|then|and|try) )(?:phrase|word) "
    r"(?:it|that|this|them)\b",
    r"\b(?:frame|put|say|state) (?:it|that|this) (?:like\b|this way\b|that way\b|differently\b|in these words\b)",
    r"\b(?:use|using|with|try) (?:wording|phrasing|words|language) (?:like|such as)\b",
    r"\b(?:line|sentence|phrase|wording|phrasing) (?:like|such as)\b",
    r"\b(?:replace|swap) (?:it|that|this) (?:with|for) ?:",
    r"\bgo with something\b",
)]

# A note is written to "you". "I", "my" or "we" outside a quotation (the
# student's proven words are masked before this is read) is an answer written
# for them: "Opening line: I am Sam, a junior who rebuilds robots." "Us" is
# left out, since it is also the country.
_FIRST_PERSON = re.compile(r"(?<![\w'-])(?:i(?:'m|'d|'ll|'ve)?|me|my|myself|mine|we(?:'re|'ve|'ll|'d)?|our|ours|"
                           r"ourselves)(?![\w'-])", re.IGNORECASE)
# "Algebra I", "Physics I": a capital I after a capitalised word, where the
# sentence stops or goes on the way it does after a numeral (Quill's rule).
_NUMERAL_GOES_ON = re.compile(r"(?:$|[.,;:!?)]| (?:and|or|in|at|as|with|for|to|class|classes|course|honors|"
                              r"through|level)\b)")


def _first_person(flat: str) -> bool:
    """`flat` is a line as _flatten leaves it (case kept)."""
    for m in _FIRST_PERSON.finditer(flat):
        word = m.group()
        low = word.lower()
        if low == "i" and flat.startswith(".e", m.end()):
            continue                                        # "i.e."
        if low == "me" and flat[:m.start()].lower().endswith("tell "):
            continue                                        # "the tell me about yourself question"
        if low == "mine" and flat[:m.start()].lower().endswith(("a ", "the ", "gold ", "coal ")):
            continue
        if word == "I" and m.start() and flat[m.start() - 1] == " ":
            before = flat[:m.start() - 1].rsplit(" ", 1)[-1]
            if before[:1].isupper() and _NUMERAL_GOES_ON.match(flat, m.end()):
                continue
        return True
    return False

_MECHANICS = [re.compile(p) for p in (
    r"\b(?:un)?grammatical(?:ly)?\b|\bgrammar\b",
    r"\bspell(?:ing|ed)\b|\bmisspel",
    r"\bpunctuat",
    r"\baccents?\b",
    r"\b(?:mis)?pronounc",
    r"\bproper english\b|\bbroken english\b",
    r"\bverb tenses?\b|\bsubject-verb\b|\brun-on\b|\bsentence fragments?\b",
)]

_MASK = "qzq"


def _flatten(text: str) -> str:
    """A line with straight quotes, every dash a hyphen, accents and
    invisible characters gone and single spaces, its case kept."""
    out = []
    for ch in unicodedata.normalize("NFKD", text[:RAW_LINE_CHARS]):
        if ch.isascii():
            out.append(ch)
        elif ch in _SINGLE:
            out.append("'")
        elif ch in _DOUBLE:
            out.append('"')
        elif ch in _DASHES:
            out.append("-")
        elif _invisible(ch) or unicodedata.category(ch) in ("Mn", "Me"):
            continue
        else:
            out.append(ch)
    return " ".join("".join(out).split())


def _plain(flat: str) -> str:
    """A _flatten-ed line as the phrase lists read it: lowercase, the common
    contractions spelled out. Nothing shown is made from this."""
    line = flat.lower()
    for pattern, plain in _CONTRACTIONS:
        line = pattern.sub(plain, line)
    return line


def _rule_broken(text: str) -> Optional[str]:
    """Which list a line trips: "odds", "script" (first person included),
    "mechanics", or None."""
    flat = _flatten(text)
    plain = _plain(flat)
    for label, patterns in (("odds", _ODDS), ("script", _SCRIPT), ("mechanics", _MECHANICS)):
        if any(p.search(plain) for p in patterns):
            return label
    if _first_person(flat):
        return "script"
    return None


def breaks_rules(text) -> bool:
    """True when a line talks about admission, odds or an offer, hands the
    student words to say, or comments on grammar, spelling, punctuation, an
    accent or pronunciation. Words in quotation marks are read like the rest
    here; validate_feedback proves them against the transcript first and only
    then reads past them."""
    if not isinstance(text, str):
        return False
    return _rule_broken(text) is not None


# ── Cleaning a line ──────────────────────────────────────────────────────────

_EM_DASH = re.compile(r"\s*\u2014\s*|\s+(?:[\u2013\u2015]|--+)\s+")
_META_DOT = re.compile(r"\s*[\u00b7\u2022\u2027\u22c5]\s*")
_LOOSE_COMMAS = re.compile(r"\s+,|,(?:\s*,)+")
_SENTENCE_END = re.compile(r"[.!?][\"')]?(?= |$)")
# Quotation marks straightened, one character for one (dashes kept).
_SAME_LENGTH_QUOTES = str.maketrans({**{c: "'" for c in _SINGLE}, **{c: '"' for c in _DOUBLE}})


def _tidy(text: str) -> str:
    """A model's line as a student may read it: one line, no em dash (a comma
    in its place, as the house style asks), no middle-dot separators, no
    invisible characters, single spaces."""
    line = " ".join(text[:RAW_LINE_CHARS].split())
    if not line.isascii():
        line = "".join(c for c in line if not _invisible(c))
        line = _EM_DASH.sub(", ", line)
        line = _META_DOT.sub(", ", line)
        line = line.replace("\u2013", "-").replace("\u2015", "-")
    line = re.sub(r"\s+--+\s+", ", ", line)
    line = _LOOSE_COMMAS.sub(",", line)
    return " ".join(line.split()).strip(" ,;:")


def _fit(line: str, limit: int) -> str:
    """`line` kept to `limit` characters: the whole sentences that fit, or,
    with none, cut at a word boundary with an ellipsis."""
    if len(line) <= limit:
        return line
    end = 0
    for m in _SENTENCE_END.finditer(line[:limit + 1]):
        if m.end() <= limit:
            end = m.end()
    if end:
        return line[:end].strip()
    cut = line[:max(0, limit - 3)]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    cut = cut.rstrip(" ,;:-")
    return cut + "..." if cut else ""


def _mask_quotes(text: str, prepared: Optional[Prepared]) -> tuple[Optional[str], Optional[str]]:
    """(the line with its quoted words masked, None) once every quoted span is
    proven to be words said in the call, or (None, "new_text") when one is
    not. With no transcript nothing is masked."""
    if prepared is None:
        return text, None
    spans = quoted_spans(text[:RAW_LINE_CHARS])
    if not spans:
        return text, None
    straight = text[:RAW_LINE_CHARS].translate(_SAME_LENGTH_QUOTES)
    for span in spans:
        if not _said_by_anyone(span, prepared):
            return None, "new_text"
        straight = straight.replace(span, _MASK)
    return straight, None



def _clean(text, limit: int, prepared: Optional[Prepared] = None) -> tuple[Optional[str], Optional[str]]:
    """(the line as it may be shown, None) or (None, why it was dropped)."""
    if not isinstance(text, str):
        return None, "missing"
    line = _tidy(text)
    if not line:
        return None, "missing"
    masked, reason = _mask_quotes(line, prepared)
    if masked is None:
        return None, reason
    broken = _rule_broken(masked)
    if broken:
        return None, broken
    shown = _fit(line, limit)
    return (shown, None) if shown else (None, "missing")


def clean_line(text, limit: int) -> Optional[str]:
    """A model-written line made safe to show, or None when it must be
    dropped: em and en dashes become commas, invisible characters go, it is
    trimmed and kept to `limit` characters (whole sentences, else cut at a
    word boundary), and it is None when it breaks_rules or is empty. A line
    that breaks a rule is never repaired: it goes."""
    return _clean(text, limit)[0]


# ── A reply, checked ─────────────────────────────────────────────────────────

def _int(value) -> Optional[int]:
    """An integer that is really one: not a bool, not a string, not 3.5."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _answer_range(prepared: Prepared, turn: int) -> range:
    """The turns after interviewer turn `turn` up to the next interviewer
    turn: the student's answer to that question."""
    end = turn + 1
    while end < len(prepared.who) and prepared.who[end] != "interviewer":
        end += 1
    return range(turn + 1, end)


def _clip_words(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit - 3]
    if " " in cut:
        cut = cut[:cut.rfind(" ")]
    return cut.rstrip(" ,;:-") + "..."


def _half(entry: dict, key: str, prepared: Prepared, prefer: range, what: str,
          dropped: list) -> Optional[dict]:
    """One half of a question entry ("worked" or "try"): {"text", "quote",
    "turn"} when its line is clean and its quote is the student's, else None.
    Both fields empty is the model saying "nothing here", which is no
    mistake."""
    text, quote = entry.get(f"{key}_text"), entry.get(f"{key}_quote")
    text = text if isinstance(text, str) else ""
    quote = quote if isinstance(quote, str) else ""
    if not text.strip() and not quote.strip():
        return None
    line, reason = _clean(text, NOTE_MAX, prepared)
    if line is None:
        dropped.append({"what": f"{what} {key}", "reason": reason})
        return None
    if not quote.strip():
        dropped.append({"what": f"{what} {key}", "reason": "no_quote"})
        return None
    if len(_quote_words(quote)) < QUOTE_MIN_WORDS:
        dropped.append({"what": f"{what} {key}", "reason": "quote_short"})
        return None
    hit = _locate(quote, prepared, prefer)
    if hit is None:
        dropped.append({"what": f"{what} {key}", "reason": "quote_not_found"})
        return None
    return {"text": line, "quote": hit[1], "turn": hit[0]}


def _questions(raw_questions, prepared: Prepared, dropped: list) -> list[dict]:
    entries = raw_questions if isinstance(raw_questions, list) else []
    out: list[dict] = []
    seen: set[int] = set()
    for n, entry in enumerate(entries[:MAX_RAW_QUESTIONS], start=1):
        what = f"question {n}"
        if not isinstance(entry, dict):
            dropped.append({"what": what, "reason": "not_an_entry"})
            continue
        turn = _int(entry.get("turn"))
        if turn is None or not 0 <= turn < len(prepared.who):
            dropped.append({"what": what, "reason": "bad_turn"})
            continue
        if prepared.who[turn] != "interviewer":
            dropped.append({"what": what, "reason": "not_interviewer"})
            continue
        if turn in seen:
            dropped.append({"what": what, "reason": "repeat_turn"})
            continue
        prefer = _answer_range(prepared, turn)
        worked = _half(entry, "worked", prepared, prefer, what, dropped)
        tried = _half(entry, "try", prepared, prefer, what, dropped)
        if worked is None and tried is None:
            dropped.append({"what": what, "reason": "nothing_left"})
            continue
        seen.add(turn)
        out.append({"turn": turn, "question": _clip_words(prepared.turns[turn][1], QUESTION_TEXT_MAX),
                    "worked": worked, "try": tried})
    out.sort(key=lambda q: q["turn"])
    if len(out) > QUESTIONS_MAX:
        dropped.extend({"what": f"question at turn {q['turn']}", "reason": "over_the_cap"}
                       for q in out[QUESTIONS_MAX:])
    return out[:QUESTIONS_MAX]


def _habits(raw_habits, prepared: Prepared, dropped: list) -> list[dict]:
    entries = raw_habits if isinstance(raw_habits, list) else []
    out: list[dict] = []
    seen: set[str] = set()
    for n, entry in enumerate(entries[:MAX_RAW_HABITS], start=1):
        what = f"habit {n}"
        if not isinstance(entry, dict):
            dropped.append({"what": what, "reason": "not_an_entry"})
            continue
        line, reason = _clean(entry.get("text"), NOTE_MAX, prepared)
        if line is None:
            dropped.append({"what": what, "reason": reason})
            continue
        if line.lower() in seen:
            dropped.append({"what": what, "reason": "repeat"})
            continue
        quote = entry.get("quote")
        hit = None
        if isinstance(quote, str) and quote.strip():
            hit = _locate(quote, prepared)
            if hit is None:
                # The habit stands without it: only the quote goes.
                dropped.append({"what": f"{what} quote", "reason": "quote_not_found"})
        if len(out) >= HABITS_MAX:
            dropped.append({"what": what, "reason": "over_the_cap"})
            continue
        seen.add(line.lower())
        out.append({"text": line, "quote": hit[1] if hit else None, "turn": hit[0] if hit else None})
    return out


def _scores(raw_scores, prepared: Prepared, dropped: list) -> Optional[dict]:
    """All four rubric scores, or None. A score must be a whole number from 1
    to 5 with a clean reason; one that fails takes the rubric with it, since a
    grid with a hole in it reads as a zero."""
    if not isinstance(raw_scores, dict):
        dropped.append({"what": "scores", "reason": "missing"})
        return None
    out = {}
    for key in RUBRIC:
        entry = raw_scores.get(key)
        if not isinstance(entry, dict):
            dropped.append({"what": f"score {key}", "reason": "missing"})
            return None
        score = _int(entry.get("score"))
        if score is None or not 1 <= score <= 5:
            dropped.append({"what": f"score {key}", "reason": "score_range"})
            return None
        reason_line, why = _clean(entry.get("reason"), REASON_MAX, prepared)
        if reason_line is None:
            dropped.append({"what": f"score {key}", "reason": f"reason_{why}"})
            return None
        out[key] = {"score": score, "reason": reason_line}
    return out


def validate_feedback(raw, transcript, *, thin: bool,
                      dropped: Optional[list] = None) -> Optional[tuple[dict, Optional[dict]]]:
    """(feedback, scores) in the shapes interview_mocks stores, or None when
    the reply is unusable: not a dict, or nothing left of it.

    - A question entry needs `turn` to be an interviewer turn (once each).
      Its "worked" and "try" halves each need a clean line and a quote found
      in a student turn (the answer to that question first); a half that
      fails is null, and an entry with both halves null is dropped.
    - A habit needs a clean line. Its quote is optional; one that is given and
      not found is dropped, and the habit stays.
    - Scores only when not `thin`, and only all four.
    - Words a line puts in quotation marks must have been said in the call.
    Capped at QUESTIONS_MAX and HABITS_MAX. Never raises: `dropped`, when a
    list is passed, collects {"what", "reason"} for everything thrown away
    (labels only, never a line or a quote)."""
    dropped = dropped if isinstance(dropped, list) else []
    if not isinstance(raw, dict):
        dropped.append({"what": "reply", "reason": "not_a_dict"})
        return None
    prepared = _as_prepared(transcript)
    questions = _questions(raw.get("questions"), prepared, dropped)
    habits = _habits(raw.get("habits"), prepared, dropped)
    if not questions and not habits:
        dropped.append({"what": "reply", "reason": "nothing_left"})
        return None
    thin = bool(thin)
    scores = None if thin else _scores(raw.get("scores"), prepared, dropped)
    return {"questions": questions, "habits": habits, "thin": thin}, scores


# ── Whether a call counted ───────────────────────────────────────────────────

def _number(value) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return 0.0
    return float(value)


def refundable(remote_found: bool, seconds_since_start, student_words) -> Optional[str]:
    """Why a mock is given back, or None when it counts.

    "no_call": ElevenLabs has no conversation for it and NO_CALL_GRACE_S have
    passed since it started (sooner, it may still be connecting).
    "too_short": there is a conversation and the student said fewer than
    REFUND_WORDS words in it: it never really happened."""
    if not remote_found:
        return "no_call" if _number(seconds_since_start) >= NO_CALL_GRACE_S else None
    return "too_short" if _number(student_words) < REFUND_WORDS else None
