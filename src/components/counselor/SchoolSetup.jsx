import { useEffect, useRef, useState } from "react";
import { counselorErrorMessage } from "../../lib/counselor.js";
import { Button, Card, FieldLabel, INPUT_CLASS, LINK_CLASS, Notice, inputStyle, textOnPage } from "../ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../ui/tokens.js";

// Signed in, with no school yet: name the school and say what students should
// call you. That makes the school and its join code. The limits here are the
// database's own (create_school), said before it has to refuse.

const NAME_MIN = 2;
const NAME_MAX = 120;
const DISPLAY_MAX = 80;

/**
 * email: who is signed in, so a counselor on the wrong account can tell.
 * api.createSchool(name, displayName) resolves to counselorMe()'s shape.
 * onCreated(me): the school exists. onAlready(): this account already has a
 * school (set up in another tab), so the page should load it.
 */
export default function SchoolSetup({ email, api, onCreated, onAlready }) {
  const ink = useAgentInk();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const school = name.trim();
    const mine = displayName.trim();
    if (school.length < NAME_MIN || school.length > NAME_MAX) { setProblem(counselorErrorMessage({ code: "bad_name" })); return; }
    if (!mine || mine.length > DISPLAY_MAX) { setProblem(counselorErrorMessage({ code: "bad_display_name" })); return; }
    setBusy(true);
    setProblem("");
    try {
      const me = await api.createSchool(school, mine);
      if (!alive.current) return;
      if (!me?.school) throw new Error("no school came back");
      onCreated(me);
    } catch (err) {
      if (!alive.current) return;
      if (err?.code === "already_counselor") { onAlready(); return; }
      setProblem(counselorErrorMessage(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const small = { margin: 0, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.6 };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: "min(4vh, 2rem)" }}>
      <Card style={{ padding: "1.6rem 1.5rem 1.7rem" }}>
        <h1 style={{ margin: 0, fontFamily: SANS, fontSize: "1.7rem", fontWeight: 800, color: TEXT, lineHeight: 1.2,
          letterSpacing: "-0.02em" }}>
          Set up your school
        </h1>
        <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.6 }}>
          Name your school and you get a join code to give your students. They enter it in Mentorable, then choose
          what to share with you.
        </p>

        <form onSubmit={submit} noValidate style={{ marginTop: 18 }}>
          <div>
            <FieldLabel htmlFor="school-name">School name</FieldLabel>
            <input id="school-name" type="text" className={INPUT_CLASS} value={name} maxLength={NAME_MAX} disabled={busy}
              autoComplete="organization" onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginTop: 14 }}>
            <FieldLabel htmlFor="school-display-name" hint="As students will see it, like Ms. Rivera.">
              Your name
            </FieldLabel>
            <input id="school-display-name" type="text" className={INPUT_CLASS} value={displayName} maxLength={DISPLAY_MAX}
              disabled={busy} autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </div>

          {problem && <Notice tone="error" style={{ marginTop: 14 }}>{problem}</Notice>}

          <Button kind="primary" type="submit" busy={busy} style={{ width: "100%", marginTop: 18 }}>
            Create my school
          </Button>
        </form>
      </Card>

      {email && (
        <p style={{ ...small, margin: "16px 4px 0", overflowWrap: "anywhere" }}>
          You are signed in as {email}. If that is the wrong account, sign out at the top of the page.
        </p>
      )}
      <p style={{ ...small, margin: "8px 4px 0" }}>
        This page is for school counselors. Are you a student?{" "}
        <a href="/auth" className={LINK_CLASS} style={{ color: textOnPage(ink), fontWeight: 700 }}>Go to your Mentorable</a>.
      </p>
    </div>
  );
}
