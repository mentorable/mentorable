import { supabase } from "./supabase.js";

/**
 * My Next Move keyword search via Edge Function (API key stays server-side).
 * @param {string} keyword
 * @returns {Promise<{ career: Array<{ title: string, code: string, href: string, tags: object }>, total: number, start: number, end: number } | null>}
 */
export async function searchMnmCareers(keyword) {
  const q = String(keyword ?? "").trim();
  if (q.length < 2) return null;

  const { data, error } = await supabase.functions.invoke("onet-proxy", {
    body: {
      route: "mnm/search",
      query: { keyword: q },
    },
  });

  if (error) throw new Error(error.message || "onet-proxy invoke failed");
  if (data?.error) {
    const err = new Error(data.error);
    if (data.code === "RATE_LIMIT") err.code = "RATE_LIMIT";
    throw err;
  }
  return data?.data ?? null;
}
