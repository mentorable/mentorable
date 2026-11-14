"""
Poise, the interview heron: a mock interview by voice for a college (alumni
or admissions) interview or an internship, summer program or job interview,
then written feedback on each answer with a 1 to 5 rubric score.

The promise: Poise practises with the student and points to their own words.
It never writes an answer for them, never predicts an admission or an offer,
and keeps what they said private to them. It looks nothing up: nothing here
imports search_pool or pages, and no prompt states a fact about any school or
organization.

rules.py keeps that promise in code (pure, no I/O, no clock, no model): every
quote a model hands back must be the student's own words, and every line it
writes is checked before a student sees it. prompts.py holds the interviewer
prompt the voice agent runs on and the feedback prompt and its schema;
feedback.py makes the one feedback call and knows nothing of the database;
elevenlabs.py is the only module that talks to ElevenLabs (a signed URL, the
finished conversation, its deletion) and never logs what was said;
service.py (the database, the budgets, the give-backs) and the router sit on
top.
"""
