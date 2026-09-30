// The Agents registry: one entry per specialist on the Agents page. The hub,
// the nav and each agent's screens read it, so turning on agent number two is
// an entry here (status "live", a route, a mascot) plus its own screen.
//
// Persona lines are written here, never generated: short and warm, a light
// postal or beach pun now and then, and instructions always plain. No em
// dashes (house rule), and never mean about a slow reply.

const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;

/** Beaker, the outreach pelican. Every line the outreach screens show. */
export const BEAKER_LINES = {
  hubTagline: "I find the right person, read up on their work, and help you write a short email that sounds like you.",

  boardHello: "Welcome to the mail room. Everyone you're reaching out to lives here.",
  boardEmpty: "Nothing in my pouch yet. Tell me a person you'd like to reach, or a goal, and I'll help you write to them.",
  boardNoTries: "You've used both of your tries, so I can't start a new search. Everything here still works: add people by hand, edit drafts and send what's ready.",
  nudge: (name, n) => `It's been ${days(n)} since you wrote to ${name}. People get busy, so a short, friendly follow-up is fair.`,

  who: "Who should this letter go to? Name someone you have in mind, or give me a goal and I'll find a few people.",
  shortlist: "I found a few people who fit. Pick the one you'd most like to hear from.",
  details: "A few quick choices so the email says what you mean, in a voice that sounds like you.",
  researching: [
    "Flying over to their corner of the internet.",
    "Reading about their recent work.",
    "Only keeping facts I can link to a source.",
    "Looking for an address on their own pages.",
    "Writing a first draft for you to edit.",
  ],
  question: "One quick question before I write, so I don't have to guess.",
  ambiguous: "A few people share that name. Which one did you mean?",
  notFound: "I couldn't find that person anywhere I trust. Check the spelling, or add their school or company.",
  noEmail: "I couldn't find an email on their own pages, and I never guess one. Paste one you trust, or open their page.",
  draftReady: "Special delivery! Here's your draft. Read it, make it yours, and check each fact against its source.",
  sendConfirm: "Ready to send? It goes from your Gmail exactly as written, and it can't be unsent.",
  sent: "Sent! Your letter is on its way. Replies often take a week or two, and that's normal.",

  gmailPitch: "Connect Gmail and I'll send emails for you, only when you press Send. I can't read your inbox.",
  safety: "A few ground rules. Use your school email or one your family approves. Tell a parent or teacher who you're writing to. Meet only in public or on campus. Never share your phone number or home address.",

  followupCountdown: (n) => (n > 0
    ? `No reply yet? That's normal. In ${days(n)} you can send one short follow-up.`
    : "No reply yet? That's normal. You can send one short follow-up now."),
  followupReady: "It's been a while, and a gentle nudge is fair. I can draft a short follow-up in the same thread.",

  triesLeft: (left, limit) => (left > 0
    ? `${left} of ${limit} ${limit === 1 ? "try" : "tries"} left`
    : "No tries left"),
  error: "A gust knocked me off course. Nothing was lost, so give it another try in a moment.",
};

/**
 * `status`: "live" (on the hub, opens its route) or "soon" (a sleeping
 * silhouette, "???", one hint word, never a promise about what it will do).
 * `mascot` names a sprite in components/agents/Mascot.jsx.
 */
export const AGENTS = [
  {
    id: "outreach",
    name: "Beaker",
    role: "Outreach pelican",
    tagline: BEAKER_LINES.hubTagline,
    route: "/agents/outreach",
    status: "live",
    mascot: "beaker",
    hint: "Letters",
    lines: BEAKER_LINES,
  },
  { id: "owl", name: "???", role: "", tagline: "", route: null, status: "soon", mascot: "owl", hint: "Wise", lines: {} },
  { id: "fox", name: "???", role: "", tagline: "", route: null, status: "soon", mascot: "fox", hint: "Clever", lines: {} },
  { id: "turtle", name: "???", role: "", tagline: "", route: null, status: "soon", mascot: "turtle", hint: "Steady", lines: {} },
];

/** The registry entry for an agent id (or a mascot key), or null. */
export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) || AGENTS.find((a) => a.mascot === id) || null;
}
