import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { parentNode, depth, exploredPath, profile } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const isLeaf = depth >= 3;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are helping a high school student explore career paths through an interactive branching tree.

Current path: ${(exploredPath || []).join(" → ")}
Student just clicked: "${parentNode}"
Tree depth: ${depth} (0=root directions, 1=broad fields, 2=specialties, 3=specific careers)

Student profile:
- Strengths: ${(profile?.strengths || []).join(", ") || "not specified"}
- Interests: ${(profile?.interests || []).join(", ") || "not specified"}
- Work style: ${profile?.work_style || "not specified"}
- Top career matches: ${(profile?.career_matches || []).join(", ") || "not specified"}
- Grade level: ${profile?.grade_level || "high school"}

${isLeaf
  ? `Generate 3 specific career titles within "${parentNode}". These should be real, achievable jobs that excite a high schooler. Make them feel concrete and aspirational.`
  : depth === 0
  ? `Generate 3 broad life directions for this specific student — not generic "Arts/Science/Business". Tailor them to their profile. Examples: "Building Systems", "Shaping Minds", "Creating Experiences".`
  : `Generate 2-3 sub-areas within "${parentNode}" that this student could explore. Keep them distinct and interesting.`
}

Return ONLY valid JSON, no markdown, no backticks:
{
  "branches": [
    {
      "id": "unique_short_string_no_spaces",
      "label": "Short Name (2-4 words max)",
      "subtitle": "One short engaging description under 8 words",
      "type": "${isLeaf ? "leaf" : "branch"}"
    }
  ]
}`
      }]
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "{}";

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
