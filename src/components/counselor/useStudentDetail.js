import { useCallback, useEffect, useRef, useState } from "react";
import { counselorErrorMessage } from "../../lib/counselor.js";
import { ENTRY_PATH, entryPath } from "./counselorUi.jsx";

// How the two pages about one student (their shared sections, and the
// printable record) load: who is signed in, their school, and that student's
// shared record, which is one call to the counselor_student() SQL function.
// That function is the guard. It answers only for a student linked to the
// caller's school, and only with the sections that student shares; this hook
// adds no access and keeps nothing once the page is left.
//
// api: { getValidUser, counselorMe, loadStudent }. here: this page's path,
// to come back to after signing in.
//
// phase: "loading", "ready", "gone" (not linked to this school: never was,
// left, or was removed, which the function does not tell apart) or "error".

export function useStudentDetail({ api, navigate, studentId, here }) {
  const [phase, setPhase] = useState("loading");
  const [me, setMe] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const loads = useRef(0);   // counts loads, so only the newest one settles the page

  const load = useCallback(async () => {
    const turn = ++loads.current;
    const stale = () => !alive.current || turn !== loads.current;
    setPhase("loading");
    setError("");
    setDetail(null);
    try {
      const user = await api.getValidUser();
      if (stale()) return;
      // Signed out: the counselor's own sign-in, never the students' one.
      if (!user) { navigate?.(entryPath(here), { replace: true }); return; }
      const [mine, got] = await Promise.all([
        api.counselorMe(),
        api.loadStudent(studentId).then((d) => ({ detail: d }), (e) => ({ failed: e })),
      ]);
      if (stale()) return;
      // Not a counselor: the entry page is where a school is set up.
      if (!mine) { navigate?.(ENTRY_PATH, { replace: true }); return; }
      setMe(mine);
      if (got.failed) {
        const code = got.failed?.code;
        if (code === "not_linked") { setPhase("gone"); return; }
        if (code === "not_signed_in") { navigate?.(entryPath(here), { replace: true }); return; }
        throw got.failed;
      }
      if (!got.detail?.student) { setPhase("gone"); return; }
      setDetail(got.detail);
      setPhase("ready");
    } catch (e) {
      console.error("[counselor] student load failed:", e?.code || e?.message || "error");
      if (stale()) return;
      setError(counselorErrorMessage(e));
      setPhase("error");
    }
  }, [api, navigate, studentId, here]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  return { phase, me, detail, error, reload: load };
}
