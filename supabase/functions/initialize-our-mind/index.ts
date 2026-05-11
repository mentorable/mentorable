import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { buildFallbackBoard, normalizeBoardPayload } from "../_shared/ourMind.ts";

const CORS_ORIGIN = Deno.env.get("CORS_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const [{ data: profile }, { data: existing }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("student_canvas").select("nodes, edges").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && existing?.nodes?.length) {
      return new Response(JSON.stringify({ success: true, nodes: existing.nodes, edges: existing.edges, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fallback = buildFallbackBoard(profile);
    let board = fallback;

    try {
      const prompt = `You are creating the first version of "Our Mind" for a student. This is a living brain map and command center between the student and Mentorable.

Return ONLY valid JSON with this structure:
{
  "nodes": [
    {
      "type": "understanding | identity | behavior | task | opportunity | memory | question | correction | note",
      "label": "short title",
      "body": "1-3 sentence body",
      "zone": "self | behavior | week | opportunities | memory",
      "anchor": "selfMain | selfStack | behaviorMain | behaviorStack | weekMain | weekStack | oppMain | oppStack | memoryMain | memoryStack",
      "offset": 0,
      "source": "ai | onboarding",
      "confidence": "low | medium | high",
      "status": "active | proposed | done | paused",
      "priority": "low | medium | high",
      "tags": ["optional", "tags"],
      "url": "optional url for opportunity nodes",
      "dueDate": "optional ISO string"
    }
  ],
  "edges": [
    { "from": "node label", "to": "node label", "label": "optional relationship" }
  ]
}

Rules:
- Create 10 to 14 nodes total.
- This must feel exciting, useful, and alive for a teenager right after onboarding.
- Include exactly 1 understanding node in the self zone.
- Include 2 to 3 identity/question nodes in the self zone.
- Include 2 behavior nodes in the behavior zone about how Mentorable should show up for this student.
- Include 3 weekly task nodes in the week zone. Make them concrete, lightweight, and immediate.
- Include 2 opportunity or deadline nodes in the opportunities zone.
- Include 2 memory or correction nodes in the memory zone.
- If you include tasks or opportunities, give most of them realistic dueDate values within the next 14 days.
- Weekly tasks should feel like missions, not homework.
- The understanding node should make a clear claim about who the student is and what matters now.
- Keep the tone warm, specific, and energizing rather than generic.
- Do not mention roadmaps.
- Use only the information provided.
`;

      const context = `Student profile:
- Name: ${profile.full_name || "Unknown"}
- Education level: ${profile.education_level || "Unknown"}
- Grade level: ${profile.grade_level || "Unknown"}
- Location: ${profile.location_general || "Unknown"}
- Strengths: ${JSON.stringify(profile.strengths || [])}
- Weaknesses: ${JSON.stringify(profile.weaknesses || [])}
- Interests: ${JSON.stringify(profile.interests || [])}
- Work style: ${profile.work_style || "Unknown"}
- Career matches: ${JSON.stringify(profile.career_matches || [])}
- Summary: ${profile.onboarding_summary || "Unknown"}
- Career certainty: ${profile.career_certainty || "Unknown"}
- Motivations: ${JSON.stringify(profile.motivations || [])}
- Biggest concern: ${profile.biggest_concern || "Unknown"}
- External influences: ${profile.external_influences || "Unknown"}
- Confidence level: ${profile.self_confidence_level || "Unknown"}
- Personality signals: ${JSON.stringify(profile.personality_signals || [])}
- Own words: ${JSON.stringify(profile.own_words_keywords || [])}
- Conversation tone: ${profile.conversation_tone || "Unknown"}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2200,
        messages: [{ role: "user", content: `${prompt}\n\n${context}` }],
      });

      const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
      board = normalizeBoardPayload(parsed, fallback);
    } catch (error) {
      console.error("[initialize-our-mind] generation fallback:", error);
      board = fallback;
    }

    await supabase.from("student_canvas").upsert(
      {
        user_id: user.id,
        nodes: board.nodes,
        edges: board.edges,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return new Response(JSON.stringify({ success: true, nodes: board.nodes, edges: board.edges, reused: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[initialize-our-mind] error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
