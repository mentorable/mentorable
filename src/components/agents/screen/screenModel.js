// The agent screen's model: the tabs an agent opened, folded from the
// "screen" events its backend streams (langgraph-service/app/nodes/agents/screen.py).
// One event per thing that really happened: a search and its results, a page
// it opened and the text it read, the facts that checked out, a draft email,
// or (Quill) the student's own doc. The same id updates one tab in place.
//
// No imports, so it can be checked with plain Node.

export const KINDS = ["search", "page", "notes", "compose", "doc"];
const STATUSES = ["active", "done", "failed"];
export const MAX_TABS = 24;

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

/** Only http(s) links ever become an href or an address on the screen. */
export function safeUrl(url) {
  if (typeof url !== "string") return "";
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clean(event) {
  const kind = KINDS.includes(event.kind) ? event.kind : null;
  if (!kind || !event.id) return null;
  const shot = { id: String(event.id).slice(0, 60), kind, status: STATUSES.includes(event.status) ? event.status : "done" };
  if (kind === "search") {
    shot.query = str(event.query, 200);
    shot.results = (Array.isArray(event.results) ? event.results : []).map((r) => {
      const url = safeUrl(r?.url);
      return url ? { url, title: str(r.title, 160) || domainOf(url), domain: str(r.domain, 80) || domainOf(url), snippet: str(r.snippet, 300) } : null;
    }).filter(Boolean).slice(0, 8);
  } else if (kind === "page") {
    shot.url = safeUrl(event.url);
    if (!shot.url) return null;
    shot.domain = str(event.domain, 80) || domainOf(shot.url);
    shot.title = str(event.title, 160);
    shot.excerpt = str(event.excerpt, 1200);
  } else if (kind === "notes") {
    shot.title = str(event.title, 80);
    shot.notes = (Array.isArray(event.notes) ? event.notes : []).map((n) => {
      const text = str(n?.text, 300);
      const url = safeUrl(n?.url);
      return text ? { text, url, domain: url ? (str(n.domain, 80) || domainOf(url)) : "" } : null;
    }).filter(Boolean).slice(0, 8);
  } else if (kind === "compose") {
    shot.to = str(event.to, 160);
    shot.subject = str(event.subject, 200);
    shot.body = str(event.body, 4000);
  } else if (kind === "doc") {
    shot.source = event.source === "word" ? "word" : event.source === "google" ? "google" : "text";
    shot.title = str(event.title, 200);
    shot.url = safeUrl(event.url);
    shot.fileName = str(event.fileName, 200);
    shot.text = str(event.text, 60000);
  }
  return shot;
}

/** Fold one event into the tabs. Anything that is not a screen event leaves
 *  them as they were. A field an update leaves empty keeps its earlier value
 *  (a "done" page keeps the title its "active" event carried). */
export function mergeScreen(shots, event) {
  if (!event || event.type !== "screen") return shots;
  const shot = clean(event);
  if (!shot) return shots;
  const at = shots.findIndex((s) => s.id === shot.id);
  if (at === -1) {
    const next = [...shots, { ...shot, seq: shots.length ? shots[shots.length - 1].seq + 1 : 1 }];
    return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
  }
  const merged = { ...shots[at] };
  for (const [k, v] of Object.entries(shot)) {
    const empty = v === "" || (Array.isArray(v) && v.length === 0 && shot.status !== "done");
    if (!empty) merged[k] = v;
  }
  const next = shots.slice();
  next[at] = merged;
  return next;
}

/** The links in a search that the agent went on to open. */
export function openedUrls(shots) {
  return new Set(shots.filter((s) => s.kind === "page" && s.status !== "failed").map((s) => s.url));
}

/** What a tab says on its strip. */
export function tabLabel(shot, agentName = "The agent") {
  if (shot.kind === "search") return shot.status === "failed" ? `${shot.query || "Search"}, didn't go through` : shot.query || "Search";
  if (shot.kind === "page") {
    if (shot.status === "failed") return `${shot.domain || "Page"}, didn't open`;
    return shot.status === "done" && shot.title ? shot.title : shot.domain || "Page";
  }
  if (shot.kind === "notes") return "Notes";
  if (shot.kind === "compose") return "Draft email";
  if (shot.kind === "doc") return shot.title || (shot.source === "word" ? "Word file" : "Your doc");
  return agentName;
}

/** One sentence saying what this tab is, for the caption and screen readers. */
export function tabSentence(shot, agentName = "The agent") {
  const who = agentName;
  if (shot.kind === "search") {
    if (shot.status === "active") return `${who} is searching the web for "${shot.query}".`;
    if (shot.status === "failed") return `${who}'s search for "${shot.query}" didn't go through.`;
    const n = shot.results.length;
    return `${who} searched for "${shot.query}" and got ${n} ${n === 1 ? "result" : "results"}.`;
  }
  if (shot.kind === "page") {
    if (shot.status === "active") return `${who} is opening ${shot.domain}.`;
    if (shot.status === "failed") return `${shot.domain} wouldn't open, so ${who} moved on.`;
    return `${who} read ${shot.title ? `"${shot.title}" on ` : ""}${shot.domain}.`;
  }
  if (shot.kind === "notes") return `${who} kept ${shot.notes.length} ${shot.notes.length === 1 ? "fact" : "facts"} it could link to a source.`;
  if (shot.kind === "compose") return `${who} wrote a draft. Nothing has been sent.`;
  if (shot.kind === "doc") {
    if (shot.status === "active") return `${who} is opening your doc.`;
    if (shot.status === "failed") return `${who} couldn't open that doc.`;
    return `${who} opened ${shot.title ? `"${shot.title}"` : "your doc"}.`;
  }
  return "";
}

/** The address bar's text: a real URL, or a plain description where there is none. */
export function addressOf(shot, agentName = "The agent") {
  if (shot.kind === "page") return { url: shot.url, text: shot.url.replace(/^https?:\/\/(www\.)?/, "") };
  if (shot.kind === "search") return { url: "", text: `Web search: ${shot.query}` };
  if (shot.kind === "notes") return { url: "", text: `${agentName}'s notes` };
  if (shot.kind === "compose") return { url: "", text: "Draft email, not sent" };
  if (shot.kind === "doc") {
    if (shot.url) return { url: shot.url, text: shot.title ? `Google Docs: ${shot.title}` : shot.url.replace(/^https?:\/\//, "") };
    return { url: "", text: shot.fileName ? `${shot.fileName}, on your computer` : "Your doc" };
  }
  return { url: "", text: "" };
}
