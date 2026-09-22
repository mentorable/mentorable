"""
Portfolio -> PDF resume.

Builds a LaTeX document in the style of "Jake's Resume" (the widely used
single-column, ATS-friendly template) from the student's college record
(academics plus activities and awards) and contact info, then compiles it with
Tectonic. No AI involved: this is pure formatting, so the only cost is the
compile itself.

Tectonic is XeTeX-based, so the pdfTeX-only bits of the original template
(\\pdfgentounicode, glyphtounicode) are intentionally left out.
"""
import asyncio
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Render's buildCommand (see langgraph-service/render.yaml) downloads the static
# Tectonic binary straight into the service's rootDir (langgraph-service/), since
# Render's native Python runtime has no package manager for system binaries. Prefer
# a `tectonic` already on PATH (e.g. installed via Homebrew for local dev) and fall
# back to that dropped binary.
_LOCAL_TECTONIC = Path(__file__).resolve().parents[3] / "tectonic"


def _tectonic_bin() -> str:
    return shutil.which("tectonic") or str(_LOCAL_TECTONIC)

COMPILE_TIMEOUT_SECONDS = 150  # first compile on a fresh container downloads packages

COURSE_LEVEL_LABELS = {
    "ap": "AP", "ib": "IB", "honors": "Honors",
    "dual_enrollment": "Dual Enrollment", "regular": "",
}

AWARD_LEVEL_LABELS = {
    "school": "School", "regional": "Regional", "state": "State",
    "national": "National", "international": "International",
}

_LATEX_SPECIALS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

# Typographic characters that Computer Modern / Latin Modern won't have glyphs
# for, or that read better as their LaTeX equivalents.
_UNICODE_NORMALIZE = {
    "—": "---", "–": "--", "‒": "-", "‐": "-", "‑": "-",
    "‘": "'", "’": "'", "“": "``", "”": "''",
    "•": "-", "…": "...", " ": " ",
}


def _escape_latex(text: str) -> str:
    out = []
    for ch in (text or ""):
        ch = _UNICODE_NORMALIZE.get(ch, ch)
        out.append(_LATEX_SPECIALS.get(ch, ch))
    return "".join(out)


def _sanitize_url(url: str) -> str:
    """Strip anything that could break out of \\href{}; hyperref accepts \\# and \\% inside its URL arg."""
    url = (url or "").strip()
    url = re.sub(r"[\s{}\\]", "", url)
    if url and not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url):
        url = "https://" + url
    return url.replace("%", r"\%").replace("#", r"\#")


