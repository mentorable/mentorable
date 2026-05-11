export const OUR_MIND_ZONE_META = {
  self: {
    label: "How Mentorable Sees You",
    shortLabel: "You",
    color: "#2563eb",
    tint: "rgba(37,99,235,0.08)",
    border: "rgba(147,197,253,0.7)",
  },
  behavior: {
    label: "How I Should Help",
    shortLabel: "Agent",
    color: "#6d28d9",
    tint: "rgba(109,40,217,0.08)",
    border: "rgba(196,181,253,0.8)",
  },
  week: {
    label: "This Week",
    shortLabel: "Week",
    color: "#7c3aed",
    tint: "rgba(124,58,237,0.08)",
    border: "rgba(221,214,254,0.9)",
  },
  opportunities: {
    label: "Opportunities & Deadlines",
    shortLabel: "Deadlines",
    color: "#059669",
    tint: "rgba(5,150,105,0.08)",
    border: "rgba(167,243,208,0.95)",
  },
  memory: {
    label: "Brain Growth",
    shortLabel: "Memory",
    color: "#d97706",
    tint: "rgba(217,119,6,0.08)",
    border: "rgba(253,230,138,0.95)",
  },
};

export const OUR_MIND_NODE_META = {
  understanding: {
    label: "AI View",
    color: "#2563eb",
    bg: "#ffffff",
    border: "#bfdbfe",
    text: "#0f172a",
    subText: "#475569",
    width: 330,
    minHeight: 164,
    zone: "self",
  },
  identity: {
    label: "Identity",
    color: "#0f766e",
    bg: "#ffffff",
    border: "#99f6e4",
    text: "#0f172a",
    subText: "#475569",
    width: 270,
    minHeight: 128,
    zone: "self",
  },
  goal: {
    label: "North Star",
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#93c5fd",
    text: "#0f172a",
    subText: "#475569",
    width: 258,
    minHeight: 118,
    zone: "self",
  },
  behavior: {
    label: "Agent Mode",
    color: "#6d28d9",
    bg: "#faf5ff",
    border: "#d8b4fe",
    text: "#0f172a",
    subText: "#581c87",
    width: 270,
    minHeight: 124,
    zone: "behavior",
  },
  task: {
    label: "Mission",
    color: "#7c3aed",
    bg: "#fcfaff",
    border: "#ddd6fe",
    text: "#0f172a",
    subText: "#5b21b6",
    width: 248,
    minHeight: 110,
    zone: "week",
  },
  opportunity: {
    label: "Opportunity",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
    text: "#0f172a",
    subText: "#166534",
    width: 274,
    minHeight: 120,
    zone: "opportunities",
  },
  memory: {
    label: "Memory",
    color: "#d97706",
    bg: "#fffaf0",
    border: "#fcd34d",
    text: "#0f172a",
    subText: "#92400e",
    width: 264,
    minHeight: 118,
    zone: "memory",
  },
  question: {
    label: "Open Loop",
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fdba74",
    text: "#0f172a",
    subText: "#9a3412",
    width: 252,
    minHeight: 118,
    zone: "self",
  },
  correction: {
    label: "Correction",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    text: "#0f172a",
    subText: "#991b1b",
    width: 268,
    minHeight: 116,
    zone: "self",
  },
  note: {
    label: "Note",
    color: "#475569",
    bg: "#ffffff",
    border: "#cbd5e1",
    text: "#0f172a",
    subText: "#475569",
    width: 248,
    minHeight: 112,
    zone: "memory",
  },
};

export const OUR_MIND_TYPE_ORDER = [
  "understanding",
  "identity",
  "goal",
  "behavior",
  "task",
  "opportunity",
  "memory",
  "question",
  "correction",
  "note",
];

export const OUR_MIND_ZONE_ORDER = ["self", "behavior", "week", "opportunities", "memory"];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function priorityWeight(priority) {
  return { high: 3, medium: 2, low: 1 }[String(priority || "").toLowerCase()] || 0;
}

function sortMissions(a, b) {
  const dueA = daysUntil(a?.data?.dueDate);
  const dueB = daysUntil(b?.data?.dueDate);
  if (dueA !== null && dueB !== null && dueA !== dueB) return dueA - dueB;
  if (dueA !== null && dueB === null) return -1;
  if (dueA === null && dueB !== null) return 1;
  return priorityWeight(b?.data?.priority) - priorityWeight(a?.data?.priority);
}

