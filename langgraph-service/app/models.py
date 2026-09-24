"""
Every model id the service uses, and which task each one serves.

Model ids used to be scattered as literals across a dozen node modules, which
made "what are we actually paying for" an unanswerable question without a grep.
They live here now so a swap is one line and the cost of a change is visible.

Choosing per task rather than per provider: Anthropic where advising judgment
shows in the output a student reads, OpenAI's small tiers for the mechanical
extraction jobs where quality barely moves but cost moves a lot.
"""

# ── Anthropic ────────────────────────────────────────────────────────────────
# Sonnet 5 replaced Sonnet 4.6: $2/$10 per MTok against $3/$15. Note the list
# price is not the whole story, because Claude 4.7 and later tokenize to roughly
# 30% more tokens for the same text, so the real saving is nearer 13% than 33%.
SONNET = "claude-sonnet-5"
HAIKU  = "claude-haiku-4-5-20251001"

# ── OpenAI ───────────────────────────────────────────────────────────────────
# $0.25/$2 and $0.05/$0.40 per MTok. Both are used only through
# app.llm.json_completion, which falls back to Anthropic when no key is set.
GPT_MINI = "gpt-5-mini"
GPT_NANO = "gpt-5-nano"

# ── Per-task assignments ─────────────────────────────────────────────────────
# Student-facing, judgment-heavy. Stays on Anthropic.
CHAT_MODEL              = SONNET
INTERVIEW_MODEL         = SONNET
INTAKE_EXTRACTION_MODEL = SONNET

# Mechanical extraction. OpenAI first, Anthropic as the fallback if the key is
# missing or the call fails, so neither job can be taken out by one provider.
PORTFOLIO_UPLOAD_MODEL    = GPT_MINI
PORTFOLIO_UPLOAD_FALLBACK = HAIKU

# Background memory: one sentence into a JSON blob, never shown as prose.
# The cheapest tier available is the right call here.
CHAT_SIGNALS_MODEL    = GPT_NANO
CHAT_SIGNALS_FALLBACK = HAIKU

# Quest. The plan, the suggestions and the portfolio draft happen a few times
# per quest and shape everything after them, so they get the stronger model.
# The daily task and the check-in reply run every day for every active student,
# so they get the cheap one. Haiku rather than gpt-5-mini: mini's reasoning
# tokens make its saving unproven (scripts/check_openai.py), and these are
# short replies a student reads, where Haiku is plenty.
QUEST_PLAN_MODEL    = SONNET
QUEST_SUGGEST_MODEL = SONNET
QUEST_DRAFT_MODEL   = SONNET
QUEST_TASK_MODEL    = HAIKU
QUEST_CHECKIN_MODEL = HAIKU
