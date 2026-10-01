// The Agents registry: one entry per specialist on the Agents page. The hub,
// the nav and each agent's screens read it, so turning on another agent is an
// entry here (status "live", a route, a mascot) plus its own screens.
//
// Persona lines are written here, never generated: short and warm, a light
// pun in the agent's own world now and then (postal and beach for Beaker,
// sky and scouting for Talon), and instructions always plain. No em dashes
// (house rule), and never mean about a slow reply.

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

/** Talon, the opportunity hawk. Every line the finder screens show. A calm,
 *  keen-eyed scout: it spots, checks, and says plainly what it couldn't. */
export const TALON_LINES = {
  hubTagline: "I scout the web for real scholarships and programs that fit you, check each one on its own page, and keep the ones you like on your board.",

  boardHello: "Here's everything I've spotted for you. Save the ones worth a closer look, and keep an eye on their deadlines here.",
  boardEmpty: "Nothing spotted yet. Tell me what you're after, like a scholarship for future nurses or a free summer coding program, and I'll go scouting.",
  boardNoFinds: "You've used all your finds, so I can't go looking again. Everything here still works: save what you like, track deadlines and tick off requirements.",

  laneAsk: "What should I scout for today? Pick one, then I'll ask a few quick questions.",
  briefAsk: "Tell me what you're after and a few basics. The clearer the picture, the sharper my eyes.",
  checkAsk: "Here's what I'll search with. Fix anything I got wrong, then send me off.",
  searching: [
    "Taking off. Scanning the web for real listings.",
    "Circling the most promising pages.",
    "Reading each one on its own site, not just a list.",
    "Leaving out anything that looks like a scam.",
    "Checking deadlines, so nothing has already closed.",
  ],
  results: (n) => (n === 1
    ? "I spotted one that fits. Save it if you like it, and check the details on its page before you apply."
    : `I spotted ${n} that fit. Save the ones you like, and check the details on each page before you apply.`),
  nothingNew: "Everything I spotted is already on your board. Describe it another way and I'll look somewhere new.",
  droppedIntro: "I left these out, and here's why, so you know what to watch for:",

  staleNote: "I checked this over two weeks ago. Recheck it before you apply, in case something moved.",
  recheckDone: "I read its page again and saw no change to the deadline or the money.",
  recheckGone: "I couldn't open its page this time. It may have moved or closed, so check the provider's site before you count on it.",
  soon: (title, n) => {
    if (n <= 0) return `${title} is due today. If you're applying, now's the time.`;
    if (n === 1) return `${title} is due tomorrow. A good day to finish it.`;
    if (n <= 7) return `${title} is due in ${days(n)}. Worth setting some time aside this week.`;
    return `${title} is due in ${days(n)}. Plenty of time if you start soon.`;
  },
  findsLeft: (left, limit) => (left > 0
    ? `${left} of ${limit} ${limit === 1 ? "find" : "finds"} left`
    : "No finds left"),

  safety: "A few ground rules. Real scholarships never charge you to apply or ask for bank details or a Social Security number up front. For anything in person, tell a parent or teacher where you're going. Never share your home address or phone number with a listing.",
  error: "A crosswind threw me off course. Nothing was lost, so give it another try in a moment.",
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
  {
    id: "finder",
    name: "Talon",
    role: "Opportunity hawk",
    tagline: TALON_LINES.hubTagline,
    route: "/agents/finder",
    status: "live",
    mascot: "talon",
    hint: "Finds",
    lines: TALON_LINES,
  },
  { id: "owl", name: "???", role: "", tagline: "", route: null, status: "soon", mascot: "owl", hint: "Wise", lines: {} },
  { id: "heron", name: "???", role: "", tagline: "", route: null, status: "soon", mascot: "heron", hint: "Steady", lines: {} },
];

/** The registry entry for an agent id (or a mascot key), or null. */
export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) || AGENTS.find((a) => a.mascot === id) || null;
}
