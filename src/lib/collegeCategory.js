// How College List suggests reach, target or likely for a school.
//
// A plain rule, not a model: the student's best SAT or ACT against the school's
// published middle 50%, and the school's admit rate. It says why in one line,
// so a student can see the reasoning and disagree with it. No imports, so the
// rule can be checked on its own.

export const CATEGORIES = ["reach", "target", "likely"];

// The cut-offs, in one place so they are easy to tune.
export const RULES = {
  // Admitting fewer than 1 in 5 makes a school a reach for everyone, whatever
  // their scores. This is the common counseling rule of thumb.
  reachBelowAdmit: 0.20,
  // Scoring above the middle 50% makes it likely at a school admitting at least half.
  likelyAboveRangeAdmit: 0.50,
  // Scoring inside the middle 50% makes it likely only at a school admitting 3 in 4.
  likelyInRangeAdmit: 0.75,
  // Without a score to compare, a GPA this high (on a 4.0 scale) at a school
  // admitting at least half is a rough "likely".
  roughLikelyGpa: 3.3,
  // Without a score or a GPA, a rough "likely" needs an admit rate this high.
  roughLikelyAdmit: 0.75,
};

// ── The student's side ──────────────────────────────────────────────────────

// A 100-point average to the usual 4.0 letter-grade bands.
function hundredToFour(g) {
  if (g >= 93) return 4.0;
  if (g >= 90) return 3.7;
  if (g >= 87) return 3.3;
  if (g >= 83) return 3.0;
  if (g >= 80) return 2.7;
  if (g >= 77) return 2.3;
  if (g >= 73) return 2.0;
  if (g >= 70) return 1.7;
  return 1.0;
}

/** Their unweighted GPA on a 4.0 scale, or null. A missing or "other" scale is
 *  read from the number itself, since most students on a 4.0 never say so. */
export function gpaOnFour(gpa, scale) {
  const g = Number(gpa);
  if (gpa === null || gpa === undefined || gpa === "" || !Number.isFinite(g) || g <= 0) return null;
  if (scale === "not_used") return null;
  if (scale === "4.0") return g <= 4.0 ? g : null;
  if (scale === "5.0") return g <= 5.0 ? (g / 5) * 4 : null;
  if (scale === "100") return g <= 100 ? hundredToFour(g) : null;
  if (g <= 4.0) return g;
  if (g <= 5.0) return (g / 5) * 4;
  if (g <= 100) return hundredToFour(g);
  return null;
}

/** Their best SAT and ACT on file, and GPA on a 4.0 scale. */
export function studentStats(profile, testScores) {
  const best = (type, min, max) => {
    const scores = (testScores || [])
      .filter((t) => (t.test_type || "").toLowerCase() === type)
      .map((t) => Number(t.score))
      .filter((n) => Number.isFinite(n) && n >= min && n <= max);
    return scores.length ? Math.max(...scores) : null;
  };
  return {
    sat: best("sat", 400, 1600),
    act: best("act", 1, 36),
    gpa: gpaOnFour(profile?.gpa_unweighted, profile?.gpa_scale),
  };
}

// ── The rule ────────────────────────────────────────────────────────────────

const pct = (rate) => `${Math.round(rate * 100)}%`;

// Where a score sits against a school's middle 50%.
function position(score, low, high) {
  if (score === null || low === null || low === undefined || high === null || high === undefined) return null;
  if (score < low) return "below";
  if (score > high) return "above";
  return "within";
}

const RANK = { below: 0, within: 1, above: 2 };

/** The student's strongest comparison: their SAT or ACT, whichever sits
 *  higher in that school's range. Students send their best test. */
function bestComparison(stats, school) {
  const options = [
    { test: "SAT", score: stats.sat, low: school.sat_25, high: school.sat_75 },
    { test: "ACT", score: stats.act, low: school.act_25, high: school.act_75 },
  ]
    .map((o) => ({ ...o, pos: position(o.score, o.low, o.high) }))
    .filter((o) => o.pos);
  if (!options.length) return null;
  return options.sort((a, b) => RANK[b.pos] - RANK[a.pos])[0];
}

