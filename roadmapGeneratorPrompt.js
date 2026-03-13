// roadmapGeneratorPrompt.js
// Mentorable roadmap generator — Claude prompt + O*NET skills data
// Updated: includes real O*NET 28.0 skill importance + level scores from CSV exports

// ── O*NET SKILLS REFERENCE ────────────────────────────────────────────────────
// Source: O*NET 28.0 official skill CSV exports
// Importance: 0–100 (how critical the skill is to the occupation)
// Level:      0–100 (how advanced the skill needs to be)
// Tiers: Critical = 70+, High = 55–69, Medium = 40–54, Low = <40

export const ONET_SKILLS = {
  "15-1252.00": {
    title: "Software Developer / Engineer",
    critical: ["Programming"],
    high: ["Judgment and Decision Making", "Active Learning", "Reading Comprehension", "Complex Problem Solving", "Technology Design", "Writing"],
    top5: [
      { skill: "Programming",                   importance: 75, level: "N/A" },
      { skill: "Judgment and Decision Making",   importance: 66, level: 54   },
      { skill: "Active Learning",                importance: 63, level: 52   },
      { skill: "Reading Comprehension",          importance: 63, level: 61   },
      { skill: "Complex Problem Solving",        importance: 60, level: 50   },
    ],
    notes: "Active Learning (63) and Judgment (66) score higher than Mathematics (44) — modern SWE is more about adaptability than pure math. Quality Control Analysis (44) reflects testing and code review as core duties.",
    radar_axes: ["Programming", "Complex Problem Solving", "Active Learning", "Judgment and Decision Making", "Technology Design"]
  },

  "15-1255.01": {
    title: "UX Designer / Video Game Designer",
    critical: ["Programming"],
    high: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning", "Writing"],
    top5: [
      { skill: "Programming",                   importance: 75, level: 55 },
      { skill: "Reading Comprehension",          importance: 69, level: 57 },
      { skill: "Complex Problem Solving",        importance: 66, level: 55 },
      { skill: "Judgment and Decision Making",   importance: 66, level: 52 },
      { skill: "Active Learning",                importance: 63, level: 52 },
    ],
    notes: "Programming ranks #1 even for UX/design roles — this O*NET code overlaps with frontend development. Technology Design scores only 50, lower than expected for a 'design' role.",
    radar_axes: ["Programming", "Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning"]
  },

  "15-1254.00": {
    title: "Web Developer",
    critical: ["Programming"],
    high: ["Complex Problem Solving", "Reading Comprehension", "Active Learning", "Judgment and Decision Making", "Speaking"],
    top5: [
      { skill: "Programming",                   importance: 78, level: 61 },
      { skill: "Complex Problem Solving",        importance: 66, level: 52 },
      { skill: "Reading Comprehension",          importance: 66, level: 57 },
      { skill: "Active Learning",                importance: 63, level: 52 },
      { skill: "Judgment and Decision Making",   importance: 60, level: 48 },
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
      { skill: "Active Learning",                importance: 72, level: 59 },
      { skill: "Reading Comprehension",          importance: 72, level: 61 },
      { skill: "Speaking",                       importance: 72, level: 59 },
      { skill: "Judgment and Decision Making",   importance: 69, level: 57 },
      { skill: "Complex Problem Solving",        importance: 66, level: 55 },
    ],
    notes: "Marketing Management is fundamentally a communication and learning role — three communication skills tie at the top. Programming scores just 22, but data-driven marketing is rapidly raising that bar.",
    radar_axes: ["Active Learning", "Speaking", "Judgment and Decision Making", "Negotiation", "Writing"]
  },

  "15-2011.00": {
    title: "Actuary",
    critical: ["Judgment and Decision Making", "Mathematics", "Reading Comprehension", "Complex Problem Solving", "Speaking"],
    high: ["Writing", "Active Learning"],
    top5: [
      { skill: "Judgment and Decision Making",   importance: 81, level: 66 },
      { skill: "Mathematics",                    importance: 81, level: 71 },
      { skill: "Reading Comprehension",          importance: 81, level: 68 },
      { skill: "Complex Problem Solving",        importance: 75, level: 66 },
      { skill: "Speaking",                       importance: 72, level: 59 },
    ],
    notes: "Actuaries require the highest Mathematics score in this dataset (81, level 71). Programming scores only 28 — but modern actuaries increasingly need Python and R beyond what O*NET reflects.",
    radar_axes: ["Mathematics", "Judgment and Decision Making", "Complex Problem Solving", "Reading Comprehension", "Writing"]
  },

  "15-1212.00": {
    title: "Cybersecurity Analyst",
    critical: ["Reading Comprehension"],
    high: ["Complex Problem Solving", "Speaking", "Writing", "Judgment and Decision Making", "Active Learning"],
    top5: [
      { skill: "Reading Comprehension",          importance: 75, level: 59 },
      { skill: "Complex Problem Solving",        importance: 69, level: 52 },
      { skill: "Speaking",                       importance: 66, level: 54 },
      { skill: "Writing",                        importance: 63, level: 54 },
      { skill: "Judgment and Decision Making",   importance: 60, level: 52 },
    ],
    notes: "Programming ranks only 41 — cybersecurity is fundamentally about understanding systems and threats, not writing code. Reading Comprehension leading reflects the importance of threat intelligence and documentation analysis.",
    radar_axes: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Active Learning", "Programming"]
  },

  "17-2031.00": {
    title: "Biomedical Engineer",
    critical: ["Reading Comprehension", "Speaking", "Writing", "Complex Problem Solving", "Judgment and Decision Making", "Mathematics", "Science"],
    high: ["Active Learning", "Technology Design"],
    top5: [
      { skill: "Reading Comprehension",          importance: 75, level: 71 },
      { skill: "Speaking",                       importance: 75, level: 61 },
      { skill: "Writing",                        importance: 75, level: 61 },
      { skill: "Complex Problem Solving",        importance: 72, level: 64 },
      { skill: "Judgment and Decision Making",   importance: 72, level: 66 },
    ],
    notes: "Most academically demanding career in this dataset — 7 critical skills including Math (72), Science (72), and three communication skills. Most balanced skill profile across technical and interpersonal domains.",
    radar_axes: ["Mathematics", "Science", "Complex Problem Solving", "Technology Design", "Writing"]
  },

  "29-1071.00": {
    title: "Physician Assistant",
    critical: ["Reading Comprehension", "Judgment and Decision Making", "Speaking", "Writing", "Active Learning", "Complex Problem Solving"],
    high: ["Science"],
    top5: [
      { skill: "Reading Comprehension",          importance: 78, level: 68 },
      { skill: "Judgment and Decision Making",   importance: 75, level: 59 },
      { skill: "Speaking",                       importance: 75, level: 57 },
      { skill: "Writing",                        importance: 75, level: 57 },
      { skill: "Active Learning",                importance: 72, level: 59 },
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
      { skill: "Speaking",                       importance: 60, level: 54 },
      { skill: "Active Learning",                importance: 56, level: 46 },
      { skill: "Writing",                        importance: 56, level: 43 },
      { skill: "Complex Problem Solving",        importance: 53, level: 45 },
      { skill: "Judgment and Decision Making",   importance: 53, level: 43 },
    ],
    notes: "No Critical-tier skills — this is the lowest overall skill intensity in the dataset. Speaking (60) ranks above all technical skills. This profile describes traditional graphic design; modern UX/product roles require substantially more technical depth.",
    radar_axes: ["Speaking", "Active Learning", "Complex Problem Solving", "Technology Design", "Writing"]
  },

  "29-1141.00": {
    title: "Registered Nurse",
    critical: ["Speaking", "Judgment and Decision Making", "Reading Comprehension"],
    high: ["Writing", "Active Learning", "Complex Problem Solving"],
    top5: [
      { skill: "Speaking",                       importance: 75, level: 61 },
      { skill: "Judgment and Decision Making",   importance: 72, level: 54 },
      { skill: "Reading Comprehension",          importance: 72, level: 61 },
      { skill: "Writing",                        importance: 69, level: 55 },
      { skill: "Active Learning",                importance: 63, level: 59 },
    ],
    notes: "Human and interpersonal skills dominate — Science (47) and Mathematics (47) are lower than most assume. The most important nursing skills are clinical judgment and communication, not technical knowledge.",
    radar_axes: ["Speaking", "Judgment and Decision Making", "Active Learning", "Complex Problem Solving", "Science"]
  },

  "19-2041.00": {
    title: "Environmental Scientist",
    critical: ["Complex Problem Solving", "Reading Comprehension", "Science", "Speaking", "Writing"],
    high: ["Active Learning", "Judgment and Decision Making", "Mathematics"],
    top5: [
      { skill: "Complex Problem Solving",        importance: 75, level: 57 },
      { skill: "Reading Comprehension",          importance: 75, level: 68 },
      { skill: "Science",                        importance: 75, level: 64 },
      { skill: "Speaking",                       importance: 75, level: 59 },
      { skill: "Writing",                        importance: 75, level: 66 },
    ],
    notes: "Five skills tie at the top (75) — Writing has the highest Level score (66) of any non-math/science skill in this dataset. Fundamentally a research-and-communication role.",
    radar_axes: ["Science", "Writing", "Complex Problem Solving", "Mathematics", "Active Learning"]
  },

  "15-1251.00": {
    title: "Computer Programmer",
    critical: ["Programming"],
    high: ["Complex Problem Solving", "Quality Control Analysis", "Reading Comprehension", "Judgment and Decision Making", "Writing"],
    top5: [
      { skill: "Programming",                   importance: 94, level: 70 },
      { skill: "Complex Problem Solving",        importance: 69, level: 55 },
      { skill: "Quality Control Analysis",       importance: 63, level: 50 },
      { skill: "Reading Comprehension",          importance: 60, level: 50 },
      { skill: "Judgment and Decision Making",   importance: 56, level: 46 },
    ],
    notes: "Highest Programming importance in the entire dataset (94, level 70). Quality Control Analysis (63) ranks 3rd — testing and code verification are core duties, not an afterthought.",
    radar_axes: ["Programming", "Complex Problem Solving", "Quality Control Analysis", "Active Learning", "Mathematics"]
  },

  "13-1111.00": {
    title: "Management Analyst / Consultant",
    critical: ["Reading Comprehension", "Complex Problem Solving", "Judgment and Decision Making", "Speaking", "Writing"],
    high: ["Active Learning"],
    top5: [
      { skill: "Reading Comprehension",          importance: 78, level: 59 },
      { skill: "Complex Problem Solving",        importance: 75, level: 57 },
      { skill: "Judgment and Decision Making",   importance: 75, level: 59 },
      { skill: "Speaking",                       importance: 75, level: 57 },
      { skill: "Writing",                        importance: 75, level: 57 },
    ],
    notes: "Communication-first, analysis-second role — four skills tie at 75. Programming scores just 22, but quantitative consulting increasingly requires SQL and Python. Negotiation (53) reflects the client-facing reality.",
    radar_axes: ["Reading Comprehension", "Judgment and Decision Making", "Complex Problem Solving", "Speaking", "Writing"]
  },

  "27-1021.00": {
    title: "Fine / Commercial Artist",
    critical: ["Reading Comprehension"],
    high: ["Complex Problem Solving", "Speaking", "Judgment and Decision Making"],
    top5: [
      { skill: "Reading Comprehension",          importance: 72, level: 59 },
      { skill: "Complex Problem Solving",        importance: 69, level: 55 },
      { skill: "Speaking",                       importance: 63, level: 57 },
      { skill: "Judgment and Decision Making",   importance: 56, level: 54 },
      { skill: "Technology Design",              importance: 53, level: 52 },
    ],
    notes: "Technology Design (53) and Science (41) score higher than expected — reflecting digital tools and color science. Complex Problem Solving ranking second highlights that creative work is fundamentally problem-solving.",
    radar_axes: ["Complex Problem Solving", "Technology Design", "Speaking", "Active Learning", "Writing"]
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
export const ROADMAP_SYSTEM_PROMPT = `
You are Mentorable's career roadmap engine. Your job is to take a student profile and a target career, and output a deeply personalized, actionable 5-phase career roadmap as JSON.

You have access to real O*NET 28.0 skill data. Use it to ground every milestone in what the career actually requires — not generic advice.

OUTPUT RULES:
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
`

// ── USER PROMPT BUILDER ───────────────────────────────────────────────────────
export function buildRoadmapPrompt(studentProfile, careerOnetCode) {
  const onetData = ONET_SKILLS[careerOnetCode]

  if (!onetData) {
    throw new Error(`No O*NET data found for code: ${careerOnetCode}. Add it to ONET_SKILLS first.`)
  }

  return `
Generate a personalized 5-phase career roadmap for the student below.

## STUDENT PROFILE
${JSON.stringify(studentProfile, null, 2)}

## TARGET CAREER — O*NET DATA (Real skill scores from O*NET 28.0 CSV exports)
Career: ${onetData.title}
O*NET Code: ${careerOnetCode}

Critical Skills (importance 70+ — MUST appear in Phase 1 or 2):
${onetData.critical.length ? onetData.critical.map(s => `  - ${s}`).join("\n") : "  - See notes below"}

High Skills (importance 55–69 — MUST appear in Phase 2 or 3):
${onetData.high.length ? onetData.high.map(s => `  - ${s}`).join("\n") : "  - See notes below"}

Top 5 Skills by Importance:
${onetData.top5.map(s => `  - ${s.skill}: importance=${s.importance}, level=${s.level}`).join("\n")}

Radar Chart Axes (use these 5 for the student's skill visualization):
${onetData.radar_axes.map(s => `  - ${s}`).join("\n")}

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
`
}

// ── API CALL ──────────────────────────────────────────────────────────────────
export async function generateRoadmap(studentProfile, careerOnetCode) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: ROADMAP_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildRoadmapPrompt(studentProfile, careerOnetCode)
        }
      ]
    })
  })

  const data = await response.json()
  const text = data.content[0].text
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

  try {
    return JSON.parse(clean)
  } catch (err) {
    console.error("Failed to parse roadmap JSON:", err)
    console.error("Raw response:", text)
    throw new Error("Roadmap generation failed — invalid JSON returned")
  }
}

