import { supabase } from "./supabase.js";

/**
 * The current user, validated against the server.
 *
 * `getSession()` reads the token out of localStorage without checking it, so a
 * revoked or expired session still looks live to anything that trusts it.
 * `getUser()` actually asks the server. When it says no, we purge the dead local
 * token: otherwise it sits there and keeps re-triggering whatever routing logic
 * believed it, which is how /auth and /onboarding ended up bouncing off each
 * other indefinitely.
 */
export async function getValidUser() {
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (user) return user;

  try {
    // Local scope only: there's no valid session to revoke server-side, we just
    // need the stale token out of this browser.
    await supabase.auth.signOut({ scope: "local" });
  } catch { /* best effort — the redirect below still gets them somewhere sane */ }
  return null;
}

/**
 * Guard for a protected page. Returns the user, or null after sending them to
 * /auth.
 *
 * Uses `replace` so a bounce doesn't stack history entries the student then has
 * to mash Back through.
 */
export async function requireUser() {
  const user = await getValidUser();
  if (!user) {
    if (window.location.pathname !== "/auth") window.location.replace("/auth");
    return null;
  }
  return user;
}
