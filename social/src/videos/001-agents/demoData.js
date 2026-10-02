// The demo student and everything the agents "find" for her in video #1.
// All of it is invented: no real professor, school, lab or scholarship is
// named, so nothing real is misrepresented. Keep it that way: before adding a
// name, search it, and change it if it belongs to a real person or program.
// Every name here was searched on 2026-10-02, and the email domains
// (harborstate.edu, kelpridgehs.org) were checked unregistered with the
// registries' whois. A Gmail address is never safe to invent: it may be a
// real inbox, so the student writes from a (fictional) school account.
//
// One student runs through both agents, so the story holds together: a
// junior who volunteers at an aquarium and wants marine biology.

export const STUDENT = {
  firstName: "Maya",
  grade: "11th grade",
  state: "California",
  email: "maya.okafor@students.kelpridgehs.org",
  interest: "marine biology",
  // From her record: what Beaker's draft may say about her.
  recordFacts: [
    "two summers volunteering at the aquarium's tide pool exhibit",
    "AP Biology this year",
  ],
};

// ─── Beaker ──────────────────────────────────────────────────────────────────

export const OUTREACH_GOAL = "marine biology research near me";

export const SHORTLIST = [
  {
    name: "Dr. Lena Ortiz",
    title: "Associate Professor of Marine Ecology",
    org: "Harbor State University",
    why: "Studies how kelp forests recover after marine heatwaves.",
  },
  {
    name: "Dr. Marcus Hale",
    title: "Research Scientist",
    org: "Bayline Ocean Institute",
    why: "Runs a long-term survey of tide pool species.",
  },
  {
    name: "Dr. Ines Takahara",
    title: "Assistant Professor of Biology",
    org: "Westcove College",
    why: "Researches how sea otters shape coastal food webs.",
  },
];

export const PICKED = 0; // Dr. Lena Ortiz

export const DRAFT = {
  to: "lortiz@harborstate.edu",
  emailFoundOn: "harborstate.edu/ortiz-lab/people",
  subject: "A high school junior interested in kelp forest recovery",
  // Paragraphs as runs; a run with `source` is a claim about the recipient,
  // highlighted in the editor and tied to the page it came from.
  body: [
    [{ t: "Dear Dr. Ortiz," }],
    [
      { t: "I'm Maya, a junior in California. I read about " },
      { t: "your lab's work on how kelp forests recover after marine heatwaves", source: "harborstate.edu/ortiz-lab" },
      { t: ", and I've wanted to learn more about it ever since." },
    ],
    [
      { t: "I've spent two summers volunteering at my local aquarium's tide pool exhibit, and I'm taking AP Biology this year. I saw that " },
      { t: "your lab takes high school volunteers for summer field surveys", source: "harborstate.edu/ortiz-lab/join" },
      { t: ". Would you be open to a short call about how a student could get involved?" },
    ],
    [{ t: "Thank you for your time," }, { t: "\nMaya" }],
  ],
};

// ─── Talon ───────────────────────────────────────────────────────────────────

export const FINDER_BRIEF = {
  lane: "scholarship",
  want: "scholarships for a future marine biologist",
  interests: "ocean science, volunteering",
  grade: "11th grade",
  state: "California",
};

// What lands on the board: deadline, amount, and the provider's own page.
// Deadlines are written relative to the video's date (early October 2026).
export const LISTINGS = [
  { title: "Tidepool Futures Scholarship", provider: "Tidepool Futures Fund", amount: "$2,500", deadline: "Nov 14", daysLeft: 43,
    why: "Your tide pool volunteering is the kind of ocean service it asks for.", verified: true },
  { title: "Lanternfish STEM Award", provider: "Lanternfish Science Fund", amount: "$1,000", deadline: "Dec 1", daysLeft: 60,
    why: "Open to juniors planning a science major, like your marine biology plan.", verified: true },
  { title: "Urchin Cove Young Scientist Prize", provider: "Urchin Cove Society", amount: "$750", deadline: "Jan 9", daysLeft: 99,
    why: "Asks for a short project write-up; your AP Biology work could start one.", verified: true },
  { title: "Heronbank Outdoor Service Grant", provider: "Heronbank Trust", amount: "$1,500", deadline: "Feb 20", daysLeft: 141,
    why: "For students who volunteer outdoors in their community.", verified: false },
];

// What Talon left out, and why: the reasons are the app's own.
export const DROPPED = [
  { title: "Kelpline Youth Grant", reason: "Charges a $35 application fee." },
  { title: "Seaglass Merit Award", reason: "Its deadline has already passed." },
  { title: "Brinewater Scholars Fund", reason: "Only open to college students." },
];
