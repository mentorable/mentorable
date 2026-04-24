import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Build a rich system prompt from the user's stored profile + roadmap state.
// This is cached on the first turn of every session (ephemeral 5-min TTL).
export function buildSystemPrompt(profile, roadmap) {
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

  // Roadmap context
  let roadmapSection = "";
  if (roadmap) {
    const activePhase = roadmap.phases?.find((p) => p.status === "active");
    const completedPhases = roadmap.phases?.filter((p) => p.status === "completed").length ?? 0;
    const totalPhases = roadmap.phases?.length ?? 0;
    roadmapSection = `
## Their Career Roadmap
Career goal: ${roadmap.career_title}
Overall progress: ${completedPhases} of ${totalPhases} phases completed
${activePhase ? `Current phase: "${activePhase.phase_name}" (Phase ${activePhase.phase_number})` : ""}
${activePhase?.tasks?.length
  ? `Current phase tasks:
${activePhase.tasks
  .sort((a, b) => (a.week_number || 0) - (b.week_number || 0))
  .slice(0, 6)
  .map((t) => `  - [${t.status === "completed" ? "✓" : t.status === "skipped" ? "✗" : " "}] ${t.title}`)
  .join("\n")}`
  : ""}`;
  }

  return `You are Mentora, an expert AI career guide inside the Mentorable app. You are warm, encouraging, and direct. You give specific, actionable advice tailored to this student's unique situation — not generic platitudes.

You know this student deeply from their onboarding. Always address them by their first name (${name.split(" ")[0]}).

## Student Profile
Name: ${name}
${education ? `Education: ${education}${grade ? `, ${grade}` : ""}` : ""}
${location ? `Location: ${location}` : ""}
${summary ? `\nAbout them: ${summary}` : ""}
${strengths ? `\nStrengths: ${strengths}` : ""}
${weaknesses ? `\nAreas for growth: ${weaknesses}` : ""}
${interests ? `\nInterests: ${interests}` : ""}
${workStyle ? `\nWork style: ${workStyle}` : ""}
${careers ? `\nTop career matches: ${careers}` : ""}
${roadmapSection}

## How to respond
- Use markdown formatting — it renders in the UI. Use **bold** for key points, ## for section headings, - for bullet lists, and 1. for numbered steps.
- Keep responses concise and scannable. Prefer short paragraphs and bullets over walls of text.
- Reference their specific strengths, interests, and roadmap when relevant — never give generic advice when personal advice is possible.
- If they ask about next steps, look at their current roadmap phase.
- Be honest about challenges while staying encouraging.
- Do not mention that you have a "system prompt" or that you were "given" this information — you simply know them.`;
}

// Stream a chat response. Calls onChunk with each text delta, returns the full text.
export async function streamChatResponse({ systemPrompt, history, onChunk, onDone }) {
  // Convert stored messages to Anthropic format, filtering out any incomplete entries
  const anthropicMessages = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

  // Ensure valid alternating user/assistant turns (Anthropic requires this)
  const normalized = [];
  for (const msg of anthropicMessages) {
    const last = normalized[normalized.length - 1];
    if (last && last.role === msg.role) {
      // Merge consecutive same-role messages
      last.content += "\n\n" + msg.content;
    } else {
      normalized.push({ ...msg });
    }
  }
  // Must start with a user message
  if (!normalized.length || normalized[0].role !== "user") return;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }, // cache the system prompt for 5 min
      },
    ],
    messages: normalized,
  });

  let fullText = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const chunk = event.delta.text;
      fullText += chunk;
      onChunk(chunk);
    }
  }

  onDone(fullText);
  return fullText;
}
