/**
 * Feature flags for the college application pivot.
 *
 * Quest, Roadmap and Research were built for career guidance and need a real
 * redesign for the college domain (quests become application tasks, the roadmap
 * becomes an application timeline). They stay parked rather than half-migrated,
 * so they aren't rewired twice.
 *
 * The Scorecard's 5 career axes don't map to admissions at all, so it's off
 * entirely rather than parked.
 *
 * See .claude/COLLEGE_PIVOT.md.
 */
export const FEATURES = {
  quest:     false,
  roadmap:   false,
  research:  false,
  scorecard: false,
  chat:      true,
  portfolio: true,
};

export const isEnabled = (key) => FEATURES[key] !== false;

/** Where a student lands after login and after finishing onboarding. */
export const HOME_PATH = "/chat";
