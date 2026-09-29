"""
Long-term memory: what a student has said, in their own words, found again
when it matters.

  * embed.py     the one OpenAI call (text-embedding-3-small); no key, no memory
  * safety.py    what is never saved: thin lines and serious disclosures
  * store.py     saving (chat, check-ins, follow-up answers), the per-student cap
  * retrieve.py  the search, and how recalled memories are shown to a model
  * rank.py      the search's tuning constants, and a Python mirror of its
                 scoring for the offline eval (production ranks in SQL:
                 public.recall_memories)

The student controls it from Profile: they can read every memory, delete any or
all of them, and turn memory off (profiles.memory_enabled). Off means nothing
new is saved and nothing is recalled.
"""
