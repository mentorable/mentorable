"""
Talon's rules: what a found listing must pass before a student sees it.

Pure: no I/O and no clock (today is always passed in), so every rule can be
checked with plain values. research.py runs them on what the models returned;
nothing a model says is taken on trust, and every drop a student would care
about is made here, in code, with a reason they can read (never by a prompt
alone).

- canonical_url: one spelling per page, so a listing is never on a board twice.
- parse_deadline, old_cycle: dates as the page writes them. A deadline with no
  year is unknown ("check the site"), never a guess.
- scam_reasons: an application fee, guaranteed money, or a page that asks for a
  Social Security number or bank details up front. A sentence that denies it
  ("no application fee", "we will never ask for your bank account") does not
  count.
- grounded: a fact the model reported must be on the page it came from.
- no_odds: a "why it fits you" line never talks about chances of winning.
- check_listing: the whole per-listing check, in order; rank: the order shown.
"""
import re
import unicodedata
from datetime import date, timedelta
from typing import Optional
from urllib.parse import quote, unquote, urlsplit, urlunsplit

from app.nodes.agents.outreach import pages
from app.nodes.quest.common import clean_text

LANES = ("scholarship", "activity")
KINDS = ("scholarship", "summer_program", "competition", "research", "internship", "volunteering", "other")
CITIZENSHIP = ("citizen", "permanent_resident", "other", "unsure")
BUDGETS = ("free", "under_500", "any")
TRAVEL = ("local", "online", "anywhere")
WHEN = ("summer", "school_year", "any")
EFFORT = ("quick", "any")

# Opt-in eligibility chips: per search only, never stored, never logged.
CHIPS = {
    "first_gen": "first-generation college student",
    "low_income": "student from a lower-income family",
    "military_family": "military family",
    "disability": "student with a disability",
    "lgbtq": "LGBTQ+ student",
    "hispanic_latino": "Hispanic or Latino student",
    "black": "Black or African American student",
    "asian_pacific": "Asian American or Pacific Islander student",
    "native": "Native American or Alaska Native student",
    "mena": "Middle Eastern or North African student",
    "faith": "open to faith-based scholarships",
}

# A listing limited to a group the student did not tick is kept, with one of
# these lines, because only the student knows whether it applies to them.
CHIP_CONFIRM = {
    "first_gen": "Open to first-generation college students. You'd need to confirm this.",
    "low_income": "Open to students with financial need. You'd need to confirm this.",
    "military_family": "Open to students from military families. You'd need to confirm this.",
    "disability": "Open to students with a disability. You'd need to confirm this.",
    "lgbtq": "Open to LGBTQ+ students. You'd need to confirm this.",
    "hispanic_latino": "Open to Hispanic or Latino students. You'd need to confirm this.",
    "black": "Open to Black or African American students. You'd need to confirm this.",
    "asian_pacific": "Open to Asian American or Pacific Islander students. You'd need to confirm this.",
    "native": "Open to Native American or Alaska Native students. You'd need to confirm this.",
    "mena": "Open to Middle Eastern or North African students. You'd need to confirm this.",
    "faith": "Run by a faith group, and may ask about your faith. You'd need to confirm this.",
}

# What the page says about citizenship (the extract schema's values).
CITIZENSHIP_NEEDS = ("us_citizen", "citizen_or_pr", "none", "unknown")
CITIZENSHIP_CONFIRM = {
    "us_citizen": "Open to US citizens. You'd need to confirm this.",
    "citizen_or_pr": "Open to US citizens and permanent residents. You'd need to confirm this.",
}

# Sites that list other people's opportunities. A listing found only on one of
# these is shown as unconfirmed ("check the provider"): their copy of a
# deadline or an amount is often a cycle old, and some exist to collect
# students' details. Not exhaustive; a list page elsewhere (a blog, a news
# story) is caught by the model's own_page flag instead. Matched on the host
# and on site_of, so a subdomain counts (bigfuture.collegeboard.org is listed
# by host, so the rest of collegeboard.org is not).
AGGREGATOR_SITES = frozenset({
    "fastweb.com", "scholarships.com", "bold.org", "niche.com", "bigfuture.collegeboard.org",
    "scholarshipowl.com", "unigo.com", "cappex.com", "goingmerry.com", "petersons.com", "collegexpress.com",
    "careeronestop.org", "scholarships360.org", "collegescholarships.org", "studentscholarships.org",
    "teenlife.com", "idealist.org", "volunteermatch.org", "collegevine.com", "prepscholar.com",
    "collegeraptor.com", "usnews.com", "princetonreview.com", "scholarshipportal.com", "myscholly.com",
    "raise.me", "accessscholarships.com", "studentscholarshipsearch.com", "pathwaystoscience.org",
    "allforgood.org", "justserve.org", "volunteer.gov", "indeed.com", "glassdoor.com", "ziprecruiter.com",
    "internships.com", "simplyhired.com", "joinhandshake.com",
})