// ── HELPER: get O*NET data for a career ──────────────────────────────────────
export function getCareerSkills(onetCode) {
  return ONET_SKILLS[onetCode] || null
}

// ── HELPER: get radar axes for a career ──────────────────────────────────────
export function getRadarAxes(onetCode) {
  return ONET_SKILLS[onetCode]?.radar_axes || []
}

// ── HELPER: list all available careers ───────────────────────────────────────
export function listCareers() {
  return Object.entries(ONET_SKILLS).map(([code, data]) => ({
    code,
    title: data.title,
    criticalSkillCount: data.critical.length,
    hasData: data.top5.length > 0
  }))
}

// ── TEST PROFILES ─────────────────────────────────────────────────────────────
export const testProfiles = {

  jordan: {
    id: "test-jordan",
    name: "Jordan Lee",
    age: 17,
    gradeLevel: "High School Senior",
    location: "Austin, TX",
    traits: {
      systemsThinking: 88,
      selfDirectedLearning: 82,
      detailOriented: 76,
      creativeProblemSolving: 79,
      collaborative: 68
    },
    motivations: ["Building things others use", "Financial independence", "Solving logical puzzles"],
    avoids: ["Repetitive tasks", "Ambiguous instructions"],
    currentSkills: ["Excel basics", "Some algebra"],
    priorExperience: "Built a spreadsheet system for family business without realizing it was programming",
    constraints: { financial: "Needs part-time work in college", firstGenCollege: true },
    conversationHighlight: "Said 'I always try to fix the broken system, not just work around it'"
  },

  maya: {
    id: "test-maya",
    name: "Maya Patel",
    age: 19,
    gradeLevel: "College Sophomore",
    location: "Chicago, IL",
    traits: {
      empathy: 90,
      detailOriented: 88,
      creativeProblemSolving: 92,
      selfDirectedLearning: 78,
      collaborative: 84
    },
    motivations: ["Making technology feel human", "Creative work with real impact"],
    avoids: ["Pure code work", "Work with no visual component"],
    currentSkills: ["Adobe Illustrator", "Photography", "Basic HTML"],
    priorExperience: "Redesigned her university's club website after finding it confusing",
    constraints: { timeline: "2 years to graduation, wants internship next summer" },
    conversationHighlight: "Said 'I get frustrated when things are confusing when they don't have to be'"
  },

  devon: {
    id: "test-devon",
    name: "Devon Kim",
    age: 16,
    gradeLevel: "High School Junior",
    location: "New York, NY",
    traits: {
      analyticalThinking: 94,
      detailOriented: 90,
      systemsThinking: 84,
      selfDirectedLearning: 74,
      riskTolerance: 62
    },
    motivations: ["Understanding how markets work", "High earning potential", "Intellectual challenge"],
    avoids: ["Creative ambiguity", "Work without clear metrics"],
    currentSkills: ["AP Calculus BC", "Statistics", "Excel", "Debate"],
    priorExperience: "Runs a paper trading account, reads WSJ daily",
    constraints: { timeline: "2 years before college — wants to stand out in admissions" },
    conversationHighlight: "Said 'I want to understand why things are priced the way they are'"
  },

  aaliyah: {
    id: "test-aaliyah",
    name: "Aaliyah Johnson",
    age: 21,
    gradeLevel: "College Senior",
    location: "Atlanta, GA",
    traits: {
      empathy: 88,
      collaborative: 90,
      selfDirectedLearning: 86,
      detailOriented: 82,
      creativeProblemSolving: 76
    },
    motivations: ["Merging science and technology", "Healthcare problems", "Financial upgrade"],
    avoids: ["Pure research with no product"],
    currentSkills: ["Python basics (self-taught)", "Research methodology", "Biology/chemistry"],
    priorExperience: "Built a Python script to automate lab data processing that her whole lab adopted",
    constraints: { timeline: "Graduating in 4 months — needs job-ready skills fast" },
    conversationHighlight: "Said 'I accidentally built a tool my entire lab started using and that was the best feeling'"
  }
}

