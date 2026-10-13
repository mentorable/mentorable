"""
Quill, the essay owl: a place to find what to write about and to get feedback
on a draft of the personal statement or a supplement.

The promise: Quill asks, points and flags. It never writes, rewrites, corrects
or edits any part of an essay, never comments on spelling, grammar or word
choice, and never predicts an outcome. It looks nothing up: no search and no
page fetching, so nothing here imports search_pool or pages.

rules.py keeps that promise in code (pure, no I/O, no clock, no model): every
line a model writes is checked there before a student sees it. prompts.py
holds every prompt and tool schema; talk.py (the guided brainstorm), topics.py
(areas from the record) and review.py (feedback on a draft) each make one kind
of model call and know nothing of the database; service.py (the database, the
budgets and the caps) and the router sit on top.
"""
