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
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are extracting a structured career profile from a voice conversation transcript between an AI career guide and a student.

Return ONLY valid JSON with no other text, no markdown, no backticks. The JSON must contain all fields below.

IMPORTANT RULES:
- "career_matches" must ALWAYS contain exactly 3 career title strings — never empty. Even if the student was undecided, infer the 3 best-fit careers from everything they shared. This field drives scorecard and roadmap generation.
- "onboarding_summary" must always be a warm, encouraging 2–3 sentence description of who the student is and what makes them unique.
- For "mentioned_careers", include ALL careers the student brought up — even ones they rejected or were unsure about. Set "ruled_out" to true for any they dismissed.
- "career_certainty" reflects how decided the student seems overall: "certain" if they know what they want, "exploring" if they're curious but open, "undecided" if they expressed confusion or no direction.
- "self_confidence_level" is based on HOW the student talked about themselves — "low" if hesitant/self-doubting, "high" if assured, "medium" otherwise.
- "personality_signals" are short tags inferred from tone and content (e.g. "analytical", "creative", "introverted", "collaborative", "independent", "hands-on", "empathetic").
- "own_words_keywords" are short phrases or words the student actually used that capture who they are — pull these verbatim or near-verbatim from their speech.
- "conversation_tone" is the dominant emotional register of the student's side of the conversation.
- "motivations" are what the student values in a career — pull from what they said excites them or matters to them (e.g. "income", "creativity", "helping others", "stability", "flexibility", "prestige", "impact").
- "biggest_concern" is the single most prominent fear or worry the student expressed about their future, if any. Null if none detected.
- "external_influences" is a short description of any outside factors shaping their choices — family pressure, financial need, geographic limits, etc. Null if none detected.

{
  "strengths": ["3-5 specific strengths mentioned or demonstrated"],
  "weaknesses": ["2-3 areas for growth"],
  "interests": ["3-5 specific interests or passions"],
  "work_style": "2-3 sentence description of how they like to work",
  "career_matches": ["top 3 most suitable career titles — REQUIRED, never empty"],
  "onboarding_summary": "2-3 warm, encouraging sentences summarizing who this student is and what makes them unique",
  "career_certainty": "certain | exploring | undecided",
  "mentioned_careers": [{ "title": "career title", "ruled_out": false }],
  "motivations": ["short value strings"],
  "biggest_concern": "text or null",
  "external_influences": "text or null",
  "self_confidence_level": "low | medium | high",
  "personality_signals": ["short descriptive tags"],
  "own_words_keywords": ["short phrases from the student's own speech"],
  "conversation_tone": "excited | anxious | uncertain | motivated | mixed"
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
        // Original scorecard fields
        strengths: profile.strengths,
        weaknesses: profile.weaknesses,
        interests: profile.interests,
        work_style: profile.work_style,
        career_matches: profile.career_matches,
        onboarding_summary: profile.onboarding_summary,
        onboarding_completed: true,
        // Enrichment fields
        career_certainty: profile.career_certainty ?? null,
        mentioned_careers: profile.mentioned_careers ?? null,
        motivations: profile.motivations ?? null,
        biggest_concern: profile.biggest_concern ?? null,
        external_influences: profile.external_influences ?? null,
        self_confidence_level: profile.self_confidence_level ?? null,
        personality_signals: profile.personality_signals ?? null,
        own_words_keywords: profile.own_words_keywords ?? null,
        conversation_tone: profile.conversation_tone ?? null,
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