DROP_MESSAGES = {
    "fee": "Asks for an application fee. Real scholarships don't charge you to apply.",
    "guaranteed": "Promises guaranteed money, a common scam sign.",
    "asks_ssn_bank": "Asks for a Social Security number or bank details, which a real application doesn't need up front.",
    "past_deadline": "Its deadline has passed.",
    "old_cycle": "The page only lists an older year, so it may not run anymore.",
    "not_your_grade": "Open to a different grade than yours.",
    "citizenship": "Needs a citizenship status you didn't select.",
    "other_state": "Only for students in another state.",
    "over_budget": "Costs more than the budget you set, with no aid listed.",
    "unreadable": "Talon couldn't read enough on its page to check it.",
}

# Column limits (the finder_items CHECKs), and the caps on page-derived lines.
TITLE_CHARS = 200
PROVIDER_CHARS = 160
SUMMARY_CHARS = 400
FACT_CHARS = 120
LINE_CHARS = 140
URL_CHARS = 2000
DROP_TITLE_CHARS = 120
MAX_ELIGIBILITY = 6
MAX_REQUIREMENTS = 8
USD_MAX = 5_000_000
SOON_DAYS = 21                 # rank: a deadline this close comes first
RANK_LIMIT = 8                 # rank: listings kept from one find

# The fuzzy grounding rule for long lines: 9 or more words, 70% of the
# content words on the page.
GROUND_LONG_WORDS = 9
GROUND_SHARE = 0.7


# ── Text ─────────────────────────────────────────────────────────────────────

