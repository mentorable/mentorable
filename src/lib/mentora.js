import { supabase } from "./supabase.js";
import { withRetry } from "./retry.js";

// ─── Section definitions ──────────────────────────────────────────────────────

export const SECTION_LABELS = {
  student_profile:    "Student Profile",
  summary:            "About You",
  strengths:          "Strengths",
  growth_areas:       "Areas for Growth",
  interests:          "Interests",
  work_style:         "Work Style",
  career_matches:     "Career Matches",
  agent_instructions: "Custom Instructions",
  completed_quests:   "Completed Quests",
  active_quests:      "Active Quests",
  dismissed_quests:   "Dismissed Quests",
  recent_research:    "Recent Research",
  chat_topics:        "Conversation Topics",
};

export function buildSections(profile, data = {}) {
  const {
    completedQuests = [],
    activeQuests = [],
    deletedQuestTitles = [],
    recentResearch = [],
    chatTopics = [],
  } = data;

  const name      = profile?.full_name || "the student";
  const education = profile?.education_level
    ? ({ high_school: "high school", college: "college / university", other: "school" }[profile.education_level] ?? profile.education_level)
    : null;
  const gradeMap  = { 9: "9th grade", 10: "10th grade", 11: "11th grade", 12: "12th grade", 1: "1st year (Freshman)", 2: "2nd year (Sophomore)", 3: "3rd year (Junior)", 4: "4th year (Senior)" };
  const grade     = profile?.grade_level ? (gradeMap[profile.grade_level] ?? null) : null;
  const location  = profile?.location_general || null;

  const sections = [];

  // Student basics
  const profileLines = [`Name: ${name}`];
  if (education) profileLines.push(`Education: ${education}${grade ? `, ${grade}` : ""}`);
  if (location)  profileLines.push(`Location: ${location}`);
  sections.push({ id: "student_profile", content: `## Student Profile\n${profileLines.join("\n")}` });

  if (profile?.onboarding_summary) {
    sections.push({ id: "summary", content: `About them: ${profile.onboarding_summary}` });
  }
  if (profile?.strengths?.length) {
    sections.push({ id: "strengths", content: `Strengths: ${profile.strengths.join(", ")}` });
  }
  if (profile?.weaknesses?.length) {
    sections.push({ id: "growth_areas", content: `Areas for growth: ${profile.weaknesses.join(", ")}` });
  }
  if (profile?.interests?.length) {
    sections.push({ id: "interests", content: `Interests: ${profile.interests.join(", ")}` });
  }
  if (profile?.work_style) {
    sections.push({ id: "work_style", content: `Work style: ${profile.work_style}` });
  }
  if (profile?.career_matches?.length) {
    sections.push({ id: "career_matches", content: `Top career matches: ${profile.career_matches.join(", ")}` });
  }
  if (profile?.agent_instructions?.trim()) {
    sections.push({ id: "agent_instructions", content: `## Custom Instructions\nThe student has asked Mentora to follow these guidelines:\n${profile.agent_instructions.trim()}` });
  }
  if (completedQuests.length > 0) {
    const lines = completedQuests.map(q => `- ${q.title} (${q.category || "general"}, completed ${q.completed_at ? new Date(q.completed_at).toLocaleDateString() : "recently"})`);
    sections.push({ id: "completed_quests", content: `## Completed Quests\nThe student has completed these quests — use them as context for their journey:\n${lines.join("\n")}` });
  }
  if (activeQuests.length > 0) {
    const lines = activeQuests.map(q => `- ${q.title} [${q.status.replace("_", " ")}]`);
    sections.push({ id: "active_quests", content: `## Active Quests\nQuests the student is currently working on or considering:\n${lines.join("\n")}` });
  }
  if (deletedQuestTitles.length > 0) {
    sections.push({ id: "dismissed_quests", content: `## Dismissed Quests\nThe student passed on these quests — do not re-suggest them:\n${deletedQuestTitles.map(t => `- ${t}`).join("\n")}` });
  }
  if (recentResearch.length > 0) {
    sections.push({ id: "recent_research", content: `## Recent Research\nTopics the student has recently looked into:\n${recentResearch.map(q => `- ${q}`).join("\n")}` });
  }
  if (chatTopics.length > 0) {
    sections.push({ id: "chat_topics", content: `## Conversation History\nRecent topics from their chats with Mentora:\n${chatTopics.map(t => `- ${t}`).join("\n")}` });
  }

  return sections;
}

