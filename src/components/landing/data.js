import DATA from "./landing-data.json";

// The one source of sample data for every mockup on the landing page: the
// app's own Demo Student (a junior in Columbus, Ohio, who codes), as the real
// backend and the College Scorecard produced her on 2026-10-20. Nothing here
// is typed by hand except the two made-up pieces every mockup needs and the
// plan allows: Beaker's recipient (example.edu) and the Library help desk row
// the hero's advisor adds.

/** "2026-10-20": the frozen day every mockup lives on. */
export const TODAY = DATA.today;

/** The hero conversation: { question, turn1, turn2, tool_input }. */
export const CHAT = DATA.chat;

/** Quest payloads: before the check-in, after it, and the check-in itself
 *  ({ body, reply, xp_awarded }). */
export const QUEST = {
  opened: DATA.quest.state_opened,
  after: DATA.quest.state_after,
  checkin: DATA.quest.checkin,
};

/** College List: her stats, the six rows on her list, the school the hero's
 *  advice adds, and the search that finds it. */
export const COLLEGES = {
  stats: DATA.colleges.stats,
  list: DATA.colleges.list,
  added: DATA.colleges.added,
  searchQuery: DATA.colleges.search_query,
  searchResults: DATA.colleges.search_results,
};

/** Talon's four finder items (real programs, read from their providers' pages). */
export const FINDER_ITEMS = DATA.agents.finder_items;

/** Quill: the essay row, its review row and the draft's text. */
export const ESSAY = DATA.agents.essay;
export const ESSAY_REVIEW = DATA.agents.essay_review;
export const ESSAY_BODY = DATA.agents.essay_body;

/** The student's record: profile, activities, awards, courses, test_scores. */
export const STUDENT = DATA.student;

/** The record shaped for RecordPanel's `sectionsFromRecord`. */
export const STUDENT_RECORD = {
  profile: DATA.student.profile,
  activities: DATA.student.activities,
  awards: DATA.student.awards,
  courses: DATA.student.courses,
  scores: DATA.student.test_scores,
};

/** The text interview, as [{ who: "interviewer" | "student", text }]. */
export const INTERVIEW = String(DATA.interview.transcript || "")
  .split(/\n\s*\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const m = /^(Interviewer|Student):\s*/.exec(line);
    return { who: m && m[1] === "Student" ? "student" : "interviewer", text: m ? line.slice(m[0].length) : line };
  });

/** The activity the hero's advisor adds (from the chat's tool input). */
export const LIBRARY_ROW = {
  title: "Library help desk",
  position: "Volunteer",
  grade_levels: [11],
  description: "Volunteer at the library help desk on Sundays.",
};

/**
 * Beaker's sample, made up for this page (no real professor or university
 * appears in Beaker's mockups). `paragraphs` are the draft's body, each a
 * list of spans; a span with `claim` is a highlighted fact about the
 * recipient, tied to `sources[claims[claim].source]`. `board` holds the
 * three cards on the board, in the real `outreach_contacts` field names.
 */
export const BEAKER_SAMPLE = {
  name: "Dr. Maya Okafor",
  org: "Transit Systems Lab",
  email: "m.okafor@example.edu",
  subject: "A question about bus arrival predictions",
  greeting: "Dear Dr. Okafor,",
  signoff: ["Thank you,", "Demo Student"],
  paragraphs: [
    [{ text: "Dear Dr. Okafor," }],
    [
      { text: "I'm a junior in Columbus, Ohio, building BusBuddy, a small web app that shows students when their school bus is running late. I read " },
      { text: "your lab's study of how gaps in GPS data throw off arrival estimates", claim: 0 },
      { text: ", and " },
      { text: "your finding that most errors cluster at the first stops of a route", claim: 1 },
      { text: " matches what I'm seeing on route 12." },
    ],
    [{ text: "Would you be open to two short questions by email about how you filled those gaps? Any pointers would help a lot." }],
    [{ text: "Thank you," }],
    [{ text: "Demo Student" }],
  ],
  claims: [
    { text: "your lab's study of how gaps in GPS data throw off arrival estimates", source: 0 },
    { text: "your finding that most errors cluster at the first stops of a route", source: 1 },
  ],
  sources: [
    { title: "Transit Systems Lab, Research", host: "example.edu", url: "https://example.edu/transit-lab/research" },
    { title: "Filling gaps in bus GPS data", host: "example.edu", url: "https://example.edu/transit-lab/gps-gaps" },
  ],
  board: [
    { id: "lp-brooks", stage: "to_contact", name: "Dr. Samuel Brooks", organization: "Bridge Engineering Lab", created_by: "student" },
    { id: "lp-okafor", stage: "drafted", name: "Dr. Maya Okafor", organization: "Transit Systems Lab", created_by: "agent" },
    { id: "lp-reyes", stage: "sent", name: "Prof. Daniel Reyes", organization: "Robotics Lab", created_by: "agent", sent_at: "2026-10-12T15:00:00.000Z" },
  ],
};

/** The draft's body as the review page would count it (split on whitespace). */
export const BEAKER_DRAFT_TEXT = BEAKER_SAMPLE.paragraphs.map((p) => p.map((s) => s.text).join("")).join("\n\n");

// Hero photos. a: Paxson Woelber, "Sea of clouds", Haleakala, Maui. https://unsplash.com/photos/nv7WX42LKjU (Unsplash License)
// b: ExtraCheese, https://www.pexels.com/photo/fluffy-clouds-and-blue-sky-17584946/ (Pexels License; dust healed, mirrored)
// c: Danielle Kirk, https://www.pexels.com/photo/serene-beach-sunrise-with-gentle-waves-36646802/ (Pexels License)
export const HERO_IMAGES = {
  a: { base: "/landing/hero-dusk", w: 2400, h: 1248, credit: "Paxson Woelber, Unsplash License" },
  b: { base: "/landing/hero-day", w: 2400, h: 1440, credit: "ExtraCheese, Pexels License" },
  c: { base: "/landing/hero-shore", w: 2400, h: 1144, credit: "Danielle Kirk, Pexels License" },
};

/** The resume render (720 x 428), cropped above the "Grades 11" row. */
export const RESUME_IMAGE = { src: "/landing/resume-sample.jpg", w: 720, h: 428 };