_QUOTES = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'", "\u2032": "'", "`": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"', "\u00ab": '"', "\u00bb": '"',
})
# Hyphens, en and em dashes, the minus sign and their full-width forms.
_DASHES = re.compile("[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]")
_INVISIBLE = re.compile("[\u00ad\u200b\u200c\u200d\u2060\ufeff]")
_WORDS = re.compile(r"[a-z0-9]+(?:['.,][a-z0-9]+)*")
_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "from", "as", "is", "are",
    "be", "been", "was", "were", "it", "its", "this", "that", "these", "those", "you", "your", "their", "they",
    "who", "which", "will", "must", "may", "can", "all", "any", "each", "per", "have", "has", "had", "not", "but",
    "if", "into", "than", "then", "there", "also", "our", "we", "us",
})


def plain(text) -> str:
    """Text as it is compared: one Unicode form, casefolded, straight quotes,
    every dash a hyphen with no spaces around it, single spaces, and no space
    before punctuation. A page and a model's copy of it differ in exactly
    these ways."""
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = _INVISIBLE.sub("", text).translate(_QUOTES)
    text = _DASHES.sub("-", text).casefold()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r" ?- ?", "-", text)
    text = re.sub(r" (?=[,.;:!?)\]])", "", text)
    text = re.sub(r"(?<=[(\[]) ", "", text)
    return text.strip()


def _page_words(norm: str) -> set[str]:
    return set(_WORDS.findall(norm))


def _grounded(snippet_norm: str, page_norm: str, page_words: set[str]) -> bool:
    snippet_norm = snippet_norm.strip(" .;:,")
    if not snippet_norm or not page_norm:
        return False
    if snippet_norm in page_norm:
        return True
    tokens = _WORDS.findall(snippet_norm)
    if len(tokens) < GROUND_LONG_WORDS:
        return False
    content = [t for t in tokens if t not in _STOPWORDS]
    if not content:
        return False
    return sum(1 for t in content if t in page_words) / len(content) >= GROUND_SHARE


def grounded(snippet, page_text) -> bool:
    """The snippet is on the page: a substring once both are normalised (case,
    whitespace, curly quotes, dashes), or, for a line of 9 or more words, at
    least 70% of its content words appear on the page."""
    norm = plain(page_text)
    return _grounded(plain(snippet), norm, _page_words(norm))


_ODDS = re.compile(
    r"\b(?:chances?|odds|likel(?:y|ihood) (?:to|of) (?:win|winning|get|getting|be (?:chosen|picked|selected|accepted|admitted))"
    r"|you'll win|you will win|you'd win|you would win|guarantee[sd]?|guaranteeing|shoo-in|sure to|sure bet|"
    r"sure thing|certain to|probability|bound to win)\b"
)


def no_odds(text) -> bool:
    """False when the text talks about the chance of winning or getting in."""
    return not _ODDS.search(plain(text))


# ── Links ────────────────────────────────────────────────────────────────────

_TRACKING = frozenset({"fbclid", "gclid", "dclid", "msclkid", "yclid", "ref", "ref_src", "igshid", "mc_cid",
                       "mc_eid", "_hsenc", "_hsmi", "_ga", "_gl"})


def _tracking(key: str) -> bool:
    key = unquote(key).strip().lower()
    return key.startswith("utm_") or key in _TRACKING


def canonical_url(url) -> str:
    """One spelling per page: scheme and host lowercased, no "www.", no
    tracking parameters (utm_*, fbclid, gclid, ref and the like), no fragment,
    no trailing "/". Path and the remaining query keep their own spelling.

    The one fragment kept is a text fragment ("#:~:text="), lowercased. Talon
    gives each entry it takes from a page listing many opportunities its own
    link that way (it scrolls to that entry), so two entries from one list
    page are two listings, not one."""
    if not isinstance(url, str):
        return ""
    url = url.strip()
    if not url:
        return ""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return url[:URL_CHARS]
    host = (parts.hostname or "").rstrip(".").lower()
    if host.startswith("www."):
        host = host[4:]
    scheme = (parts.scheme or "https").lower()
    default = {"https": 443, "http": 80}.get(scheme)
    netloc = f"{host}:{port}" if port and port != default else host
    query = "&".join(p for p in parts.query.split("&") if p and not _tracking(p.split("=", 1)[0]))
    fragment = parts.fragment.lower() if parts.fragment.startswith(":~:text=") else ""
    return urlunsplit((scheme, netloc, parts.path.rstrip("/"), query, fragment))[:URL_CHARS]


def _host_matches(host: str, sites) -> bool:
    return any(host == s or host.endswith("." + s) for s in sites)


def is_aggregator(url) -> bool:
    host = pages.domain_of(url)
    return bool(host) and (_host_matches(host, AGGREGATOR_SITES) or pages.site_of(url) in AGGREGATOR_SITES)


def _institutional(url) -> bool:
    """A school, college or government site (.edu, .gov, .mil, and the state
    and k12 names under .us). Their pages talk about Social Security numbers,
    fees and "guaranteed" awards for honest reasons (financial aid forms,
    admission fees, automatic merit awards), and these names are restricted
    to the institutions themselves, so no scam check runs on them."""
    host = pages.domain_of(url)
    return bool(host) and (host.endswith((".edu", ".gov", ".mil"))
                           or re.search(r"(?:^|\.)(?:state|k12)\.[a-z]{2}\.us$", host) is not None)


def _text_fragment_link(url: str, title: str) -> str:
    """url with a text fragment for the title's first words, so the browser
    scrolls to that entry on a list page. The plain url when it would be too
    long."""
    words = " ".join(title.split()[:8])
    base = url.split("#", 1)[0]
    link = f"{base}#:~:text={quote(words, safe='').replace('-', '%2D')}"
    return link if len(link) <= URL_CHARS else base


# ── Dates ────────────────────────────────────────────────────────────────────

_MONTH_NUMBERS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9,
                  "oct": 10, "nov": 11, "dec": 12}
_MONTH = (r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?"
          r"|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?![a-z])")
_ISO = re.compile(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)")
_MDY = re.compile(rf"\b{_MONTH}\s*(\d{{1,2}})(?:st|nd|rd|th)?\s*,?\s*(\d{{4}})(?!\d)")
_DMY = re.compile(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTH}\s*,?\s*(\d{{4}})(?!\d)")
# No "-" in the look-behind: an ISO date is read first and its span skipped,
# and "1/15-3/1/2027" (a range) must still read its second date.
_NUMERIC = re.compile(r"(?<![\d/.])(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?![\d/])")
_ROLLING = re.compile(
    r"\b(?:rolling|ongoing|open until (?:filled|full)|until (?:all )?(?:spots|seats|places|positions|slots) "
    r"(?:are )?(?:filled|full)|until filled|year-round|year round|no (?:set )?deadline|continuous(?:ly)?|"
    r"accepted (?:at )?any ?time|anytime)\b"
)
# Rolling wording that outlasts a date which has passed ("priority deadline
# Nov 15, rolling basis after that"). Narrower than _ROLLING: "ongoing support"
# beside a closed date must not reopen it.
_ROLLING_AFTER = re.compile(
    r"\b(?:rolling (?:basis|admissions?|applications?)|until (?:all )?(?:spots|seats|places|positions|slots) "
    r"(?:are )?(?:filled|full)|until filled|open until full)\b"
)
ROLLING_AFTER_DAYS = 365       # a passed date older than this is a cycle ago, rolling or not
# The words just before an opening date ("applications open Nov 1, 2026",
# "from Nov 1, 2026"), and the words between the two dates of a range.
_OPENS = re.compile(r"\b(?:opens?|opened|opening|begins?|beginning|starts?|starting|from)(?: date)?(?: is)?"
                    r"(?: on)?[\s:,]*$")
_RANGE_TO = re.compile(r"^\s*(?:-|to|through|thru|until|till)\s*$")


def _day(year: int, month: int, day: int) -> Optional[date]:
    if not 2000 <= year <= 2100:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _date_spans(text: str) -> list[tuple[int, int, date]]:
    """(start, end, date) for every full date (day, month and year) in the
    text, each span read once, in reading order."""
    found: list[tuple[int, int, Optional[date]]] = []

    def free(m) -> bool:
        return all(m.end() <= s or m.start() >= e for s, e, _ in found)

    for m in _ISO.finditer(text):
        found.append((m.start(), m.end(), _day(int(m[1]), int(m[2]), int(m[3]))))
    for m in _MDY.finditer(text):
        if free(m):
            found.append((m.start(), m.end(), _day(int(m[3]), _MONTH_NUMBERS[m[1][:3]], int(m[2]))))
    for m in _DMY.finditer(text):
        if free(m):
            found.append((m.start(), m.end(), _day(int(m[3]), _MONTH_NUMBERS[m[2][:3]], int(m[1]))))
    for m in _NUMERIC.finditer(text):
        if free(m):
            year = int(m[3]) + (2000 if len(m[3]) == 2 else 0)
            found.append((m.start(), m.end(), _day(year, int(m[1]), int(m[2]))))     # US order: month/day
    return sorted((s, e, d) for s, e, d in found if d is not None)


def _deadline_dates(text: str) -> list[date]:
    """The dates in a deadline line that can be its deadline: not an opening
    date ("applications open Nov 1, 2026", "from Nov 1, 2026") and not the
    first date of a range ("Nov 1, 2026 - Feb 1, 2027"), whose second date is
    when it closes."""
    spans = _date_spans(text)
    out: list[date] = []
    for i, (start, end, day) in enumerate(spans):
        before = text[max(spans[i - 1][1] if i else 0, start - 25):start]
        if _OPENS.search(before):
            continue
        if i + 1 < len(spans) and _RANGE_TO.match(text[end:spans[i + 1][0]]):
            continue
        out.append(day)
    return out


def parse_deadline(text, today: date) -> tuple[Optional[date], str]:
    """(date, kind), kind one of "date", "rolling", "unknown".

    A full date in any common spelling ("March 1, 2027", "Mar. 1, 2027",
    "1 March 2027", "3/1/2027", "2027-03-01") is a date; an opening date, or
    the first date of a range, is not a deadline and is skipped. With several
    (a priority and a final deadline), the first one not yet passed, else the
    latest. When every date has passed (within the last year) but the line
    says applications go on after it ("rolling basis", "until filled"), it is
    rolling. Rolling wording ("rolling", "ongoing", "open until filled") with
    no date is rolling. A month and day with no year, or anything else, is
    unknown: the page is asked, never guessed."""
    norm = plain(text)
    if not norm:
        return None, "unknown"
    dates = _deadline_dates(norm)
    if dates:
        ahead = [d for d in dates if d >= today]
        if ahead:
            return min(ahead), "date"
        latest = max(dates)
        if _ROLLING_AFTER.search(norm) and latest >= today - timedelta(days=ROLLING_AFTER_DAYS):
            return None, "rolling"
        return latest, "date"
    if _ROLLING.search(norm):
        return None, "rolling"
    return None, "unknown"


_COPYRIGHT = re.compile(r"(?:\u00a9|\(c\)|copyright)\s*(?:\d{4}\s*-\s*)?\d{4}")
_YEAR = re.compile(r"(?<![\d$.,])(20\d\d)(?!\d)")
_ACADEMIC_YEAR = re.compile(r"(?<![\d$.,])(20\d\d)-(\d\d)(?!\d)")
OLDEST_YEAR = 2015


def old_cycle(page_text, today: date) -> bool:
    """The newest year the page mentions (2015 to two years ahead, leaving out
    copyright lines, and reading "2026-27" as reaching 2027) is older than this
    year. Then no date on the page is still ahead, so the cycle it describes
    is over. A page with no year at all is not old."""
    text = _COPYRIGHT.sub(" ", plain(page_text))
    years = {int(m[1]) for m in _YEAR.finditer(text)}
    for m in _ACADEMIC_YEAR.finditer(text):
        start = int(m[1])
        end = start - start % 100 + int(m[2])
        if end == start + 1:
            years.add(end)
    years = {y for y in years if OLDEST_YEAR <= y <= today.year + 2}
    return bool(years) and max(years) < today.year


def cycle_year(today: date) -> int:
    """The year most applications open now are for: this year until May, then
    next year (scholarship deadlines and summer programs both run a cycle
    ahead)."""
    return today.year if today.month <= 5 else today.year + 1


def day_label(d: date) -> str:
    """ "March 3, 2027" """
    return f"{d:%B} {d.day}, {d.year}"


def short_day(d: date) -> str:
    """ "Oct 1" """
    return f"{d:%b} {d.day}"


# ── Scam signs ───────────────────────────────────────────────────────────────

_AMOUNT = r"\$ ?\d[\d,]*(?:\.\d{1,2})?"
_FEE_KINDS = (r"(?:application|processing|entry|submission|registration|handling|administrative|redemption|"
              r"disbursement|activation)")
_FEE_PATTERNS = [
    re.compile(rf"(?P<amount>{_AMOUNT}) (?:non-?refundable |one-?time )?{_FEE_KINDS} fees?\b"),
    re.compile(rf"\b{_FEE_KINDS} fees? ?(?:is|of|:|=|costs?|totals?|amounts to)? ?(?:only |just )?(?P<amount>{_AMOUNT})"),
    re.compile(rf"\b(?:pay|submit|send|include|enclose) (?:a |an |the |our )?(?:small |one-?time |non-?refundable )?"
               rf"(?:(?P<amount>{_AMOUNT}) )?(?:fee|payment|charge) (?:to|in order to|before you can|so you can|so "
               rf"that you can) (?:apply|enter|be considered|submit|claim|receive|qualify|get)\b"),
    re.compile(r"\b(?:fee|payment|charge) (?:is |will be )?(?:required|due|needed) (?:to|in order to|before you "
               r"can|with your|for your) (?:apply|enter|be considered|submit|claim|receive|qualify|application|"
               r"entry|submission)\b"),
    re.compile(r"\b(?:redemption|disbursement|activation) fees?\b"),
    re.compile(rf"\bcosts? (?P<amount>{_AMOUNT}) to (?:apply|enter)\b"),
]
_GUARANTEE_PATTERNS = [
    re.compile(r"\bguaranteed (?:to win|winners?|money|cash|scholarship money|awards?|approval|or your money back)\b"),
    re.compile(r"(?:\b100 ?%|\bone hundred percent) guaranteed\b"),
    re.compile(r"\bmoney-?back guarantee\b|\bor your money back\b"),
    re.compile(r"\byou(?:'re| are| will be) guaranteed (?:to )?(?:win|get|receive|a scholarship|an award|money|"
               r"cash|\$)"),
    re.compile(r"\b(?:we )?guarantee(?:s|d)? (?:that )?you(?:'ll| will)? (?:win|get|receive)\b"),
]
_SENSITIVE = (r"(?:social security (?:number|no\.?|#)|ss ?#|ssn|bank (?:account|routing|details|information|"
              r"info)(?: number)?|routing number|checking account(?: number)?|savings account(?: number)?)")
# A card number is a scam sign only on a scholarship: a paid program takes
# its fee by card.
_CARD = r"(?:(?:credit|debit) card(?: number| details| information| info)?|card number)"
_ASK_VERBS = (r"(?:provide|enter|submit|send|include|give|share|upload|type|fill in|list|confirm|verify|"
              r"ask(?:s|ing)? (?:you )?for|request(?:s|ing)?|collect(?:s|ing)?)")


# A form field's label ("SSN:", "Routing number *:"): only the numbers
# themselves, since "Bank details: the award is paid to your college" is not
# an ask.
_LABEL = r"(?:social security (?:number|no\.?|#)|ss ?#|ssn|bank account (?:number|no\.?|#)|routing number)"


def _ask_patterns(sensitive: str, label: str) -> list[re.Pattern]:
    return [
        re.compile(rf"\b{_ASK_VERBS} (?:us )?(?:with )?(?:your |a |the |their |his or her )?(?:valid |full )?"
                   rf"{sensitive}"),
        re.compile(rf"\b(?:need|needs|require|requires|required) your {sensitive}"),
        re.compile(rf"\b{sensitive} (?:is )?(?:required|needed|mandatory)\b"),
        re.compile(rf"(?:^|(?<= )){label} ?\*? ?:"),
    ]


_ASK_SSN_BANK = _ask_patterns(_SENSITIVE, _LABEL)
_ASK_SSN_BANK_CARD = _ask_patterns(f"(?:{_SENSITIVE}|{_CARD})", f"(?:{_LABEL}|(?:credit |debit )?card number)")

_SENTENCE_BREAK = re.compile(r"[.!?;] ")
_NEGATORS = re.compile(
    r"\b(?:no|not|never|without|none|nor|neither|zero|cannot|can't|won't|don't|doesn't|didn't|isn't|"
    r"aren't|wasn't|weren't|shouldn't|wouldn't)\b"
)
_FEE_FREE = re.compile(r"\bfree\b")             # "free to apply, no hidden fees"
_DENIED_AFTER = re.compile(r"^[^.!?;]{0,40}\b(?:waived|none|not required|isn't required|not needed|not charged|n/a)\b")
# "the $75 application fee" that a scholarship covers, or a college's fee.
_FEE_COVERED = re.compile(r"\b(?:cover|covers|covered|covering|reimburs\w*|pays? for|paying for|help(?:s)? (?:with|pay)|"
                          r"toward|towards)\b")
_FEE_COLLEGE_BEFORE = re.compile(r"\b(?:college|colleges|university|admissions?)\s*$")
_FEE_COLLEGE_AFTER = re.compile(r"^\s*(?:for|to|at) (?:colleges?|universit(?:y|ies)|schools?)\b")
# Asked for once a student is hired or chosen (payroll, tax forms), or on a
# government aid form a page is explaining (the FAFSA): not up front, and not
# to the page's owner.
_AFTER_SELECTION = re.compile(r"\b(?:upon|after|once|if) (?:you are |you're |you have been |being )?(?:hired|selected|"
                              r"accepted|chosen|awarded|offered)\b|\bpayroll\b|\btax (?:forms?|purposes|reporting|"
                              r"returns?)\b|\bfafsa\b|\bcss profile\b|\bfinancial aid (?:form|application)s?\b|"
                              r"\b(?:w-?9|w-?4|i-?9)\b")


def _sentence_around(text: str, start: int, end: int) -> tuple[str, str]:
    """The same sentence's words just before and just after a match."""
    before = _SENTENCE_BREAK.split(text[max(0, start - 70):start])[-1]
    after = _SENTENCE_BREAK.split(text[end:end + 60])[0]
    return before, after


def _amount_zero(m: re.Match) -> bool:
    amount = m.groupdict().get("amount")
    return bool(amount) and not re.sub(r"[^\d]", "", amount).strip("0")


def _stated(patterns, text: str, *, fee: bool = False, ask: bool = False) -> bool:
    """Some pattern matches in a sentence that does not deny it."""
    for pattern in patterns:
        for m in pattern.finditer(text):
            before, after = _sentence_around(text, m.start(), m.end())
            if _NEGATORS.search(before) or _DENIED_AFTER.search(after):
                continue
            if fee and (_amount_zero(m) or _FEE_FREE.search(before) or _FEE_COVERED.search(before)
                        or _FEE_COLLEGE_BEFORE.search(before) or _FEE_COLLEGE_AFTER.search(after)):
                continue
            if ask and (_AFTER_SELECTION.search(before) or _AFTER_SELECTION.search(after)):
                continue
            return True
    return False


def scam_reasons(page_text, lane, url) -> list[str]:
    """The scam signs on a page, as DROP_MESSAGES keys: "fee" and "guaranteed"
    for scholarships only (a program or competition may honestly charge), and
    "asks_ssn_bank" in both lanes. None on a school or government site (see
    _institutional)."""
    if _institutional(url):
        return []
    text = plain(page_text)
    if not text:
        return []
    out = []
    if lane == "scholarship":
        if _stated(_FEE_PATTERNS, text, fee=True):
            out.append("fee")
        if _stated(_GUARANTEE_PATTERNS, text):
            out.append("guaranteed")
    if _stated(_ASK_SSN_BANK_CARD if lane == "scholarship" else _ASK_SSN_BANK, text, ask=True):
        out.append("asks_ssn_bank")
    return out


# ── Money ────────────────────────────────────────────────────────────────────

_DOLLARS = re.compile(r"\$ ?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?: ?(k|thousand|million|m)\b)?")
_DOLLAR_WORDS = re.compile(r"(?<![\d$.,])(\d{1,3}(?:,\d{3})+|\d+) ?(?:dollars|usd)\b")
_FREE = re.compile(r"\b(?:free|no cost|no charge|no fee|no fees|no tuition|tuition-free|fully funded|fully-funded|"
                   r"at no cost|without cost|costs nothing)\b|\$0(?:\.00)?(?![\d.,])")
_AID = re.compile(r"\b(?:financial aid|financial assistance|need-based|fee waivers?|waive[sd]?|scholarships?|stipends?|"
                  r"tuition assistance|sliding scale|reduced (?:cost|tuition|fees?)|fully funded|fully-funded|"
                  r"grants?|free of charge|at no cost|subsidi[sz]ed|aid is available|aid available)\b")
_MULTIPLIERS = {"k": 1_000, "thousand": 1_000, "m": 1_000_000, "million": 1_000_000}


def dollars(text) -> list[int]:
    """Every dollar amount in the text, in whole dollars: "$2,500", "$5K",
    "$1.5 million", "500 dollars"."""
    norm = plain(text)
    out = []
    for m in _DOLLARS.finditer(norm):
        value = float(m[1].replace(",", "") + ("." + m[2] if m[2] else ""))
        out.append(int(round(value * _MULTIPLIERS.get(m[3] or "", 1))))
    for m in _DOLLAR_WORDS.finditer(norm):
        out.append(int(m[1].replace(",", "")))
    return [v for v in out if 0 <= v <= USD_MAX]


def _whole(value) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return value if isinstance(value, int) and 0 <= value <= USD_MAX else None


def _usd(model_value, text: str, *, cost: bool) -> Optional[int]:
    """Whole dollars for an amount or a cost line already checked against the
    page. The model's number when the line states it (or 0 for a line saying
    it is free), else one read from the line: the largest award, or the
    smallest cost (the cheapest way in). None without a line."""
    if not text:
        return None
    amounts = dollars(text)
    free = cost and bool(_FREE.search(plain(text)))
    value = _whole(model_value)
    if value is not None and (value in amounts or (value == 0 and free)):
        return value
    positive = [a for a in amounts if a > 0]
    if cost:
        if positive:
            return min(positive)
        return 0 if free or 0 in amounts else None
    return max(positive) if positive else None


# ── States ───────────────────────────────────────────────────────────────────

US_STATES = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california", "CO": "colorado",
    "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho",
    "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana",
    "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota",
    "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york", "NC": "north carolina",
    "ND": "north dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon", "PA": "pennsylvania",
    "RI": "rhode island", "SC": "south carolina", "SD": "south dakota", "TN": "tennessee", "TX": "texas",
    "UT": "utah", "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west virginia",
    "WI": "wisconsin", "WY": "wyoming", "DC": "district of columbia", "PR": "puerto rico", "GU": "guam",
    "VI": "virgin islands", "AS": "american samoa", "MP": "northern mariana islands",
}
# Longest first, so "west virginia" is read before "virginia".
_STATE_NAMES = sorted(US_STATES.items(), key=lambda item: len(item[1]), reverse=True)


def state_code(text) -> Optional[str]:
    """The two-letter code for a state written as a code ("FL", "fl"), a name
    ("Florida"), or a place ending in one ("Tampa, FL", "Northern Virginia").
    None when no state can be read from it (a region, a city alone)."""
    if not isinstance(text, str):
        return None
    raw = text.strip()
    if not raw:
        return None
    if re.fullmatch(r"[A-Za-z]\.?[A-Za-z]\.?", raw):
        code = re.sub(r"[^A-Za-z]", "", raw).upper()
        return code if code in US_STATES else None
    m = re.search(r"(?:^|[\s,])([A-Z]{2})\.?$", raw)
    if m and m.group(1) in US_STATES:
        return m.group(1)
    norm = plain(raw).replace(".", "")
    if "district of columbia" in norm or re.search(r"\bwashington,? dc\b", norm) or re.search(r"\bdc\b", norm):
        return "DC"
    for code, name in _STATE_NAMES:
        if re.search(rf"\b{name}\b", norm):
            return code
    return None


def state_name(text) -> str:
    """The state's name ("Florida") for a place, or "" when none can be read.
    The only place a search query may carry: never a town."""
    code = state_code(text)
    if code is None:
        return ""
    return "Washington, DC" if code == "DC" else US_STATES[code].title()


def _outside_states(states, student_state) -> bool:
    """The listing names the states it is open to, the student's state is
    known, and it is none of them. Any entry that is not a state (a county, a
    region) means the code cannot tell, so nothing is dropped."""
    entries = [s for s in states if isinstance(s, str) and s.strip()] if isinstance(states, list) else []
    mine = state_code(student_state)
    if not entries or not mine:
        return False
    codes = [state_code(s) for s in entries]
    if any(c is None for c in codes):
        return False
    return mine not in codes


# ── One listing ──────────────────────────────────────────────────────────────

FACT_FIELDS = ("deadline_text", "amount_text", "cost_text", "dates_text", "location_text")


def _lines(values, norm: str, words: set[str], limit: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values if isinstance(values, list) else []:
        if not isinstance(value, str):
            continue
        line = clean_text(value, LINE_CHARS)
        key = plain(line)
        if not line or key in seen or not _grounded(plain(value[:600]), norm, words):
            continue
        seen.add(key)
        out.append(line)
        if len(out) == limit:
            break
    return out


def _facts(raw: dict, norm: str, words: set[str]) -> dict:
    out: dict = {}
    for key in FACT_FIELDS:
        value = raw.get(key)
        ok = isinstance(value, str) and _grounded(plain(value[:600]), norm, words)
        out[key] = clean_text(value, FACT_CHARS) if ok else ""
    out["amount_usd"] = _usd(raw.get("amount_usd"), out["amount_text"], cost=False)
    out["cost_usd"] = _usd(raw.get("cost_usd"), out["cost_text"], cost=True)
    aid = raw.get("aid")
    out["aid"] = True if aid is True and _AID.search(norm) else False if aid is False else None
    out["eligibility"] = _lines(raw.get("eligibility"), norm, words, MAX_ELIGIBILITY)
    out["requirements"] = _lines(raw.get("requirements"), norm, words, MAX_REQUIREMENTS)
    return out


def listing_facts(raw, page_text) -> dict:
    """The fact fields of one extracted listing, each kept only if it is on
    the page: the four short texts and location_text (blank when not found),
    amount_usd and cost_usd (read from those texts), aid (true only when the
    page mentions aid), and the eligibility and requirement lines that are on
    the page."""
    norm = plain(page_text)
    return _facts(raw if isinstance(raw, dict) else {}, norm, _page_words(norm))


def _page_field(page, name: str) -> str:
    value = page.get(name) if isinstance(page, dict) else getattr(page, name, None)
    return value if isinstance(value, str) else ""


def _grade(value) -> Optional[int]:
    return value if isinstance(value, int) and not isinstance(value, bool) and 9 <= value <= 12 else None


def check_listing(raw, page, brief, today: date, *, link_to_entry: bool = False) -> tuple[Optional[dict], Optional[dict]]:
    """The whole per-listing check, in order. (listing, None) to keep it,
    (None, {"title", "reason", "message"}) to leave it out with a reason the
    student sees, or (None, None) to leave it out silently (no title, no
    readable page, or an entry whose name is not on its page).

    page is the page the listing came from (a pages.Page, or a dict with
    final_url and text). The listing carries the finder_items fact columns,
    with deadline as an ISO date or None and fit_reason and record_ref empty
    (research fills them).

    An entry from a page listing many (own_page false), or link_to_entry for
    a second entry on one provider's page, must be on the page by name, and
    its link is the page with a text fragment for that name (canonical_url)."""
    if not isinstance(raw, dict) or page is None:
        return None, None
    brief = brief if isinstance(brief, dict) else {}
    title = clean_text(raw.get("title"), TITLE_CHARS)
    checked = pages.checked_url(_page_field(page, "final_url") or _page_field(page, "url"))
    text = _page_field(page, "text")
    if not title or checked is None or not text:
        return None, None
    url = checked[0]
    lane = brief.get("lane") if brief.get("lane") in LANES else "scholarship"
    own_page = raw.get("own_page") is True
    entry_link = link_to_entry or not own_page
    norm = plain(text)
    words = _page_words(norm)
    if entry_link and not _grounded(plain(raw.get("title")), norm, words):
        return None, None               # an entry among several must be on its page by name

    def drop(reason: str):
        return None, {"title": clean_text(title, DROP_TITLE_CHARS), "reason": reason, "message": DROP_MESSAGES[reason]}

    facts = _facts(raw, norm, words)

    reasons = scam_reasons(text, lane, url)
    if reasons:
        return drop(reasons[0])

    deadline, deadline_kind = (parse_deadline(facts["deadline_text"], today) if facts["deadline_text"]
                               else (None, "unknown"))
    if deadline is not None and deadline < today:
        return drop("past_deadline")
    # A page that says it takes applications on a rolling basis is not over
    # because it only mentions an older year ("founded in 2018").
    if deadline is None and deadline_kind != "rolling" and old_cycle(text, today):
        return drop("old_cycle")

    grades = {g for g in (raw.get("grades") if isinstance(raw.get("grades"), list) else [])
              if isinstance(g, int) and not isinstance(g, bool)}
    grade = _grade(brief.get("grade"))
    if grades and grade is not None and grade not in grades:
        return drop("not_your_grade")

    confirm: list[str] = []
    need = raw.get("citizenship") if raw.get("citizenship") in CITIZENSHIP_NEEDS else "unknown"
    status = brief.get("citizenship") if brief.get("citizenship") in CITIZENSHIP else "unsure"
    if need in CITIZENSHIP_CONFIRM:
        if status == "other" or (need == "us_citizen" and status == "permanent_resident"):
            return drop("citizenship")
        if status == "unsure":
            confirm.append(CITIZENSHIP_CONFIRM[need])

    if _outside_states(raw.get("states"), brief.get("state")):
        return drop("other_state")

    chips = {c for c in (brief.get("chips") if isinstance(brief.get("chips"), list) else []) if c in CHIPS}
    for key in raw.get("restricted_to") if isinstance(raw.get("restricted_to"), list) else []:
        if key in CHIP_CONFIRM and key not in chips and CHIP_CONFIRM[key] not in confirm:
            confirm.append(CHIP_CONFIRM[key])

    cost, aid = facts["cost_usd"], facts["aid"]
    budget = brief.get("budget") if brief.get("budget") in BUDGETS else "any"
    if lane == "activity" and cost is not None and aid is not True:
        if (budget == "free" and cost > 0) or (budget == "under_500" and cost > 500):
            return drop("over_budget")

    if not any(facts[k] for k in ("deadline_text", "amount_text", "cost_text", "dates_text", "eligibility",
                                  "requirements")):
        return drop("unreadable")

    link = _text_fragment_link(url, title) if entry_link else url
    kind = raw.get("kind") if raw.get("kind") in KINDS else ("scholarship" if lane == "scholarship" else "other")
    return {
        "lane": lane,
        "kind": kind,
        "title": title,
        "provider": clean_text(raw.get("provider"), PROVIDER_CHARS),
        "summary": clean_text(raw.get("summary"), SUMMARY_CHARS),
        "url": link,
        "source_url": url,
        "canonical_url": canonical_url(link),
        "verified": own_page and not is_aggregator(url),
        "deadline": deadline.isoformat() if deadline else None,
        "deadline_text": facts["deadline_text"],
        "deadline_kind": deadline_kind,
        "amount_text": facts["amount_text"],
        "amount_usd": facts["amount_usd"],
        "cost_text": facts["cost_text"],
        "cost_usd": cost,
        "aid": aid,
        "dates_text": facts["dates_text"],
        "location_text": facts["location_text"],
        "eligibility": facts["eligibility"],
        "requirements": facts["requirements"],
        "confirm": confirm,
        "fit_reason": "",
        "record_ref": "",
    }, None


# ── Order ────────────────────────────────────────────────────────────────────

def iso_day(value) -> Optional[date]:
    """A deadline as stored (an ISO date string, or a date) as a date."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _score(listing: dict) -> int:
    score = 2 if listing.get("record_ref") else 0
    score += 1 if listing.get("verified") else 0
    if listing.get("lane") == "activity" and (listing.get("cost_usd") == 0 or listing.get("aid") is True):
        score += 1
    return score - len(listing.get("confirm") or [])


def rank(listings, today: date, limit: int = RANK_LIMIT) -> list[dict]:
    """Deadlines from today to 21 days out first, soonest first; then the rest
    by score (tied to their record +2, verified +1, free or aided in the
    activity lane +1, minus 1 per line they would need to confirm), then by
    deadline, none last. Never a match score or a chance of winning: the order
    is all the student sees of it. Cut to `limit`."""
    items = [l for l in (listings or []) if isinstance(l, dict)]
    soon_until = today + timedelta(days=SOON_DAYS)
    soon, rest = [], []
    for listing in items:
        day = iso_day(listing.get("deadline"))
        (soon if day is not None and today <= day <= soon_until else rest).append(listing)
    soon.sort(key=lambda l: iso_day(l.get("deadline")))
    rest.sort(key=lambda l: (-_score(l), iso_day(l.get("deadline")) or date.max))
    return (soon + rest)[:limit]
