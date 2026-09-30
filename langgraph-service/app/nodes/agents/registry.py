"""
The agents: playful specialists on the Agents page, each with its own screen,
its own prompt and its own budgets. This is the backend's list of them.

A budget is (period, limit): "total" is a lifetime cap (the demo's two tries,
no monthly reset), "day" resets at midnight UTC. Not the student's own
midnight: profiles.timezone is theirs to edit, and moving it would start a new
day, so a daily cap counted in it could be spent several times over in one.
usage.py spends and refunds them; the counts live in agent_usage.

Adding an agent is one entry here, plus its package under app/nodes/agents/.
The frontend keeps its own registry (src/lib/agents/registry.js) for the
mascot, the copy and the "coming soon" teasers.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentSpec:
    id: str
    name: str
    enabled: bool
    budgets: dict[str, tuple[str, int]]


AGENTS: dict[str, AgentSpec] = {
    # Beaker the pelican: researches a professor or professional, drafts a
    # sourced email, and sends it through the student's own Gmail.
    # A try is one recipient start to finish; sends count first emails and
    # follow-ups together. A search is one paid research run (a shortlist, or
    # researching a person). A try is given back when its research fails, but
    # the search it ran is not: that caps what failed retries can cost. Two
    # tries need at most four; the rest covers a few honest retries.
    # A write is every other paid model call: a rewrite or a follow-up draft.
    # Each card has its own caps (3 of each), but students can add cards by
    # hand, and a rewrite can be made to fail on purpose, so the per-card counts
    # (given back when the model's answer is unusable) cannot bound the spend.
    # A write is taken before the call and never given back, so a failure
    # cannot be repeated for free. Two agent cards need at most 12.
    "outreach": AgentSpec("outreach", "Beaker", True,
                          {"try": ("total", 2), "search": ("total", 8), "write": ("total", 20),
                           "send": ("day", 5)}),
}


def get_agent(agent_id: str) -> AgentSpec:
    """The agent's spec. KeyError if there is no such agent."""
    return AGENTS[agent_id]
