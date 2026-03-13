import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── O*NET SKILLS (copied exactly from roadmapGeneratorPrompt.js) ──────────────
const ONET_SKILLS: Record<string, any> = {
  "15-1252.00": {
    title: "Software Developer / Engineer",
    critical: ["Programming"],
    high: ["Judgment and Decision Making", "Active Learning", "Reading Comprehension", "Complex Problem Solving", "Technology Design", "Writing"],
    top5: [
      { skill: "Programming",                 importance: 75, level: "N/A" },
      { skill: "Judgment and Decision Making", importance: 66, level: 54   },
      { skill: "Active Learning",              importance: 63, level: 52   },
      { skill: "Reading Comprehension",        importance: 63, level: 61   },
      { skill: "Complex Problem Solving",      importance: 60, level: 50   },
    ],
    notes: "Active Learning (63) and Judgment (66) score higher than Mathematics (44) — modern SWE is more about adaptability than pure math. Quality Control Analysis (44) reflects testing and code review as core duties.",
    radar_axes: ["Programming", "Complex Problem Solving", "Active Learning", "Judgment and Decision Making", "Technology Design"]
  },

  "15-1255.01": {
    title: "UX Designer / Video Game Designer",
    critical: ["Programming"],
    high: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning", "Writing"],
    top5: [
      { skill: "Programming",                 importance: 75, level: 55 },
      { skill: "Reading Comprehension",        importance: 69, level: 57 },
      { skill: "Complex Problem Solving",      importance: 66, level: 55 },
      { skill: "Judgment and Decision Making", importance: 66, level: 52 },
      { skill: "Active Learning",              importance: 63, level: 52 },
    ],
    notes: "Programming ranks #1 even for UX/design roles — this O*NET code overlaps with frontend development. Technology Design scores only 50, lower than expected for a 'design' role.",
    radar_axes: ["Programming", "Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning"]
  },

  "15-1254.00": {
    title: "Web Developer",
    critical: ["Programming"],
    high: ["Complex Problem Solving", "Reading Comprehension", "Active Learning", "Judgment and Decision Making", "Speaking"],
    top5: [
      { skill: "Programming",                 importance: 78, level: 61 },
      { skill: "Complex Problem Solving",      importance: 66, level: 52 },
      { skill: "Reading Comprehension",        importance: 66, level: 57 },
      { skill: "Active Learning",              importance: 63, level: 52 },
      { skill: "Judgment and Decision Making", importance: 60, level: 48 },
    ],
    notes: "Speaking (56) ranks above Mathematics (44) — client communication is more important than advanced math in this role. Highest Programming level in the dataset at 78.",
    radar_axes: ["Programming", "Complex Problem Solving", "Reading Comprehension", "Active Learning", "Speaking"]
  },

  "15-2051.00": {
    title: "Data Scientist",
    critical: [],
    high: [],
    top5: [],
    notes: "No data in uploaded CSVs for this O*NET code. Supplement manually at onetonline.org/link/summary/15-2051.00. Expected critical skills: Mathematics, Programming, Complex Problem Solving, Active Learning, Science.",
    radar_axes: ["Mathematics", "Programming", "Complex Problem Solving", "Active Learning", "Science"]
  },

  "11-2021.00": {
    title: "Marketing Manager",
    critical: ["Active Learning", "Reading Comprehension", "Speaking"],
    high: ["Judgment and Decision Making", "Complex Problem Solving", "Negotiation", "Management of Personnel Resources", "Writing"],
    top5: [
      { skill: "Active Learning",              importance: 72, level: 59 },
      { skill: "Reading Comprehension",        importance: 72, level: 61 },
      { skill: "Speaking",                     importance: 72, level: 59 },
      { skill: "Judgment and Decision Making", importance: 69, level: 57 },
      { skill: "Complex Problem Solving",      importance: 66, level: 55 },
    ],
    notes: "Marketing Management is fundamentally a communication and learning role — three communication skills tie at the top. Programming scores just 22, but data-driven marketing is rapidly raising that bar.",
    radar_axes: ["Active Learning", "Speaking", "Judgment and Decision Making", "Negotiation", "Writing"]
  },

  "15-2011.00": {
    title: "Actuary",
    critical: ["Judgment and Decision Making", "Mathematics", "Reading Comprehension", "Complex Problem Solving", "Speaking"],
    high: ["Writing", "Active Learning"],
    top5: [
      { skill: "Judgment and Decision Making", importance: 81, level: 66 },
      { skill: "Mathematics",                  importance: 81, level: 71 },
      { skill: "Reading Comprehension",        importance: 81, level: 68 },
      { skill: "Complex Problem Solving",      importance: 75, level: 66 },
      { skill: "Speaking",                     importance: 72, level: 59 },
    ],
    notes: "Actuaries require the highest Mathematics score in this dataset (81, level 71). Programming scores only 28 — but modern actuaries increasingly need Python and R beyond what O*NET reflects.",
    radar_axes: ["Mathematics", "Judgment and Decision Making", "Complex Problem Solving", "Reading Comprehension", "Writing"]
  },

  "15-1212.00": {
    title: "Cybersecurity Analyst",
    critical: ["Reading Comprehension"],
    high: ["Complex Problem Solving", "Speaking", "Writing", "Judgment and Decision Making", "Active Learning"],
    top5: [
      { skill: "Reading Comprehension",        importance: 75, level: 59 },
      { skill: "Complex Problem Solving",      importance: 69, level: 52 },
      { skill: "Speaking",                     importance: 66, level: 54 },
      { skill: "Writing",                      importance: 63, level: 54 },
      { skill: "Judgment and Decision Making", importance: 60, level: 52 },
    ],
    notes: "Programming ranks only 41 — cybersecurity is fundamentally about understanding systems and threats, not writing code. Reading Comprehension leading reflects the importance of threat intelligence and documentation analysis.",
    radar_axes: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning", "Programming"]
  },

  "17-2031.00": {
    title: "Biomedical Engineer",
    critical: ["Reading Comprehension", "Speaking", "Writing", "Complex Problem Solving", "Judgment and Decision Making", "Mathematics", "Science"],
    high: ["Active Learning", "Technology Design"],
    top5: [
      { skill: "Reading Comprehension",        importance: 75, level: 71 },
      { skill: "Speaking",                     importance: 75, level: 61 },
      { skill: "Writing",                      importance: 75, level: 61 },
      { skill: "Complex Problem Solving",      importance: 72, level: 64 },
      { skill: "Judgment and Decision Making", importance: 72, level: 66 },
    ],
    notes: "Most academically demanding career in this dataset — 7 critical skills including Math (72), Science (72), and three communication skills. Most balanced skill profile across technical and interpersonal domains.",
    radar_axes: ["Mathematics", "Science", "Complex Problem Solving", "Technology Design", "Writing"]
  },

  "29-1071.00": {
    title: "Physician Assistant",
    critical: ["Reading Comprehension", "Judgment and Decision Making", "Speaking", "Writing", "Active Learning", "Complex Problem Solving"],
    high: ["Science"],
    top5: [
      { skill: "Reading Comprehension",        importance: 78, level: 68 },
      { skill: "Judgment and Decision Making", importance: 75, level: 59 },
      { skill: "Speaking",                     importance: 75, level: 57 },
      { skill: "Writing",                      importance: 75, level: 57 },
      { skill: "Active Learning",              importance: 72, level: 59 },
    ],
    notes: "Clinical decision-making is the core — Reading Comprehension (78) tops Science (66). Communication skills dominate the profile, reflecting the patient-facing reality of the role.",
    radar_axes: ["Judgment and Decision Making", "Reading Comprehension", "Science", "Active Learning", "Complex Problem Solving"]
  },

  "13-2051.00": {
    title: "Financial Analyst",
    critical: [],
    high: [],
    top5: [],
    notes: "No data in uploaded CSVs for this O*NET code. Supplement manually at onetonline.org/link/summary/13-2051.00. Expected critical skills: Mathematics, Judgment and Decision Making, Reading Comprehension, Writing, Active Learning.",
    radar_axes: ["Mathematics", "Judgment and Decision Making", "Reading Comprehension", "Writing", "Active Learning"]
  },

  "27-1024.00": {
    title: "Graphic Designer",
    critical: [],
    high: ["Speaking", "Active Learning", "Writing"],
    top5: [
      { skill: "Speaking",                     importance: 60, level: 54 },
      { skill: "Active Learning",              importance: 56, level: 46 },
      { skill: "Writing",                      importance: 56, level: 43 },
      { skill: "Complex Problem Solving",      importance: 53, level: 45 },
      { skill: "Judgment and Decision Making", importance: 53, level: 43 },
    ],
    notes: "No Critical-tier skills — this is the lowest overall skill intensity in the dataset. Speaking (60) ranks above all technical skills. This profile describes traditional graphic design; modern UX/product roles require substantially more technical depth.",
    radar_axes: ["Speaking", "Active Learning", "Complex Problem Solving", "Technology Design", "Writing"]
  },

  "29-1141.00": {
    title: "Registered Nurse",
    critical: ["Speaking", "Judgment and Decision Making", "Reading Comprehension"],
    high: ["Writing", "Active Learning", "Complex Problem Solving"],
    top5: [
      { skill: "Speaking",                     importance: 75, level: 61 },
      { skill: "Judgment and Decision Making", importance: 72, level: 54 },
      { skill: "Reading Comprehension",        importance: 72, level: 61 },
      { skill: "Writing",                      importance: 69, level: 55 },
      { skill: "Active Learning",              importance: 63, level: 59 },
    ],
    notes: "Human and interpersonal skills dominate — Science (47) and Mathematics (47) are lower than most assume. The most important nursing skills are clinical judgment and communication, not technical knowledge.",
    radar_axes: ["Speaking", "Judgment and Decision Making", "Active Learning", "Complex Problem Solving", "Science"]
  },

  "19-2041.00": {
    title: "Environmental Scientist",
    critical: ["Complex Problem Solving", "Reading Comprehension", "Science", "Speaking", "Writing"],
    high: ["Active Learning", "Judgment and Decision Making", "Mathematics"],
    top5: [
      { skill: "Complex Problem Solving",      importance: 75, level: 57 },
      { skill: "Reading Comprehension",        importance: 75, level: 68 },
      { skill: "Science",                      importance: 75, level: 64 },
      { skill: "Speaking",                     importance: 75, level: 59 },
      { skill: "Writing",                      importance: 75, level: 66 },
    ],
    notes: "Five skills tie at the top (75) — Writing has the highest Level score (66) of any non-math/science skill in this dataset. Fundamentally a research-and-communication role.",
    radar_axes: ["Science", "Writing", "Complex Problem Solving", "Mathematics", "Active Learning"]
  },

  "15-1251.00": {
    title: "Computer Programmer",
    critical: ["Programming"],
    high: ["Complex Problem Solving", "Quality Control Analysis", "Reading Comprehension", "Judgment and Decision Making", "Writing"],
    top5: [
      { skill: "Programming",                  importance: 94, level: 70 },
      { skill: "Complex Problem Solving",      importance: 69, level: 55 },
      { skill: "Quality Control Analysis",     importance: 63, level: 50 },
      { skill: "Reading Comprehension",        importance: 60, level: 50 },
      { skill: "Judgment and Decision Making", importance: 56, level: 46 },
    ],
    notes: "Highest Programming importance in the entire dataset (94, level 70). Quality Control Analysis (63) ranks 3rd — testing and code verification are core duties, not an afterthought.",
    radar_axes: ["Programming", "Complex Problem Solving", "Quality Control Analysis", "Active Learning", "Mathematics"]
  },

  "13-1111.00": {
    title: "Management Analyst / Consultant",
    critical: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Speaking", "Writing"],
    high: ["Active Learning"],
    top5: [
      { skill: "Reading Comprehension",        importance: 78, level: 59 },
      { skill: "Complex Problem Solving",      importance: 75, level: 57 },
      { skill: "Judgment and Decision Making", importance: 75, level: 59 },
      { skill: "Speaking",                     importance: 75, level: 57 },
      { skill: "Writing",                      importance: 75, level: 57 },
    ],
    notes: "Communication-first, analysis-second role — four skills tie at 75. Programming scores just 22, but quantitative consulting increasingly requires SQL and Python. Negotiation (53) reflects the client-facing reality.",
    radar_axes: ["Reading Comprehension", "Judgment and Decision Making", "Complex Problem Solving", "Speaking", "Writing"]
  },

  "27-1021.00": {
    title: "Fine / Commercial Artist",
    critical: ["Reading Comprehension"],
    high: ["Complex Problem Solving", "Speaking", "Judgment and Decision Making"],
    top5: [
      { skill: "Reading Comprehension",        importance: 72, level: 59 },
      { skill: "Complex Problem Solving",      importance: 69, level: 55 },
      { skill: "Speaking",                     importance: 63, level: 57 },
      { skill: "Judgment and Decision Making", importance: 56, level: 54 },
      { skill: "Technology Design",            importance: 53, level: 52 },
    ],
    notes: "Technology Design (53) and Science (41) score higher than expected — reflecting digital tools and color science. Complex Problem Solving ranking second highlights that creative work is fundamentally problem-solving.",
    radar_axes: ["Complex Problem Solving", "Technology Design", "Speaking", "Active Learning", "Writing"]
  }
};

