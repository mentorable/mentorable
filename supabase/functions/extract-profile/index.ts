import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transcript, userId } = await req.json();

    if (!transcript || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing transcript or userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are extracting structured career profile data from a voice conversation transcript between an AI career guide and a high school student.

Return ONLY valid JSON with no other text, no markdown, no backticks:
{
  "strengths": ["3-5 specific strengths mentioned or demonstrated"],
  "weaknesses": ["2-3 areas for growth"],
  "interests": ["3-5 specific interests or passions"],
  "work_style": "2-3 sentence description of how they like to work",
  "career_matches": ["top 3 career titles that fit this student"],
  "onboarding_summary": "2-3 warm, encouraging sentences summarizing who this student is and what makes them unique"
}

Transcript:
${transcript}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let profile;
    try {
      profile = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse Claude response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        interests: profile.interests,
        work_style: profile.work_style,
        career_matches: profile.career_matches,
        onboarding_summary: profile.onboarding_summary,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
