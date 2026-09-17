"""
Portfolio -> PDF resume.

Builds a LaTeX document in the style of "Jake's Resume" (the widely used
single-column, ATS-friendly template) from the student's portfolio_items and
contact info, then compiles it with Tectonic. No AI involved: this is pure
formatting, so the only cost is the compile itself.

Tectonic is XeTeX-based, so the pdfTeX-only bits of the original template
(\\pdfgentounicode, glyphtounicode) are intentionally left out.
"""
import asyncio
import logging
import os
import re
import tempfile

logger = logging.getLogger(__name__)

# Mirrors CATEGORIES order on the frontend so the resume reads top-to-bottom
# the same way the Portfolio page does.
CATEGORY_ORDER = ["experience", "project", "volunteering", "award", "course", "certification", "club", "skill", "other"]
CATEGORY_HEADINGS = {
    "experience":    "Experience",
    "project":       "Projects",
    "volunteering":  "Volunteering",
    "award":         "Awards",
    "course":        "Coursework",
    "certification": "Certifications",
    "club":          "Clubs \\& Leadership",
    "skill":         "Skills",
    "other":         "Additional",
}

COMPILE_TIMEOUT_SECONDS = 150  # first compile on a fresh container downloads packages

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


def _section(category: str, items: list[dict]) -> str:
    heading = CATEGORY_HEADINGS.get(category, category.title())
    out = [rf"\section{{{heading}}}", r"\resumeSubHeadingListStart"]

    if category == "skill":
        titles_only = all(not (it.get("description") or "").strip() for it in items)
        if titles_only:
            joined = ", ".join(_escape_latex(it.get("title") or "") for it in items)
            out.append(rf"  \item\small{{{joined}}}")
        else:
            for it in items:
                title = _escape_latex(it.get("title") or "")
                desc = _escape_latex((it.get("description") or "").strip())
                out.append(rf"  \item\small{{\textbf{{{title}}}{': ' + desc if desc else ''}}}")
        out.append(r"\resumeSubHeadingListEnd")
        return "\n".join(out) + "\n"

    for it in items:
        out.append(rf"  \resumeEntry{{{_escape_latex(it.get('title') or '')}}}")
        bullets = _description_bullets(it.get("description") or "")
        if bullets:
            out.append(r"    \resumeItemListStart")
            for b in bullets:
                out.append(rf"      \resumeItem{{{_escape_latex(b)}}}")
            out.append(r"    \resumeItemListEnd")
    out.append(r"\resumeSubHeadingListEnd")
    return "\n".join(out) + "\n"


def build_resume_tex(name: str, contact: dict, items: list[dict]) -> str:
    """
    items: portfolio_items rows (category, title, description). Already filtered
    to what the student selected. Grouped by category in the page's fixed order;
    categories with no items are skipped entirely.
    """
    if not items:
        raise ValueError("Select at least one portfolio item to export.")

    by_cat: dict[str, list[dict]] = {}
    for it in items:
        cat = it.get("category") if it.get("category") in CATEGORY_HEADINGS else "other"
        by_cat.setdefault(cat, []).append(it)

    body = [LATEX_PREAMBLE, _header(name, contact or {})]
    for cat in CATEGORY_ORDER:
        if by_cat.get(cat):
            body.append(_section(cat, by_cat[cat]))
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

        try:
            proc = await asyncio.create_subprocess_exec(
                "tectonic", "--outdir", workdir, "--chatter", "minimal", tex_path,
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise PdfEngineUnavailable("tectonic is not installed on this server") from exc

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