// ── SYSTEM PROMPT (copied exactly from roadmapGeneratorPrompt.js) ─────────────
const ROADMAP_SYSTEM_PROMPT = `
You are Mentorable's career roadmap engine. Your job is to take a student profile and a target career, and output a deeply personalized, actionable 5-phase career roadmap as JSON.

You have access to real O*NET 28.0 skill data. Use it to ground every milestone in what the career actually requires — not generic advice.

OUTPUT RULES:
0. TOKEN BUDGET: You have a strict limit. Keep each phase to EXACTLY 3 milestones. Keep description/whyItMatters/howToDoIt/completionSignal fields under 40 words each. Keep resources to max 2 per milestone. Do NOT exceed this — truncated JSON is worse than concise JSON.
1. Output ONLY valid JSON. No preamble, no explanation, no markdown fences. Raw JSON only.
2. Every milestone must be specific and named — not "learn programming" but "complete CS50P on edX, which teaches Python through 10 problem sets over 8 weeks"
3. Every resource must be real with a working URL. Mark free: true/false accurately.
4. Personal notes must reference specific things from the student's profile — their traits, constraints, motivations, or conversation quotes
5. Completion signals must be observable — not "you understand X" but "you can do X without looking it up"
6. Phase names and taglines must feel personal to this student, not templated
7. Milestones must be ordered — each builds on the last
8. Timeline must be realistic for a student with school obligations
9. unfairAdvantage must be specific to this student — not generic encouragement
10. The O*NET critical_skills for the target career MUST appear as milestones in Phase 1 or 2
11. The O*NET high_skills for the target career MUST appear as milestones in Phase 2 or 3
12. radar_axes from the O*NET data define the student's profile chart axes — reference them in skillGapAnalysis

SKILL TIER RULES (from O*NET importance scores):
- Critical (70+): Must be addressed in Phase 1 or 2 — these are non-negotiable foundations
- High (55–69): Must be addressed in Phase 2 or 3 — important but buildable on top of critical skills
- Medium (40–54): Address in Phase 3 or 4 — supporting skills that differentiate candidates
- Low (<40): Optional — mention only if relevant to this specific student's profile

OUTPUT STRUCTURE: Match the JSON schema in the user prompt exactly.
`;