export function buildSystemPrompt(profile, data = {}) {
  // Support legacy array signature: buildSystemPrompt(profile, completedQuests[])
  if (Array.isArray(data)) data = { completedQuests: data };

  const { annotations = [] } = data;

  const name         = profile?.full_name || "the student";
  const responseStyle = profile?.agent_response_style || "balanced";
  const styleGuide   = {
    encouraging: "Be warm and motivational. Celebrate wins. Use an uplifting tone.",
    direct:      "Be direct and skip motivational filler. Get to the point. No fluff.",
    balanced:    "Balance encouragement with directness.",
    concise:     "Keep every response short — 3-5 sentences max unless a list is clearly better. No preamble.",
  }[responseStyle] || "";

  let prompt = `You are the Mentorable Agent, an expert AI career guide. You give specific, actionable advice tailored to this student's unique situation — not generic platitudes.

You know this student deeply from their onboarding. Always address them by their first name (${name.split(" ")[0]}).

Response style: ${styleGuide}`;

  const sections = buildSections(profile, data);
  for (const section of sections) {
    const sAnns = annotations.filter(a => a.section_id === section.id);
    let content = section.content;

    // Apply replacements
    for (const ann of sAnns.filter(a => a.type === "replace" && a.highlighted_text)) {
      if (content.includes(ann.highlighted_text)) {
        content = content.split(ann.highlighted_text).join(ann.annotation_text);
      }
    }

    prompt += "\n\n" + content;

    // Append notes
    for (const ann of sAnns.filter(a => a.type === "note" && a.annotation_text)) {
      if (ann.highlighted_text) {
        prompt += `\n[User note on "${ann.highlighted_text}": "${ann.annotation_text}"]`;
      } else {
        prompt += `\n[User note: "${ann.annotation_text}"]`;
      }
    }
  }

  prompt += `\n\n## How to respond
- Use markdown formatting — it renders in the UI. Use **bold** for key points, ## for section headings, - for bullet lists, and 1. for numbered steps.
- Keep responses concise and scannable. Prefer short paragraphs and bullets over walls of text.
- Reference their specific strengths, interests, and goals when relevant — never give generic advice when personal advice is possible.
- If they ask about next steps, anchor your answer in their completed quests and what they've shared about their goals.
- Be honest about challenges while staying encouraging.
- Do not mention that you have a "system prompt" or that you were "given" this information — you simply know them.`;

  return prompt.trim();
}

// ─── Streaming ────────────────────────────────────────────────────────────────

function sanitizeInput(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

export async function streamChatResponse({ systemPrompt, history, onChunk, onDone }) {
  const anthropicMessages = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: sanitizeInput(m.content) }));

  const normalized = [];
  for (const msg of anthropicMessages) {
    const last = normalized[normalized.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      normalized.push({ ...msg });
    }
  }
  if (!normalized.length || normalized[0].role !== "user") return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await withRetry(
    () => fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ systemPrompt, messages: normalized }),
      }
    ),
    { maxAttempts: 3, baseDelayMs: 500 }
  );

  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.error || detail; } catch {}
    throw new Error(`Chat request failed (${res.status}): ${detail}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let fullText  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text) { fullText += parsed.text; onChunk(parsed.text); }
        if (parsed.error) throw new Error(parsed.error);
      } catch (e) {
        if (e.message === parsed?.error) throw e;
      }
    }
  }

  await onDone(fullText);
  return fullText;
}
