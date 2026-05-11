import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { buildBoardSummary, normalizeBoardPayload, buildFallbackBoard } from "../_shared/ourMind.ts";

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
    const userPrompt = String(body?.prompt || "").trim();
    const eventType = String(body?.eventType || "refresh").trim() || "refresh";
    const researchResults = Array.isArray(body?.researchResults) ? body.researchResults.slice(0, 5) : [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const [{ data: profile }, { data: boardRow }, { data: chats }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("student_canvas").select("nodes, edges").eq("user_id", user.id).maybeSingle(),
      supabase.from("chat_sessions").select("messages, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(3),
    ]);

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentNodes = Array.isArray(boardRow?.nodes) ? boardRow.nodes : buildFallbackBoard(profile).nodes;
    const currentEdges = Array.isArray(boardRow?.edges) ? boardRow.edges : buildFallbackBoard(profile).edges;

    const recentChatLines = (chats || []).flatMap((session: any) =>
      Array.isArray(session.messages)
        ? session.messages.slice(-4).map((message: any) => `${message.role}: ${String(message.content || "").slice(0, 160)}`)
        : []
    ).slice(0, 10);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      messages: [{
        role: "user",
        content: `You are refining a student's "Our Mind" board.

Return ONLY valid JSON in this structure:
{
  "nodes": [
    {
      "type": "identity | behavior | task | opportunity | memory | question | understanding | note",
      "label": "short title",
      "body": "brief body",
      "zone": "self | behavior | week | opportunities | memory",
      "anchor": "selfStack | behaviorStack | weekStack | oppStack | memoryStack | weekMain | oppMain",
      "offset": 0,
      "source": "ai",
      "confidence": "low | medium | high",
      "status": "active | proposed | done | paused",
      "priority": "low | medium | high",
      "tags": ["optional"],
      "url": "optional",
      "dueDate": "optional ISO string"
    }
  ],
  "edges": [
    { "from": "new node label", "to": "existing node label", "label": "optional relationship" }
  ],
  "assistant_note": "one short sentence"
}

Rules:
- Suggest 2 to 4 additions only.
- Do not overwrite or delete user-authored corrections.
- Add nodes that sharpen the student's identity, Mentorable's behavior, weekly missions, real opportunities, or long-term memory.
- If the event is "chat", bias toward memories, identity signals, behavior updates, and one concrete next-step mission if needed.
- If the event is "research", bias toward opportunities, deadlines, and follow-up missions.
- Keep language specific, youthful, and motivating without sounding try-hard.
- Preserve the feeling that this board is a growing brain, not a productivity spreadsheet.
- Do not mention roadmaps.

Student profile:
- Strengths: ${JSON.stringify(profile.strengths || [])}
- Interests: ${JSON.stringify(profile.interests || [])}
- Career matches: ${JSON.stringify(profile.career_matches || [])}
- Summary: ${profile.onboarding_summary || "Unknown"}
- Motivations: ${JSON.stringify(profile.motivations || [])}
- Biggest concern: ${profile.biggest_concern || "Unknown"}

Current board:
${buildBoardSummary(currentNodes)}

Recent chat:
${recentChatLines.length ? recentChatLines.join("\n") : "No recent chat."}

Event type:
${eventType}

Recent research results:
${researchResults.length ? JSON.stringify(researchResults, null, 2) : "No research payload provided."}

User prompt:
${userPrompt || "Refresh the board with Mentorable's best next additions."}`
      }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const additions = normalizeBoardPayload(parsed, { nodes: [], edges: [] });

    const existingKey = new Set(
      currentNodes.map((node: any) => `${String(node.type)}::${String(node.data?.label || "").toLowerCase()}`)
    );

    const mergedNodes = [...currentNodes];
    for (const node of additions.nodes) {
      const key = `${String(node.type)}::${String(node.data?.label || "").toLowerCase()}`;
      if (!existingKey.has(key)) {
        mergedNodes.push(node);
        existingKey.add(key);
      }
    }

    const mergedEdges = [...currentEdges];
    const edgeIds = new Set(mergedEdges.map((edge: any) => edge.id));
    for (const edge of additions.edges) {
      if (!edgeIds.has(edge.id)) {
        mergedEdges.push(edge);
        edgeIds.add(edge.id);
      }
    }

    await supabase.from("student_canvas").upsert(
      {
        user_id: user.id,
        nodes: mergedNodes,
        edges: mergedEdges,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return new Response(JSON.stringify({
      success: true,
      nodes: mergedNodes,
      edges: mergedEdges,
      assistantNote: String(parsed?.assistant_note || "").trim() || "Mentorable added a few new threads to the board.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[refine-our-mind] error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
