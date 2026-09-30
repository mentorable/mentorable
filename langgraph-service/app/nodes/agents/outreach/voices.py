"""
The static choices a student makes before Beaker drafts: why they are writing
(purpose), how it should sound (voice), how long it is (length), and the
rewrite chips (tweaks).

Each option carries the words the page shows and the guidance the prompt gets,
so a label and what the model is told can never drift apart. The four example
openings come from the cold-email research (.claude/OUTREACH_EMAIL_RESEARCH.md,
section 9), with the school's name replaced by its type: the rules say a
student gives grade, school type and general area, never the school itself.
"""

DEFAULT_VOICE = "warm"
DEFAULT_LENGTH = "brief"

# A first email is never longer than this, whatever the length pick says, and
# a follow-up is two or three sentences.
MAX_WORDS = 175
FOLLOWUP_MAX_WORDS = 70

VOICES: dict[str, dict] = {
    "formal": {
        "label": "Formal and polished",
        "hint": "Full sentences and titles, no contractions. Good for senior professors and program offices.",
        "example": (
            "Dear Professor Alvarez: I am a junior at a public high school in Tucson, and I read your lab's "
            "page on desert soil microbes with real interest. Might I ask whether you would be open to a "
            "fifteen-minute conversation about how a high school student could learn more about this work?"
        ),
        "guidance": (
            "Formal and polished. Full sentences and no contractions. Courteous and precise, and still "
            "recognizably a careful high school student, never a lawyer or a cover letter. Close with "
            "\"Thank you for your time,\" or \"Sincerely,\"."
        ),
    },
    "warm": {
        "label": "Warm and curious",
        "hint": "Friendly and natural, with one personal beat. The best place to start.",
        "example": (
            "Dear Dr. Alvarez, I'm a high school junior in Tucson, and your lab's page on how soil microbes "
            "survive dry spells sent me down a few afternoons of reading. Would you be up for a short chat "
            "about how someone my age could start learning this properly?"
        ),
        "guidance": (
            "Warm and curious. Natural contractions (I'm, I've, it's). One honest personal beat about why "
            "this caught their interest, taken only from their record, their note or their answer. Friendly "
            "and still respectful: a real greeting, never \"Hey\". Close with \"Thank you,\" or \"Thanks so much,\"."
        ),
    },
    "direct": {
        "label": "Short and direct",
        "hint": "Fewest words and one clear question. For very busy people and professionals.",
        "example": (
            "Dear Dr. Alvarez, I'm a junior at a public high school in Tucson. I read your lab's page on "
            "desert soil microbes and have one question: where would you suggest a high school student start?"
        ),
        "guidance": (
            "Short and direct. Every sentence earns its place: who they are, the one detail, the link to "
            "them, and the ask as one clear question the recipient could answer in a line. Stay at the low "
            "end of the word range. Polite and plain, never curt. Close with \"Thank you,\"."
        ),
    },
    "humble": {
        "label": "Eager but humble",
        "hint": "Names what they are still learning, honestly, without over-apologizing.",
        "example": (
            "Dear Dr. Alvarez, I'm a high school junior in Tucson and I know I'm still learning the basics. "
            "Your lab's soil microbe page is the first thing that made me keep reading past the abstract, and "
            "I'd be grateful for even a one-line pointer on where to start."
        ),
        "guidance": (
            "Eager but humble. One honest line about what they are still learning or did not fully follow "
            "yet. Let the specific detail show the enthusiasm instead of adjectives. At most one small "
            "apology or none; never grovel and never put themselves down. Close with \"Thank you so much,\"."
        ),
    },
}

PURPOSES: dict[str, dict] = {
    "research": {
        "label": "Research opportunity",
        "hint": "How a high school student could start learning their research, or who handles that.",
        "ask": (
            "Ask for one small thing: a 15-minute conversation, or one or two questions answered by email if "
            "that is easier for them, about how a high school student could start learning this work. Never "
            "ask for a spot in the lab, a project, a paid position, authorship or a recommendation letter."
        ),
        "easy_out": (
            "Say plainly that they understand many labs cannot host high school students, and that a pointer "
            "to the university's outreach or pre-college program, or to someone else, would be just as helpful."
        ),
    },
    "informational": {
        "label": "Informational chat",
        "hint": "A short conversation about their path and their field.",
        "ask": (
            "Ask for a 15-minute call, or one or two questions by email if that is easier, about how they got "
            "into their field and what they would learn first. Say they are exploring the field and are not "
            "asking for a job or an internship."
        ),
        "easy_out": (
            "Make saying no easy: if they are too busy, one piece of advice by email, or no reply at all, "
            "is completely fine."
        ),
    },
    "internship": {
        "label": "Internship or job",
        "hint": "Whether their organization has anything open to high school students.",
        "ask": (
            "Ask one question: whether their team or organization offers anything for high school students "
            "(a shadowing day, a summer program or an internship), and if so, who handles it. Never ask them "
            "to create a position, to hire the student, or for a referral."
        ),
        "easy_out": (
            "Say they understand many organizations cannot take students under 18, and that a pointer to the "
            "right person or page would be just as helpful."
        ),
    },
    "mentorship": {
        "label": "Mentorship or advice",
        "hint": "One piece of advice on what to learn or read next.",
        "ask": (
            "Ask for one piece of advice: what they would suggest a high school student read, learn or try "
            "first in this area. Never ask them to be a mentor or for ongoing help."
        ),
        "easy_out": (
            "Make saying no easy: even a one-line reply, or a pointer to one good starting resource, would be "
            "a real help."
        ),
    },
}

LENGTHS: dict[str, dict] = {
    "brief": {"label": "Brief", "hint": "About 80 to 110 words", "words": (80, 110)},
    "fuller": {"label": "Fuller", "hint": "About 120 to 160 words", "words": (120, 160)},
}

TWEAKS: dict[str, dict] = {
    "shorter": {
        "label": "Shorter",
        "instruction": (
            "Make it noticeably shorter: cut at least a quarter of the words. Keep the greeting, the one "
            "sentence on who they are, the one detail about the recipient's work and how it connects to them, "
            "the one ask, the easy out and the sign off. Cut repetition and softening phrases first."
        ),
    },
    "warmer": {
        "label": "Warmer",
        "instruction": (
            "Make it warmer and more personal: natural contractions, one honest line about why this caught "
            "their interest (only from what the email, their record or their note already says), and a "
            "friendlier sign off. Keep it respectful, keep every fact the same, and keep the same ask."
        ),
    },
    "formal": {
        "label": "More formal",
        "instruction": (
            "Make it more formal and polished: full sentences, no contractions, title and last name in the "
            "greeting, a courteous sign off. It should still sound like a careful high school student, never "
            "a lawyer. Keep every fact and the same ask."
        ),
    },
    "smaller_ask": {
        "label": "Smaller ask",
        "instruction": (
            "Make the ask smaller and easier to say yes to: one or two questions they could answer by email "
            "in a couple of minutes, or a pointer to one resource or one person. Remove any request for a "
            "call, a meeting, a position or ongoing help. Keep the easy out."
        ),
    },
}


def valid_purpose(v) -> bool:
    return isinstance(v, str) and v in PURPOSES


def valid_voice(v) -> bool:
    return isinstance(v, str) and v in VOICES


def valid_length(v) -> bool:
    return isinstance(v, str) and v in LENGTHS


def valid_tweak(v) -> bool:
    return isinstance(v, str) and v in TWEAKS
