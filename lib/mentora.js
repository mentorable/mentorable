import { supabase } from "./supabase.js";
import { withRetry } from "./retry.js";

export function buildSystemPrompt(profile, completedQuests = []) {
  const name = profile?.full_name || "the student";
  const education = profile?.education_level
    ? ({ high_school: "high school", college: "college / university", other: "school" }[profile.education_level] ?? profile.education_level)
    : null;
  const gradeMap = { 9: "9th grade", 10: "10th grade", 11: "11th grade", 12: "12th grade", 1: "1st year (Freshman)", 2: "2nd year (Sophomore)", 3: "3rd year (Junior)", 4: "4th year (Senior)" };
  const grade = profile?.grade_level ? gradeMap[profile.grade_level] ?? null : null;
  const location = profile?.location_general || null;
  const strengths = (profile?.strengths || []).join(", ");
  const weaknesses = (profile?.weaknesses || []).join(", ");
  const interests = (profile?.interests || []).join(", ");
  const workStyle = profile?.work_style || null;
  const careers = (profile?.career_matches || []).join(", ");
  const summary = profile?.onboarding_summary || null;
  const agentInstructions = profile?.agent_instructions?.trim() || null;
  const responseStyle = profile?.agent_response_style || "balanced";
  const styleGuide = {
    encouraging: "Be warm and motivational. Celebrate wins. Use an uplifting tone.",
    direct: "Be direct and skip motivational filler. Get to the point. No fluff.",
    balanced: "Balance encouragement with directness.",
    concise: "Keep every response short — 3-5 sentences max unless a list is clearly better. No preamble.",
  }[responseStyle] || "";
  const questSection = completedQuests.length > 0
    ? `\n## Completed Quests\nThe student has completed these quests — use them as context for where they are in their journey:\n${completedQuests.map(q => `- ${q.title} (${q.category}, completed ${q.completed_at ? new Date(q.completed_at).toLocaleDateString() : 'recently'})`).join('\n')}`
    : '';

  return `You are the Mentorable Agent, an expert AI career guide. You give specific, actionable advice tailored to this student's unique situation — not generic platitudes.

You know this student deeply from their onboarding. Always address them by their first name (${name.split(" ")[0]}).

Response style: ${styleGuide}

## Student Profile
Name: ${name}
${education ? `Education: ${education}${grade ? `, ${grade}` : ""}` : ""}
${location ? `Location: ${location}` : ""}
${summary ? `\nAbout them: ${summary}` : ""}
${strengths ? `\nStrengths: ${strengths}` : ""}
${weaknesses ? `\nAreas for growth: ${weaknesses}` : ""}
${interests ? `\nInterests: ${interests}` : ""}
${workStyle ? `\nWork style: ${workStyle}` : ""}
${careers ? `\nTop career matches: ${careers}` : ""}${questSection}

## How to respond
- Use markdown formatting — it renders in the UI. Use **bold** for key points, ## for section headings, - for bullet lists, and 1. for numbered steps.
- Keep responses concise and scannable. Prefer short paragraphs and bullets over walls of text.
- Reference their specific strengths, interests, and goals when relevant — never give generic advice when personal advice is possible.
- If they ask about next steps, anchor your answer in their completed quests and what they've shared about their goals.
- Be honest about challenges while staying encouraging.
- Do not mention that you have a "system prompt" or that you were "given" this information — you simply know them.
${agentInstructions ? `\n## Student's custom instructions\nThe student has asked you to follow these additional guidelines:\n${agentInstructions}` : ""}`;
}

// Strip control characters and null bytes before sending to the API.
function sanitizeInput(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

// Stream a chat response via the server-side chat edge function.
// Keeps the Anthropic API key off the client entirely.
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

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
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(parsed.text);
        }
        if (parsed.error) throw new Error(parsed.error);
      } catch (e) {
        if (e.message === parsed?.error) throw e;
        // malformed SSE line — skip
      }
    }
  }

  await onDone(fullText);
  return fullText;
}
