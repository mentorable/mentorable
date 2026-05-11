type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export type OurMindNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, Json>
}

export type OurMindEdge = {
  id: string
  source: string
  target: string
  label?: string
  data?: Record<string, Json>
}

type StudentProfile = Record<string, any>

const GRID = {
  selfMain: { x: -420, y: -30 },
  selfStack: { x: -420, y: 165 },
  behaviorMain: { x: 50, y: -35 },
  behaviorStack: { x: 60, y: 160 },
  weekMain: { x: -420, y: 395 },
  weekStack: { x: -135, y: 395 },
  oppMain: { x: 210, y: 392 },
  oppStack: { x: 500, y: 392 },
  memoryMain: { x: -25, y: 645 },
  memoryStack: { x: 260, y: 645 },
}

const CONFIDENCE_VALUES = new Set(["low", "medium", "high"])
const STATUS_VALUES = new Set(["active", "proposed", "done", "paused"])
const SOURCE_VALUES = new Set(["ai", "user", "onboarding", "chat", "research"])
const PRIORITY_VALUES = new Set(["low", "medium", "high"])
const ZONE_VALUES = new Set(["self", "behavior", "week", "opportunities", "memory"])

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function nodeId(type: string, label: string, index: number) {
  return `mind-${type}-${slug(label) || index}-${index}`
}

function edgeId(source: string, target: string, index: number) {
  return `edge-${source}-${target}-${index}`
}

function nextDate(daysFromNow: number) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return date.toISOString()
}

function anchorPosition(anchor: string, offset: number) {
  const base = GRID[anchor as keyof typeof GRID] || GRID.memoryMain
  const horizontal = anchor.endsWith("Stack")
  return {
    x: base.x + (horizontal ? offset * 290 : 0),
    y: base.y + (horizontal ? 0 : offset * 182),
  }
}

function zoneForType(type: string) {
  return (
    {
      understanding: "self",
      identity: "self",
      goal: "self",
      question: "self",
      correction: "self",
      behavior: "behavior",
      task: "week",
      opportunity: "opportunities",
      memory: "memory",
      note: "memory",
    }[type] || "memory"
  )
}

function taskBodyFromCareer(career: string) {
  return `Spend 20 minutes pressure-testing whether ${career} still feels exciting, realistic, and genuinely yours.`
}