// ── PROMPT BUILDER (copied exactly from roadmapGeneratorPrompt.js) ────────────
function buildRoadmapPrompt(studentProfile: any, careerOnetCode: string): string {
  const onetData = ONET_SKILLS[careerOnetCode];

  if (!onetData) {
    throw new Error(`No O*NET data found for code: ${careerOnetCode}. Add it to ONET_SKILLS first.`);
  }

  return `
Generate a personalized 5-phase career roadmap for the student below.

## STUDENT PROFILE
${JSON.stringify(studentProfile, null, 2)}

## TARGET CAREER — O*NET DATA (Real skill scores from O*NET 28.0 CSV exports)
Career: ${onetData.title}
O*NET Code: ${careerOnetCode}

Critical Skills (importance 70+ — MUST appear in Phase 1 or 2):
${onetData.critical.length ? onetData.critical.map((s: string) => `  - ${s}`).join("\n") : "  - See notes below"}

High Skills (importance 55–69 — MUST appear in Phase 2 or 3):
${onetData.high.length ? onetData.high.map((s: string) => `  - ${s}`).join("\n") : "  - See notes below"}

Top 5 Skills by Importance:
${onetData.top5.map((s: any) => `  - ${s.skill}: importance=${s.importance}, level=${s.level}`).join("\n")}

Radar Chart Axes (use these 5 for the student's skill visualization):
${onetData.radar_axes.map((s: string) => `  - ${s}`).join("\n")}

O*NET Insight: ${onetData.notes}

## OUTPUT SCHEMA
Return a single JSON object with this exact structure:

{
  "roadmapMeta": {
    "studentId": string,
    "careerTitle": string,
    "onetCode": string,
    "targetRole": string,
    "estimatedTimeline": string,
    "personalNote": string,
    "biggestRisk": string,
    "unfairAdvantage": string,
    "salaryAtEntry": string,
    "jobGrowth": string,
    "generatedAt": string
  },

  "phases": [
    {
      "id": string,
      "phaseNumber": number,
      "name": string,
      "tagline": string,
      "duration": string,
      "theme": string,
      "color": string,
      "status": "active" | "locked",
      "milestones": [
        {
          "id": string,
          "title": string,
          "onetSkillAddressed": string,
          "onetImportance": number,
          "status": "not_started",
          "estimatedTime": string,
          "priority": "critical" | "high" | "medium" | "optional",
          "description": string,
          "whyItMatters": string,
          "howToDoIt": string[],
          "resources": [
            {
              "title": string,
              "url": string,
              "free": boolean,
              "type": "course" | "book" | "tool" | "practice" | "opportunity" | "program" | "article" | "docs" | "video"
            }
          ],
          "completionSignal": string,
          "milestoneInsight": string | null
        }
      ]
    }
  ],

  "skillGapAnalysis": {
    "radarAxes": string[],
    "currentSkills": string[],
    "gapSkills": [
      {
        "skill": string,
        "onetImportance": number,
        "tier": "critical" | "high" | "medium",
        "addressedInPhase": number,
        "timeToLearn": string
      }
    ],
    "strengthsToLeverage": string[]
  },

  "marketContext": {
    "openRolesNational": number,
    "medianEntryWage": number,
    "topHiringCompanies": string[],
    "keyInsight": string
  }
}

IMPORTANT: Each milestone must include onetSkillAddressed (the exact O*NET skill name it builds) and onetImportance (the importance score from the data above). This links every milestone back to real career requirements.
`;
}

