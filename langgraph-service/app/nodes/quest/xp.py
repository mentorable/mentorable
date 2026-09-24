"""
Quest XP and levels. The single source of truth for every number: the database
function that awards XP takes these as arguments rather than repeating them.

Flat on purpose. Every task is worth the same, whatever its size, so nobody is
pushed toward a bigger daily budget just to earn faster, and catch-up tasks pay
in full so clearing a backlog feels worth doing.
"""

TASK_XP = 10
FOLLOWUP_XP = 5
MILESTONE_XP = 50
QUEST_XP = 150


def level_floor(level: int) -> int:
    """Total XP needed to reach `level`. Level 1 is where everyone starts.

    Level n+1 needs 25 * n * (n + 1): 50, 150, 300, 500, 750, ... so a steady
    student levels up about weekly at first and every week or two after that.
    """
    n = max(0, level - 1)
    return 25 * n * (n + 1)


def level_for(xp: int) -> int:
    xp = max(0, int(xp or 0))
    level = 1
    while level_floor(level + 1) <= xp:
        level += 1
    return level


def level_progress(xp: int) -> dict:
    xp = max(0, int(xp or 0))
    level = level_for(xp)
    floor, nxt = level_floor(level), level_floor(level + 1)
    return {
        "xp": xp,
        "level": level,
        "into_level": xp - floor,
        "level_span": nxt - floor,
        "next_level_at": nxt,
    }