export function buildFallbackBoard(profile: StudentProfile) {
  const strengths = list(profile?.strengths).slice(0, 3)
  const interests = list(profile?.interests).slice(0, 3)
  const careers = list(profile?.career_matches).slice(0, 3)
  const motivations = list(profile?.motivations).slice(0, 3)
  const personality = list(profile?.personality_signals).slice(0, 3)
  const ownWords = list(profile?.own_words_keywords).slice(0, 3)
  const summary = text(profile?.onboarding_summary)
  const workStyle = text(profile?.work_style)
  const concern = text(profile?.biggest_concern)
  const confidence = text(profile?.self_confidence_level)

  const nodes: OurMindNode[] = []
  const edges: OurMindEdge[] = []

  const pushNode = (
    type: string,
    label: string,
    body: string,
    anchor: string,
    offset: number,
    extra: Record<string, Json> = {},
  ) => {
    const id = nodeId(type, label, nodes.length + 1)
    const zone = text(extra.zone) || zoneForType(type)
    nodes.push({
      id,
      type,
      position: anchorPosition(anchor, offset),
      data: {
        label,
        body,
        zone,
        source: extra.source ?? "ai",
        confidence: extra.confidence ?? "medium",
        status: extra.status ?? (type === "task" ? "active" : "proposed"),
        priority: extra.priority ?? (type === "task" ? "high" : "medium"),
        tags: extra.tags ?? [],
        ...extra,
      },
    })
    return id
  }

  const centerId = pushNode(
    "understanding",
    "What Mentorable sees right now",
    summary || "Mentorable is building a living read of this student and translating it into momentum, structure, and better next moves.",
    "selfMain",
    0,
    { source: "onboarding", confidence: "high", priority: "high", tags: ["core-read", "starting-point"] },
  )

  const identityIds = [
    strengths[0]
      ? pushNode("identity", strengths[0], "A strength that already seems real, not hypothetical.", "selfStack", 0, { tags: ["strength"], confidence: "high" })
      : null,
    interests[0]
      ? pushNode("identity", interests[0], "An interest that keeps showing up with energy.", "selfStack", 1, { tags: ["interest"], confidence: "high" })
      : null,
    workStyle
      ? pushNode("identity", "How you work best", workStyle, "selfStack", 2, { tags: ["work-style"], confidence: "medium" })
      : null,
  ].filter(Boolean) as string[]

  const questionId = pushNode(
    "question",
    concern ? "What needs reassurance?" : "What still needs proving?",
    concern || "Mentorable should keep testing where curiosity is strongest and where confidence still needs support.",
    "selfStack",
    identityIds.length,
    { tags: ["open-loop"], confidence: concern ? "high" : "medium" },
  )

  const behaviorIds = [
    pushNode(
      "behavior",
      confidence === "low" ? "Give structure and reassurance" : "Keep the pressure helpful",
      confidence === "low"
        ? "Use smaller steps, reduce overwhelm, and keep showing proof that progress is happening."
        : "Be direct, specific, and momentum-focused without losing warmth.",
      "behaviorMain",
      0,
      { source: "onboarding", priority: "high", tags: ["agent-behavior"] },
    ),
    motivations[0]
      ? pushNode("behavior", `Bias help toward ${motivations[0]}`, "When choices compete, favor the path that fits what this student actually values.", "behaviorStack", 0, {
          source: "ai",
          tags: ["motivation"],
        })
      : null,
    pushNode(
      "behavior",
      "Celebrate visible wins",
      "Keep the brain feeling alive by turning progress into something the student can see and feel each week.",
      "behaviorStack",
      1,
      { source: "ai", tags: ["momentum"] },
    ),
  ].filter(Boolean) as string[]

  const taskSeeds = [
    careers[0] ? `Pressure-test ${careers[0]}` : "Write the kind of future that sounds exciting",
    interests[0] ? `Collect 3 real examples around ${interests[0]}` : "Collect 3 paths that feel genuinely interesting",
    motivations[0] ? `Name moments when ${motivations[0]} mattered` : "List what a good future needs to include",
  ]

  const taskIds = taskSeeds.map((label, index) =>
    pushNode("task", label, careers[index] ? taskBodyFromCareer(careers[index]) : "A lightweight mission that sharpens what Mentorable should believe next.", index === 0 ? "weekMain" : "weekStack", index === 0 ? 0 : index - 1, {
      status: "active",
      priority: index === 0 ? "high" : "medium",
      dueDate: nextDate(index + 1),
      tags: ["weekly-mission"],
    }),
  )

  const opportunityIds = careers.slice(0, 2).map((career, index) =>
    pushNode(
      "opportunity",
      `${career} opportunity hunt`,
      `Find one real competition, program, scholarship, or internship connected to ${career}.`,
      index === 0 ? "oppMain" : "oppStack",
      index === 0 ? 0 : index - 1,
      {
        source: "ai",
        status: "active",
        priority: "medium",
        dueDate: nextDate(index === 0 ? 5 : 10),
        tags: ["opportunity-radar"],
      },
    ),
  )

  const memoryIds = [
    ownWords[0]
      ? pushNode("memory", `You said: "${ownWords[0]}"`, "Keep this exact phrase in the brain because it sounds like a true signal, not filler.", "memoryMain", 0, {
          source: "onboarding",
          confidence: "high",
          tags: ["own-words"],
        })
      : null,
    personality[0]
      ? pushNode("memory", `${personality[0]} energy`, "A pattern Mentorable should keep checking as more evidence comes in.", "memoryStack", 0, {
          source: "onboarding",
          tags: ["pattern"],
        })
      : null,
    pushNode(
      "correction",
      "Teach Mentorable if this is off",
      "Change anything that feels wrong, flat, or incomplete so the brain gets sharper over time.",
      "memoryStack",
      1,
      { source: "user", confidence: "high", status: "active", priority: "high", zone: "memory", tags: ["feedback"] },
    ),
  ].filter(Boolean) as string[]

  const connect = (source: string, target: string, label?: string) => {
    edges.push({ id: edgeId(source, target, edges.length + 1), source, target, label })
  }

  for (const id of identityIds) connect(centerId, id, "signal")
  connect(centerId, questionId, "watch")
  for (const id of behaviorIds) connect(centerId, id, "guide")
  for (const id of taskIds) connect(centerId, id, "do next")
  for (const id of opportunityIds) connect(centerId, id, "track")
  for (const id of memoryIds) connect(centerId, id, "remember")

  return { nodes, edges }
}

