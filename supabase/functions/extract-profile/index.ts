import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'
const corsHeaders = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── Step 1: Save raw transcript immediately for recovery ──────────────────
    await supabase
      .from("profiles")
      .update({ raw_voice_transcript: transcript, updated_at: new Date().toISOString() })
      .eq("id", userId);

    // ── Step 2: Sufficiency check ─────────────────────────────────────────────
    const checkMsg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      messages: [{
        role: "user",
        content: `A student just finished a voice onboarding conversation with an AI career guide. Did the student share enough personal information (interests, strengths, goals, or experiences) to meaningfully build a career profile? Reply with only "yes" or "no".\n\nTranscript:\n${transcript || "(empty — no messages recorded)"}`,
      }],
    });
    const checkText = (checkMsg.content[0]?.type === "text" ? checkMsg.content[0].text : "").trim().toLowerCase();

    if (!checkText.startsWith("yes")) {
      return new Response(JSON.stringify({ sufficient: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Full profile extraction ───────────────────────────────────────
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

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    let profile;
    try {
      profile = JSON.parse(responseText);
    } catch {
      // Try extracting a JSON object if there's surrounding text
      const match = responseText.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("extract-profile: JSON parse failed, raw response:", responseText.slice(0, 500));
        return new Response(
          JSON.stringify({ error: "Failed to parse profile from AI response", sufficient: true }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        profile = JSON.parse(match[0]);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to parse profile from AI response", sufficient: true }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Step 4: Save to Supabase ───────────────────────────────────────────────
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
        career_certainty: profile.career_certainty ?? null,
        mentioned_careers: profile.mentioned_careers ?? null,
        motivations: profile.motivations ?? null,
        biggest_concern: profile.biggest_concern ?? null,
        external_influences: profile.external_influences ?? null,
        self_confidence_level: profile.self_confidence_level ?? null,
        personality_signals: profile.personality_signals ?? null,
        own_words_keywords: profile.own_words_keywords ?? null,
        conversation_tone: profile.conversation_tone ?? null,
        raw_voice_transcript: null, // clear saved transcript once profile is extracted
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("extract-profile: supabase update error:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ sufficient: true, success: true, profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-profile error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