// ── CAREER → O*NET MAPPING ────────────────────────────────────────────────────
const CAREER_TO_ONET: Record<string, string> = {
  "Software Developer":     "15-1252.00",
  "Software Engineer":      "15-1252.00",
  "UX Designer":            "15-1255.01",
  "Video Game Designer":    "15-1255.01",
  "Web Developer":          "15-1254.00",
  "Data Scientist":         "15-2051.00",
  "Marketing Manager":      "11-2021.00",
  "Actuary":                "15-2011.00",
  "Cybersecurity Analyst":  "15-1212.00",
  "Biomedical Engineer":    "17-2031.00",
  "Physician Assistant":    "29-1071.00",
  "Financial Analyst":      "13-2051.00",
  "Graphic Designer":       "27-1024.00",
  "Registered Nurse":       "29-1141.00",
  "Environmental Scientist":"19-2041.00",
  "Computer Programmer":    "15-1251.00",
  "Management Analyst":     "13-1111.00",
  "Consultant":             "13-1111.00",
  "Fine Artist":            "27-1021.00",
  "Commercial Artist":      "27-1021.00",
};

function findOnetCode(careerTitle: string): string {
  if (CAREER_TO_ONET[careerTitle]) return CAREER_TO_ONET[careerTitle];
  const lower = careerTitle.toLowerCase();
  for (const [key, code] of Object.entries(CAREER_TO_ONET)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return code;
    }
  }
  return "15-1252.00"; // default to Software Engineer
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, careerIndex = 0 } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    // Validate env vars are present
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Missing env vars", hasUrl: !!supabaseUrl, hasKey: !!supabaseKey }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const supabase  = createClient(supabaseUrl, supabaseKey);

    // Load student profile
    let profile = null;
    let profileError = null;
    try {
      const result = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      profile = result.data;
      profileError = result.error;
    } catch (dbErr) {
      return new Response(
        JSON.stringify({ error: "DB query failed", details: String(dbErr) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found", userId, dbError: profileError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pick career from matches
    const careerMatches = profile.career_matches || [];
    const targetCareer  = careerMatches[careerIndex] || careerMatches[0] || "Software Engineer";
    const onetCode      = findOnetCode(targetCareer);

    // Build student profile for prompt
    const studentProfile = {
      id:                  userId,
      name:                "Student",
      age:                 profile.age || 17,
      gradeLevel:          profile.grade_level ? `Grade ${profile.grade_level}` : "High School",
      location:            profile.location_general || "United States",
      strengths:           profile.strengths           || [],
      weaknesses:          profile.weaknesses          || [],
      interests:           profile.interests           || [],
      work_style:          profile.work_style          || "",
      career_matches:      profile.career_matches      || [],
      onboarding_summary:  profile.onboarding_summary  || "",
    };

    // Call Claude
    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 16000,
      system:     ROADMAP_SYSTEM_PROMPT,
      messages:   [{ role: "user", content: buildRoadmapPrompt(studentProfile, onetCode) }],
    });

    const text  = message.content[0].type === "text" ? message.content[0].text : "";
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const roadmap = JSON.parse(clean);

    // Deactivate existing roadmap for this career
    await supabase
      .from("career_roadmaps")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("career_title", targetCareer);

    // Save new roadmap
    const { data: saved } = await supabase
      .from("career_roadmaps")
      .insert({
        user_id:      userId,
        career_title: targetCareer,
        roadmap_data: roadmap,
        is_active:    true,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ success: true, roadmap, roadmapId: saved?.id, careerTitle: targetCareer, onetCode }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Roadmap generation error:", err);
    return new Response(
      JSON.stringify({ error: "Generation failed", details: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