export function normalizeBoardPayload(payload: any, fallback: { nodes: OurMindNode[]; edges: OurMindEdge[] }) {
  if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) return fallback

  const nodes: OurMindNode[] = payload.nodes
    .map((node: any, index: number) => {
      const type = text(node?.type) || "note"
      const label = text(node?.label || node?.title) || `Untitled ${index + 1}`
      const body = text(node?.body || node?.description)
      const anchor = text(node?.anchor) || "memoryMain"
      const zone = ZONE_VALUES.has(text(node?.zone)) ? text(node?.zone) : zoneForType(type)
      const data: Record<string, Json> = {
        label,
        body,
        zone,
        source: SOURCE_VALUES.has(text(node?.source)) ? text(node?.source) : "ai",
        confidence: CONFIDENCE_VALUES.has(text(node?.confidence)) ? text(node?.confidence) : "medium",
        status: STATUS_VALUES.has(text(node?.status)) ? text(node?.status) : (type === "task" ? "active" : "proposed"),
        priority: PRIORITY_VALUES.has(text(node?.priority)) ? text(node?.priority) : (type === "task" ? "high" : "medium"),
        tags: list(node?.tags),
      }

      if (type === "task") data.done = Boolean(node?.done)
      if (text(node?.dueDate)) data.dueDate = text(node?.dueDate)
      if (text(node?.url)) data.url = text(node?.url)
      if (typeof node?.confirmed === "boolean") data.confirmed = Boolean(node.confirmed)

      return {
        id: nodeId(type, label, index + 1),
        type,
        position: anchorPosition(anchor, Number(node?.offset) || 0),
        data,
      }
    })
    .filter((node) => node.type)

  const labelToId = new Map(nodes.map((node) => [text(node.data.label), node.id]))
  const edges: OurMindEdge[] = Array.isArray(payload.edges)
    ? payload.edges
        .map((edge: any, index: number) => {
          const sourceId = labelToId.get(text(edge?.from))
          const targetId = labelToId.get(text(edge?.to))
          if (!sourceId || !targetId) return null
          return {
            id: edgeId(sourceId, targetId, index + 1),
            source: sourceId,
            target: targetId,
            label: text(edge?.label) || undefined,
          }
        })
        .filter(Boolean) as OurMindEdge[]
    : fallback.edges

  return nodes.length ? { nodes, edges } : fallback
}

export function buildBoardSummary(nodes: any[]) {
  const compact = Array.isArray(nodes)
    ? nodes.slice(0, 18).map((node) => ({
        type: node?.type,
        zone: text(node?.data?.zone),
        title: text(node?.data?.label),
        body: text(node?.data?.body).slice(0, 180),
        source: text(node?.data?.source),
        status: text(node?.data?.status),
        priority: text(node?.data?.priority),
        dueDate: text(node?.data?.dueDate),
      }))
    : []

  return JSON.stringify(compact, null, 2)
}