def _description_bullets(description: str) -> list[str]:
    """
    Turn a free-text description into bullet points: one per line if the student
    wrote lines, otherwise split a long single paragraph on sentence boundaries.
    Short descriptions stay as a single bullet.
    """
    text = (description or "").strip()
    if not text:
        return []
    lines = [ln.strip().lstrip("-•* ").strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    if len(lines) > 1:
        return lines
    single = lines[0] if lines else text
    if len(single) > 140:
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", single)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) > 1:
            return parts
    return [single]


LATEX_PREAMBLE = r"""\documentclass[letterpaper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage{tabularx}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeEntry}[1]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & \\
    \end{tabular*}\vspace{-7pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}
"""


def _header(name: str, contact: dict) -> str:
    parts = []
    email = (contact.get("email") or "").strip()
    phone = (contact.get("phone") or "").strip()
    location = (contact.get("location") or "").strip()
    if phone:
        parts.append(_escape_latex(phone))
    if email:
        parts.append(rf"\href{{mailto:{_sanitize_url(email).removeprefix('https://')}}}{{\underline{{{_escape_latex(email)}}}}}")
    if location:
        parts.append(_escape_latex(location))
    for link in contact.get("links") or []:
        if not isinstance(link, dict):
            continue
        url = _sanitize_url(link.get("url") or "")
        if not url:
            continue
        label = (link.get("label") or "").strip() or re.sub(r"^https?://", "", (link.get("url") or "").strip())
        parts.append(rf"\href{{{url}}}{{\underline{{{_escape_latex(label)}}}}}")

    display_name = _escape_latex((name or "").strip() or "Your Name")
    lines = [
        r"\begin{center}",
        rf"    \textbf{{\Huge \scshape {display_name}}} \\ \vspace{{1pt}}",
    ]
    if parts:
        lines.append("    \\small " + " $|$ ".join(parts))
    lines.append(r"\end{center}")
    return "\n".join(lines) + "\n"


def _fmt_gpa(academics: dict) -> str:
    """GPA line, e.g. "GPA: 3.87 (unweighted), 4.40 (weighted), 5.0 scale"."""
    bits = []
    u, w = academics.get("gpa_unweighted"), academics.get("gpa_weighted")
    if u:
        bits.append(f"{u} unweighted")
    if w:
        bits.append(f"{w} weighted")
    if not bits:
        return ""
    scale = academics.get("gpa_scale")
    tail = f", {scale} scale" if scale and scale not in ("not_used", "other") else ""
    return "GPA: " + ", ".join(bits) + tail


def _fmt_scores(scores: list[dict]) -> str:
    """Test scores on one line: "SAT: 1520 (RW 760, M 760) | AP Chemistry: 5"."""
    out = []
    for sc in scores:
        kind = (sc.get("test_type") or "").upper()
        value = sc.get("score")
        if value is None:
            continue
        if kind == "AP":
            subject = (sc.get("subject") or "").strip()
            out.append(f"AP {subject}: {value}".replace("AP : ", "AP: "))
        else:
            sub = sc.get("section_scores") or {}
            detail = ", ".join(
                f"{k.replace('reading_writing', 'RW').replace('math', 'M').replace('_', ' ')} {v}"
                for k, v in sub.items()
            )
            out.append(f"{kind}: {value}" + (f" ({detail})" if detail else ""))
    return " $|$ ".join(_escape_latex(o) for o in out)


def _academics_section(academics: dict, courses: list[dict], scores: list[dict]) -> str:
    """Education: GPA and test scores as plain lines, coursework grouped by rigor."""
    lines = []
    gpa = _fmt_gpa(academics)
    if gpa:
        lines.append(rf"  \item\small{{{_escape_latex(gpa)}}}")
    score_line = _fmt_scores(scores)
    if score_line:
        lines.append(rf"  \item\small{{{score_line}}}")

    if courses:
        # Group by level so "AP: Calc BC, Chem" reads the way a transcript does.
        by_level: dict[str, list[str]] = {}
        for c in courses:
            label = COURSE_LEVEL_LABELS.get(c.get("level") or "", "")
            by_level.setdefault(label, []).append(str(c.get("name") or "").strip())
        for label in ["AP", "IB", "Dual Enrollment", "Honors", ""]:
            names = [n for n in by_level.get(label, []) if n]
            if not names:
                continue
            joined = _escape_latex(", ".join(names))
            prefix = rf"\textbf{{{label}}}: " if label else r"\textbf{Other}: "
            lines.append(rf"  \item\small{{{prefix}{joined}}}")

    if not lines:
        return ""
    return "\n".join([r"\section{Education}", r"\resumeSubHeadingListStart", *lines,
                       r"\resumeSubHeadingListEnd"]) + "\n"


def _activities_section(activities: list[dict]) -> str:
    """Activities in Common App shape: role, organization, commitment, then impact."""
    if not activities:
        return ""
    out = [r"\section{Activities \& Leadership}", r"\resumeSubHeadingListStart"]
    for a in activities:
        title = (a.get("title") or "").strip()
        role = (a.get("position") or "").strip()
        org = (a.get("organization") or "").strip()

        head = role or title
        trailing = []
        if org and org.lower() != head.lower():
            trailing.append(org)
        elif title and title.lower() != head.lower():
            trailing.append(title)

        hrs, wks = a.get("hours_per_week"), a.get("weeks_per_year")
        if hrs and wks:
            trailing.append(f"{_num(hrs)} hrs/wk, {_num(wks)} wks/yr")
        grades = [g for g in (a.get("grade_levels") or []) if g]
        if grades:
            trailing.append("Grades " + ", ".join(str(g) for g in sorted(grades)))

        # Escape each part, then join with the raw LaTeX separator. Escaping the
        # joined string first would turn the "$|$" math delimiters into literal
        # "\$|\$" and print them as text.
        label = _escape_latex(head)
        if trailing:
            label += r" $|$ \small " + " $|$ ".join(_escape_latex(t) for t in trailing)
        out.append(rf"  \resumeEntry{{{label}}}")

        bullets = _description_bullets(a.get("description") or "")
        if bullets:
            out.append(r"    \resumeItemListStart")
            for b in bullets:
                out.append(rf"      \resumeItem{{{_escape_latex(b)}}}")
            out.append(r"    \resumeItemListEnd")
    out.append(r"\resumeSubHeadingListEnd")
    return "\n".join(out) + "\n"


def _awards_section(awards: list[dict]) -> str:
    if not awards:
        return ""
    out = [r"\section{Awards \& Honors}", r"\resumeSubHeadingListStart"]
    for w in awards:
        title = _escape_latex((w.get("title") or "").strip())
        meta = []
        level = AWARD_LEVEL_LABELS.get(w.get("level") or "")
        if level:
            meta.append(level)
        if w.get("year"):
            meta.append(str(w["year"]))
        suffix = f" ({_escape_latex(', '.join(meta))})" if meta else ""
        desc = _escape_latex((w.get("description") or "").strip())
        body = rf"\textbf{{{title}}}{suffix}" + (f": {desc}" if desc else "")
        out.append(rf"  \item\small{{{body}}}")
    out.append(r"\resumeSubHeadingListEnd")
    return "\n".join(out) + "\n"


def _num(v) -> str:
    """Drop a trailing .0 so "6.0 hrs/wk" reads as "6 hrs/wk"."""
    try:
        f = float(v)
        return str(int(f)) if f == int(f) else str(f)
    except (TypeError, ValueError):
        return str(v)


def build_resume_tex(name: str, contact: dict, selection: dict) -> str:
    """
    Build the .tex from the student's chosen pieces of their record.

    `selection` is already filtered to what they ticked and re-read server-side:
      {academics: {gpa_*}, courses: [...], scores: [...],
       activities: [...], awards: [...]}

    Sections with nothing selected are skipped entirely.
    """
    selection = selection or {}
    academics = selection.get("academics") or {}
    courses = selection.get("courses") or []
    scores = selection.get("scores") or []
    activities = selection.get("activities") or []
    awards = selection.get("awards") or []

    sections = [
        _academics_section(academics, courses, scores),
        _activities_section(activities),
        _awards_section(awards),
    ]
    if not any(sections):
        raise ValueError("Select at least one thing to include in your resume.")

    body = [LATEX_PREAMBLE, _header(name, contact or {})]
    body += [s for s in sections if s]
    body.append(r"\end{document}" + "\n")
    return "\n".join(body)


class PdfEngineUnavailable(RuntimeError):
    """The tectonic binary isn't on PATH (deploy/image problem, not a user error)."""


async def compile_tex_to_pdf(tex_source: str) -> bytes:
    """
    Compile with Tectonic in a temp dir. Raises ValueError (compile error, user-visible)
    or PdfEngineUnavailable (binary missing). Never leaves files behind.
    """
    with tempfile.TemporaryDirectory(prefix="resume-") as workdir:
        tex_path = os.path.join(workdir, "resume.tex")
        with open(tex_path, "w", encoding="utf-8") as fh:
            fh.write(tex_source)

        tectonic_bin = _tectonic_bin()
        try:
            proc = await asyncio.create_subprocess_exec(
                tectonic_bin, "--outdir", workdir, "--chatter", "minimal", tex_path,
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise PdfEngineUnavailable(f"tectonic binary not found at {tectonic_bin}") from exc

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=COMPILE_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise ValueError("PDF compile timed out. Please try again.")

        if proc.returncode != 0:
            tail = (stderr or stdout or b"").decode("utf-8", errors="replace").strip().splitlines()[-12:]
            logger.warning("[resume] tectonic failed:\n%s", "\n".join(tail))
            raise ValueError("Could not build the PDF from your portfolio. Check for unusual characters in your entries and try again.")

        pdf_path = os.path.join(workdir, "resume.pdf")
        if not os.path.exists(pdf_path):
            raise ValueError("PDF compile produced no output. Please try again.")
        with open(pdf_path, "rb") as fh:
            return fh.read()