/**
 * The suggested category for a school, with its reason, or null when there is
 * nothing to go on (no admit rate published): then the student picks.
 *
 * Returns { category, source, reason } where source is "suggested" (scores
 * compared, or an admit rate that settles it alone) or "rough" (admit rate and
 * GPA only).
 */
export function suggestCategory(stats, school) {
  const admit = school.admission_rate;
  if (admit === null || admit === undefined) return null;

  if (admit >= 1) {
    return { category: "likely", source: "suggested", reason: "Open admission: they admit everyone who applies." };
  }
  if (admit < RULES.reachBelowAdmit) {
    return {
      category: "reach", source: "suggested",
      reason: `They admit ${pct(admit)}. Under 20% is a reach for everyone, whatever the scores.`,
    };
  }

  const cmp = bestComparison(stats, school);
  if (cmp) {
    const range = `${cmp.low}-${cmp.high}`;
    if (cmp.pos === "below") {
      return {
        category: "reach", source: "suggested",
        reason: `Your ${cmp.test} ${cmp.score} is below their middle 50% (${range}).`,
      };
    }
    if (cmp.pos === "above") {
      return admit >= RULES.likelyAboveRangeAdmit
        ? { category: "likely", source: "suggested",
            reason: `Your ${cmp.test} ${cmp.score} is above their middle 50% (${range}), and they admit ${pct(admit)}.` }
        : { category: "target", source: "suggested",
            reason: `Your ${cmp.test} ${cmp.score} is above their middle 50% (${range}), but they admit only ${pct(admit)}.` };
    }
    return admit >= RULES.likelyInRangeAdmit
      ? { category: "likely", source: "suggested",
          reason: `Your ${cmp.test} ${cmp.score} is in their middle 50% (${range}), and they admit ${pct(admit)}.` }
      : { category: "target", source: "suggested",
          reason: `Your ${cmp.test} ${cmp.score} is in their middle 50% (${range}), and they admit ${pct(admit)}.` };
  }

  // Nothing to compare: no score on file, or no range published for the one
  // they have. The admit rate carries it; GPA only decides the likely line.
  const why = (stats.sat !== null || stats.act !== null)
    ? "They publish no score range to compare with yours"
    : "No SAT or ACT on file to compare";
  if (stats.gpa !== null) {
    const likely = admit >= RULES.likelyAboveRangeAdmit && stats.gpa >= RULES.roughLikelyGpa;
    return {
      category: likely ? "likely" : "target", source: "rough",
      reason: `Rough guess. ${why}, so this goes on their ${pct(admit)} admit rate and your GPA.`,
    };
  }
  return {
    category: admit >= RULES.roughLikelyAdmit ? "likely" : "target", source: "rough",
    reason: `Rough guess. ${why}, so this goes on their ${pct(admit)} admit rate alone.`,
  };
}

/** The one line shown under a school on the list. */
export function explainItem(item, stats) {
  if (item.category_source === "student") return "You set this.";
  return suggestCategory(stats, item)?.reason || "";
}

// ── The list as a whole ─────────────────────────────────────────────────────

/** Counts by category, and at most one plain note about the balance. A list
 *  too low is as much a problem as one too high, so both directions count. */
export function balance(items) {
  const n = { reach: 0, target: 0, likely: 0 };
  for (const it of items) if (n[it.category] !== undefined) n[it.category] += 1;
  const total = n.reach + n.target + n.likely;
  let note = null;
  if (total >= 3 && n.likely === 0) {
    note = "Add a likely school or two: places you would be glad to attend that admit most students with scores like yours.";
  } else if (total >= 4 && n.reach > n.target + n.likely) {
    note = "Most of this list is reaches. A few more targets would give you real choices in the spring.";
  } else if (total >= 4 && n.target < 2) {
    note = "Consider a couple more targets, schools where your scores fit the students they admit.";
  } else if (total >= 5 && n.reach === 0) {
    note = "No reaches yet. If your record is strong, a reach or two can be worth it, and selective schools with good aid sometimes cost less than you would expect.";
  }
  return { ...n, total, note };
}
