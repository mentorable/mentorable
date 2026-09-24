/**
 * Feature flags for the college application pivot.
 *
 * Quest is live again, rebuilt from scratch as a daily-streak loop: one
 * project, a small task every scheduled day. It shares nothing with the old
 * career-era quest board but the name.
 *
 * Roadmap and Research were built for career guidance and need a real redesign
 * for the college domain (the roadmap becomes an application timeline). They
 * stay parked rather than half-migrated, so they aren't rewired twice.
 *
 * The Scorecard's 5 career axes don't map to admissions at all, so it's off
 * entirely rather than parked.
 *
 * See .claude/COLLEGE_PIVOT.md and .claude/QUEST_PLAN.md.
 */
export const FEATURES = {
  quest:     true,
  roadmap:   false,
  research:  false,
  scorecard: false,
  chat:      true,
  portfolio: true,
};

export const isEnabled = (key) => FEATURES[key] !== false;

/**
 * Where a returning student lands after login: today's quest step, since the
 * daily habit is what brings them back.
 */
export const HOME_PATH = "/quest";

/**
 * Where a student lands the moment onboarding finishes.
 *
 * The portfolio, not chat: it is the record everything else reasons from, so
 * the first thing a student should see is their own profile taking shape, and
 * anything the interview left thin is visible and fixable right there.
 */
export const POST_ONBOARDING_PATH = "/portfolio";