// ── USAGE EXAMPLES ────────────────────────────────────────────────────────────
/*
  // Generate a roadmap:
  import { generateRoadmap, testProfiles } from './roadmapGeneratorPrompt'
  const roadmap = await generateRoadmap(testProfiles.jordan, "15-1252.00")

  // Get radar axes for career match screen:
  import { getRadarAxes } from './roadmapGeneratorPrompt'
  const axes = getRadarAxes("15-1212.00") // ["Reading Comprehension", "Complex Problem Solving", ...]

  // List all supported careers:
  import { listCareers } from './roadmapGeneratorPrompt'
  const careers = listCareers() // [{ code, title, criticalSkillCount, hasData }]

  // Available O*NET codes:
  // 15-1252.00  Software Developer / Engineer
  // 15-1255.01  UX Designer / Video Game Designer
  // 15-1254.00  Web Developer
  // 15-2051.00  Data Scientist (no CSV data — uses estimated axes)
  // 11-2021.00  Marketing Manager
  // 15-2011.00  Actuary
  // 15-1212.00  Cybersecurity Analyst
  // 17-2031.00  Biomedical Engineer
  // 29-1071.00  Physician Assistant
  // 13-2051.00  Financial Analyst (no CSV data — uses estimated axes)
  // 27-1024.00  Graphic Designer
  // 29-1141.00  Registered Nurse
  // 19-2041.00  Environmental Scientist
  // 15-1251.00  Computer Programmer
  // 13-1111.00  Management Analyst / Consultant
  // 27-1021.00  Fine / Commercial Artist

  // TESTING CHECKLIST:
  // Run all 4 test profiles through generateRoadmap()
  // Check that:
  //   ✓ onetSkillAddressed matches a real skill from the career's critical/high lists
  //   ✓ Critical skills appear in Phase 1 or 2 milestones
  //   ✓ radarAxes in skillGapAnalysis matches the career's radar_axes
  //   ✓ personalNote references the student's conversationHighlight or specific trait
  //   ✓ Jordan vs Maya roadmaps feel meaningfully different
  //   ✓ Devon's roadmap references NYC and finance-specific opportunities
  //   ✓ Aaliyah's roadmap acknowledges her 4-month urgency constraint
  //   ✓ JSON is valid — paste into jsonlint.com to verify
*/