export function boardHasContent(board) {
  return Array.isArray(board?.nodes) && board.nodes.length > 0;
}

export function getNodeZone(node) {
  return clean(node?.data?.zone) || OUR_MIND_NODE_META[node?.type]?.zone || "memory";
}

export function formatDueLabel(value) {
  const date = parseDate(value);
  if (!date) return "";
  const diff = daysUntil(date.toISOString());
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff !== null && diff > 1 && diff < 7) return `Due in ${diff} days`;
  if (diff !== null && diff < 0) return `Past due ${Math.abs(diff)}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function summarizeOurMindBoard(board) {
  const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
  const byType = Object.fromEntries(OUR_MIND_TYPE_ORDER.map((type) => [type, []]));
  const byZone = Object.fromEntries(OUR_MIND_ZONE_ORDER.map((zone) => [zone, []]));

  for (const node of nodes) {
    const type = node?.type;
    if (byType[type]) byType[type].push(node);
    const zone = getNodeZone(node);
    if (byZone[zone]) byZone[zone].push(node);
  }

  const tasks = [...(byType.task || [])].sort(sortMissions);
  const opportunities = [...(byType.opportunity || [])].sort(sortMissions);
  const dueSoon = [...tasks, ...opportunities]
    .filter((node) => {
      const diff = daysUntil(node?.data?.dueDate);
      return diff !== null && diff <= 7 && diff >= 0;
    })
    .sort(sortMissions)
    .slice(0, 4);

  const memories = (byType.memory || []).slice(-4).reverse();
  const aiView = (byType.understanding || []).slice(0, 2).map((node) => clean(node?.data?.label));
  const signals = (byType.identity || []).slice(0, 4).map((node) => clean(node?.data?.label));
  const behaviors = (byType.behavior || []).slice(0, 3).map((node) => clean(node?.data?.label));
  const openQuestions = (byType.question || []).slice(0, 3).map((node) => clean(node?.data?.label));

  return {
    counts: Object.fromEntries(Object.entries(byType).map(([type, items]) => [type, items.length])),
    zoneCounts: Object.fromEntries(Object.entries(byZone).map(([zone, items]) => [zone, items.length])),
    aiView,
    signals,
    behaviors,
    openQuestions,
    tasks,
    opportunities,
    dueSoon,
    memories,
    openTaskCount: tasks.filter((node) => !node?.data?.done).length,
    taskCount: tasks.length,
    urgentCount: dueSoon.length,
  };
}

export function buildOurMindPromptSection(board) {
  const summary = summarizeOurMindBoard(board);
  const sections = [];

  if (summary.aiView.length) sections.push(`Current read: ${summary.aiView.join("; ")}`);
  if (summary.signals.length) sections.push(`Identity signals: ${summary.signals.join("; ")}`);
  if (summary.behaviors.length) sections.push(`How to help: ${summary.behaviors.join("; ")}`);
  if (summary.tasks.length) {
    const topTasks = summary.tasks
      .filter((node) => !node?.data?.done)
      .slice(0, 3)
      .map((node) => {
        const due = formatDueLabel(node?.data?.dueDate);
        return due ? `${clean(node?.data?.label)} (${due})` : clean(node?.data?.label);
      });
    if (topTasks.length) sections.push(`This week: ${topTasks.join("; ")}`);
  }
  if (summary.opportunities.length) {
    const topOpps = summary.opportunities.slice(0, 2).map((node) => {
      const due = formatDueLabel(node?.data?.dueDate);
      return due ? `${clean(node?.data?.label)} (${due})` : clean(node?.data?.label);
    });
    if (topOpps.length) sections.push(`Opportunity radar: ${topOpps.join("; ")}`);
  }
  if (summary.openQuestions.length) sections.push(`Open loops: ${summary.openQuestions.join("; ")}`);

  return sections.length
    ? `## Our Mind\n${sections.map((line) => `- ${line}`).join("\n")}`
    : "";
}

export function deriveFallbackSnapshot(profile) {
  return {
    strengths: toList(profile?.strengths),
    interests: toList(profile?.interests),
    careers: toList(profile?.career_matches),
    motivations: toList(profile?.motivations),
    concerns: clean(profile?.biggest_concern),
    summary: clean(profile?.onboarding_summary),
    workStyle: clean(profile?.work_style),
    personality: toList(profile?.personality_signals),
    ownWords: toList(profile?.own_words_keywords),
  };
}
