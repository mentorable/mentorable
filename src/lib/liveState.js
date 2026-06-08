// Live, navigation-surviving UI state. Module-level (like cache.js): persists
// across in-app page switches (React unmount/remount) but resets on hard refresh.
//
// Used so that returning to a page restores the exact chat/research you were on,
// and reflects work that's still generating/loading in the background. In-flight
// fetches are NOT aborted on unmount, so server-side work (research, quest gen,
// chat's onDone save) finishes on its own — we just need to show it on return.

const S = {
  activeChat: {},       // uid -> chatId | null   (which chat session was open)
  chatGenerating: {},   // uid -> Set<chatId>     (chats with a reply in flight)
  activeResearch: {},   // uid -> sessionId | null
  questGenerating: {},  // uid -> bool
};

// ── Chat ─────────────────────────────────────────────────────────────────────
export const getActiveChat = (uid) => (uid ? S.activeChat[uid] ?? null : null);
export const setActiveChat = (uid, id) => { if (uid) S.activeChat[uid] = id; };

export const isChatGenerating = (uid, chatId) => !!(uid && S.chatGenerating[uid]?.has(chatId));
export const markChatGenerating = (uid, chatId) => {
  if (!uid || !chatId) return;
  (S.chatGenerating[uid] ??= new Set()).add(chatId);
};
export const clearChatGenerating = (uid, chatId) => { S.chatGenerating[uid]?.delete(chatId); };

// ── Research ─────────────────────────────────────────────────────────────────
export const getActiveResearch = (uid) => (uid ? S.activeResearch[uid] ?? null : null);
export const setActiveResearch = (uid, id) => { if (uid) S.activeResearch[uid] = id; };

// ── Quests ───────────────────────────────────────────────────────────────────
export const getQuestGenerating = (uid) => !!(uid && S.questGenerating[uid]);
export const setQuestGenerating = (uid, v) => { if (uid) S.questGenerating[uid] = !!v; };
