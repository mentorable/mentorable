// The stories' copy and shape (PLAN.md 6.2). Every option of the features
// showcase and the one-stage pair read the same list:
// { id, anchor, stamp, signpost, lead, rest, body, device, address, tint,
//   Screen, screenProps, useExtra, steps: [{ title, desc, ms }], caption }.
// A caption's bold lead phrase is marked with ** and rendered in ink.
import { TINT } from "../kit.js";
import RecordScreen from "../screens/RecordScreen.jsx";
import ChatScreen from "../screens/ChatScreen.jsx";
import CollegeScreen from "../screens/CollegeScreen.jsx";
import QuestScreen from "../screens/QuestScreen.jsx";
import { useSat } from "../screens/SatSlider.jsx";

const RECORD = {
  id: "record", anchor: "record", stamp: "reportcard", signpost: "Your record",
  lead: "Tell it once.", rest: "Everything else reads from it.",
  body: "Start with a short form of names and numbers. Then talk through what you actually did, typed in about five minutes or out loud in about three. You check every line before it's saved.",
  device: "laptop", address: null, tint: TINT.morning, Screen: RecordScreen, screenProps: {},
  steps: [
    { title: "Talk it through.", desc: "It asks about the activities and awards you listed, one at a time. Short answers are fine.", ms: 3200 },
    { title: "Check what it heard.", desc: "Anything it filled in from the conversation is yours to fix before it's saved.", ms: 2800 },
    { title: "Keep it in one place.", desc: "Grades, scores, courses, activities and awards in the Common App's format, ready to export as a one-page resume.", ms: 3600 },
  ],
  caption: "A sample student throughout. **Every screen is drawn from the app as it works today.**",
};

const CHAT = {
  id: "chat", anchor: "chat", stamp: "chat", signpost: "Chat",
  lead: "Ask about your actual situation.", rest: "It answers with your numbers.",
  body: "Chat reads your grades, scores, activities, College List and Quest before it answers. It brings up cost before you ask, and flags a list that is too thin at the bottom as firmly as one that is too high. Tell it something new and it can add it to your record, and it tells you when it has. It never guesses your odds.",
  device: "window", address: "mentorable.net/chat", tint: TINT.lateMorning, Screen: ChatScreen, screenProps: { variant: "window" },
  steps: [
    { title: "Ask anything about your applications.", desc: "It reads your whole record first, so the answer uses your schools and your scores.", ms: 3600 },
    { title: "It keeps your record current.", desc: "When you tell it something new, it adds it and says so.", ms: 1600 },
  ],
  caption: "A sample conversation on the Chat screen.",
};

const COLLEGES = {
  id: "colleges", anchor: "colleges", stamp: "peak", signpost: "College List",
  lead: "Sorted by a rule.", rest: "With the reason on every card.",
  body: "Search U.S. colleges by name. Admit rates, score ranges, net price and size come from the U.S. Department of Education's College Scorecard. Each school lands in reach, target or likely against your own scores, and the card says why. It's a starting point, not a prediction.",
  device: "window", address: "mentorable.net/college-list", tint: TINT.afternoon, Screen: CollegeScreen, screenProps: {}, useExtra: useSat,
  steps: [
    { title: "Find a school.", desc: "Type a name, or a short one like UMich or NYU. You see where it would land before you add it.", ms: 3400 },
    { title: "See why.", desc: "Every card says why it landed where it did. Tap a figure to see what it means.", ms: 3000 },
    { title: "Move it if you know better.", desc: "Put any school where you think it belongs. The card says so when the rule disagrees, and the rule never moves it back.", ms: 3200 },
  ],
  caption: "School figures from the College Scorecard, fetched Oct 20.",
};

const QUEST = {
  id: "quest", anchor: "quest", stamp: "flag", signpost: "Quest",
  lead: "One project.", rest: "One small task a day.",
  body: "Pick something to build, prepare for or investigate. Quest asks a few quick questions, splits it into 3 to 8 milestones, and gives you one small task on each day you choose.",
  device: "phone", address: null, tint: TINT.golden, Screen: QuestScreen, screenProps: { variant: "phone" },
  steps: [
    { title: "Check in.", desc: "Each task is sized to the time you set. When it's done, say what you did in a line or two.", ms: 3000 },
    { title: "Keep the streak.", desc: "Your streak and XP go up, and your advisor replies to what you did.", ms: 2800 },
    { title: "See the whole climb.", desc: "Milestones open one at a time, all the way to the finish line.", ms: 3000 },
  ],
  caption: "Day 4 of 29, on pace for Tue, Nov 24.",
};

/** The stories in page order: Record, Chat (only when the hero does not
 *  show Chat), College List, Quest. Record's Library help desk row (the one
 *  the hero's advisor adds) shows only with hero a. */
export function storiesFor({ hero = "a" } = {}) {
  const record = { ...RECORD, screenProps: { withChatRow: hero === "a" } };
  return hero === "a" ? [record, COLLEGES, QUEST] : [record, CHAT, COLLEGES, QUEST];
}
