"""
The student's name, taken out of text on its way to a model that has no use
for it.

Pure: no I/O, no model, no search. Beaker's and Talon's research prompts use
research_record (through outreach/research.py, where it used to live), and so
does Quill, which imports it from here so that nothing of Quill's imports a
search module. Quill's prompts also use without_name on the interview's notes,
which a model wrote and which can use the name.
"""
import re


def without_name(text: str, full: str) -> str:
    """text with the student's name taken out, as a name only.

    The whole name goes wherever it is, in any case. One part of it goes only
    where it stands as a name: spelled with its capital, and not inside some
    other proper noun. So "Samira is a junior" loses the name, while a student
    called Emily Park keeps "National Park Service", Will keeps "will", and
    Grace keeps "the Grace Hopper Celebration"."""
    words = [w for w in full.split() if len(re.sub(r"\W", "", w)) >= 2]
    if not words:
        return text
    if len(words) >= 2:
        for phrase in sorted({full.strip(), " ".join(words)}, key=len, reverse=True):
            pattern = r"\s+".join(re.escape(w) for w in phrase.split())
            text = re.sub(rf"(?<![\w'-]){pattern}(?![\w-])", "the student", text, flags=re.IGNORECASE)
    for word in sorted(set(words), key=len, reverse=True):
        # As a name is written in prose: "samira" or "SAMIRA" on the Name line is "Samira" there.
        forms = {word.capitalize()} if word.islower() else {word, word.capitalize()} if word.isupper() else {word}
        found = re.compile(r"(?<![\w'-])(?:" + "|".join(re.escape(f) for f in forms) + r")(?![\w-])")

        def swap(m, text=text):
            before, after = text[max(0, m.start() - 60):m.start()], text[m.end():m.end() + 60]
            if re.search(r"(?<![\w'-])[A-Z][\w'-]*[ \t]+$", before) or re.match(r"(?:'s)?[ \t]+[A-Z]", after):
                return m.group(0)       # part of another proper noun: Central Park, Will Rogers
            return "the student"
        text = found.sub(swap, text)
    return text


def research_record(record_text: str) -> str:
    """The record for a research prompt, without the student's name: the model
    doing the searching has no use for it, and it must never become a query.
    The "Name:" line goes, and the name is taken out of the rest too (the
    narrative summary can use it), as a name only (without_name)."""
    kept, names = [], []
    for line in (record_text or "").splitlines():
        if line.strip().lower().startswith("name:"):
            names.append(line.split(":", 1)[1].strip())
        else:
            kept.append(line)
    text = "\n".join(kept).strip()
    for full in names:
        text = without_name(text, full)
    return text
