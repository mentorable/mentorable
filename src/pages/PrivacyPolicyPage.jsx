const SANS = "'Raleway', sans-serif";
const BODY = "'Raleway', sans-serif";
const BG = "#faf8f4";
const FG = "#141413";
const MUT = "#4b5563";
const P = "#1d4ed8";

const LAST_UPDATED = "October 12, 2026";

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: "2.2rem" }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.15rem", color: FG, marginBottom: "0.7rem" }}>
        {title}
      </h2>
      <div style={{ fontFamily: BODY, fontSize: "0.95rem", color: MUT, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage({ navigate }) {
  const go = navigate || ((p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); });

  return (
    <div style={{ background: BG, minHeight: "100vh", padding: "3rem clamp(1.25rem,5vw,2.5rem) 5rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <button onClick={() => go("/")} style={{
          fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: P,
          background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "2rem",
        }}>
          ← Back to Mentorable
        </button>

        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "2rem", color: FG, marginBottom: "0.4rem" }}>
          Privacy Policy
        </h1>
        <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: MUT, marginBottom: "0.6rem" }}>
          Last updated: {LAST_UPDATED}
        </p>
        <p style={{
          fontFamily: BODY, fontSize: "0.82rem", color: "#9a5b00", background: "#fff3d6",
          border: "1px solid #f0d896", borderRadius: 8, padding: "0.7rem 0.9rem", marginBottom: "2.5rem",
        }}>
          Draft, pending attorney review. This page describes our current data practices in good faith
          but has not yet been finalized by counsel.
        </p>

        <Section title="1. Who we are">
          Mentorable ("Mentorable," "we," "us") provides an AI-powered college and career guidance
          product for students at mentorable.net. This policy explains what information we collect,
          how we use it, and the choices you have.
        </Section>

        <Section title="2. Information we collect">
          <p style={{ marginBottom: "0.9rem" }}><strong>Account information.</strong> Email address and
          authentication data when you create an account (via Supabase Auth).</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Onboarding &amp; profile data.</strong> During
          voice onboarding, your spoken responses are recorded and transcribed by our voice partner,
          ElevenLabs, and processed to build a profile, including your interests, strengths, career
          matches, work style, and similar fields you provide.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Chat, research, and quest activity.</strong> Messages
          you send in Chat, research queries and results, and quest/roadmap activity are stored so the
          product can maintain context across sessions.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Outreach.</strong> When you ask Beaker, our
          outreach agent, to help you contact a professor or professional, we search the public web for that
          person's professional pages and keep the pages and facts the draft relies on, the drafts
          themselves, and the contacts on your outreach board.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Opportunity finder.</strong> When you ask Talon, our
          opportunity finder, to look for scholarships or activities, we keep the listings it finds, what you
          do with them on your board, and the search you asked for, minus the details described in section 6.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Essays.</strong> When you write with Quill, our essay
          agent, we keep the essays you write, the versions you save, the notes Quill leaves on a draft and
          your answers to them, and your essay ideas, including what you say in a brainstorm. Section 7
          explains how these are used.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Your school link.</strong> If you join a school with a
          code from your counselor, we keep which school you joined and when, which parts of your record you
          chose to share, the meeting requests you send (your message and the times you offer) and your
          counselor's answers. We also record when you try a join code, so that codes cannot be guessed.
          Section 8 explains who can see what.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Counselor accounts.</strong> If you are a school
          counselor and set up a school, we keep your email address, the school's name, your name as you
          entered it for students to see, your school's join code, and a record of the daily emails we sent
          you.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Usage analytics.</strong> We record product-usage
          events (e.g., which features you use, how often) tied to your account, via PostHog, to
          understand and improve the product.</p>
          <p><strong>Communications.</strong> If you join our waitlist or contact us, we collect the
          email address and any message you provide.</p>
        </Section>

        <Section title="3. How we use your information">
          We use your information to: provide and personalize the product (e.g., generating quests,
          chat responses, scholarship and program finds, and feedback on your essays tailored to your profile);
          maintain your account;
          show your school's counselors the parts of your record you chose to share, if you joined a school;
          operate rate limits and abuse prevention; analyze and improve the product; and communicate
          with you about your account or, if you've opted in, product updates.
        </Section>

        <Section title="4. Who we share information with">
          We share data with the service providers ("subprocessors") that power Mentorable, each
          bound by their own confidentiality and data-handling terms:
          <ul style={{ marginTop: "0.6rem", paddingLeft: "1.3rem" }}>
            <li style={{ marginBottom: "0.4rem" }}><strong>Supabase:</strong> database, authentication, and file storage.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Anthropic:</strong> processes chat, profile, Quest, outreach, opportunity-finder and essay content, and runs web searches, to generate AI responses, drafts and essay feedback.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>OpenAI:</strong> structured extraction (including reading the web pages our agents check) and, for long-term memory, turning what you write into searchable form.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Tavily:</strong> runs the web searches Beaker and Talon make, and receives only the search words.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>ElevenLabs:</strong> records and transcribes voice onboarding calls.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Google:</strong> sends the emails you approve, only if you connect Gmail (see section 5).</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Resend:</strong> sends the daily email to school counselors (see section 8). It receives the counselor's email address, their school's name and a count of waiting requests, and nothing about any student.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>PostHog:</strong> product usage analytics.</li>
            <li><strong>Render / Vercel:</strong> application hosting infrastructure.</li>
          </ul>
          <p style={{ margin: "0.9rem 0" }}>Separately, if you choose to join a school, that school's
          counselors can see what section 8 describes. They are the people who set that school up in
          Mentorable. We do not verify who they are, and they are not service providers of ours.</p>
          We do not sell your personal information.
        </Section>

        <Section title="5. Gmail, only if you connect it">
          <p style={{ marginBottom: "0.9rem" }}>You can connect your Gmail account so Beaker can send an email
          you have written and reviewed. We ask Google for two things only: your email address, and
          permission to send email on your behalf (the <code>gmail.send</code> permission). We cannot read,
          search, change or delete anything in your mailbox.</p>
          <p style={{ marginBottom: "0.9rem" }}>We use that permission only to send an email after you press
          Send on it, including a follow-up you send the same way. We store an encrypted token that allows
          sending, your Gmail address, and a record of each email we sent for you: the recipient's address, the
          date, the subject and text of your first email, and Gmail's message and thread identifiers, so your
          outreach board and follow-ups work and the same person is not emailed twice. The token is deleted when
          you disconnect Gmail; the rest when you delete the card (the record of who you emailed and when stays,
          so the one-email rule still holds) or your account.</p>
          <p style={{ marginBottom: "0.9rem" }}>We never sell Google user data, never use it for advertising,
          never use it to train AI models, and no person reads it except when you ask us for help, for
          security, or where the law requires. You can disconnect Gmail at any time from your Profile page,
          which deletes the token, or remove access in your Google Account settings.</p>
          <p>Mentorable's use and transfer to any other app of information received from Google APIs will
          adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: P }}>Google
          API Services User Data Policy</a>, including the Limited Use requirements.</p>
        </Section>

        <Section title="6. Talon, the opportunity finder">
          <p style={{ marginBottom: "0.9rem" }}>To find scholarships or activities, Talon asks for a short brief:
          what you are looking for, your interests, grade and state, your citizenship status (you can choose
          "not sure / prefer not to say"), and, only if you choose to add them, eligibility categories such as
          being the first in your family to go to college, family income, a military family, a disability,
          LGBTQ+, heritage, or openness to faith-based scholarships.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What is sent, and where.</strong> Talon turns your brief
          into a few search words and sends them to our search provider (Tavily, or Anthropic's web search when
          Tavily is unavailable). The search words can include eligibility categories you added (for example,
          "first generation scholarship") and your state, but Talon never adds your name or your school. To
          read the pages it finds and explain why each listing fits you, Talon sends your brief, a summary of
          your record without your name (your grades and scores, courses, activities, awards, intended majors
          and target colleges), and the text of those pages to our AI providers, OpenAI and Anthropic.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What is stored.</strong> The listings Talon finds (with
          the page each was checked on and when), what you do with them on your board (where each one stands,
          your notes, the requirements you tick off), and your brief without your citizenship status or any
          eligibility category. Your citizenship status and eligibility categories are used for that one search
          only: they are not saved to your profile, your long-term memory or your chat history, and they are
          not written to our logs.</p>
          <p>You can delete any listing from your board at any time. Deleting your account deletes all of it,
          along with the searches you ran.</p>
        </Section>

        <Section title="7. Quill, the essay agent">
          <p style={{ marginBottom: "0.9rem" }}>Quill helps you find what to write about and gives feedback on
          drafts of your Common App personal statement and college supplements. Quill never writes, rewrites,
          corrects or edits any part of an essay: it points to passages and asks questions, and every word of
          an essay stays yours. Quill does not search the web or look anything up about you or a school.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What is stored.</strong> The essays you write, with the
          prompt and word limit you chose; the versions you save, and a copy of the draft each time Quill
          reads it, so its notes stay attached to the words they were about; Quill's notes on each draft and
          anything you write in reply to them; and your essay ideas, with your own notes and your answers
          from a brainstorm. What you write in reply to a note stays with the review and is not sent to an
          AI provider. While you write, words that have not saved yet are also held in your own browser
          tab, so a dropped connection cannot lose them. That copy stays on your device and is removed as
          soon as the words save, when you log out, or when you close the tab.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What is sent, and when.</strong> Your writing goes to
          our AI provider, Anthropic, only when you ask Quill for something. When you ask Quill to read a
          draft, we send that draft, its prompt, the school's name for a supplement, a summary of your record
          with the name on your profile left off (your grade level, grades and scores, courses, activities,
          awards, intended majors and target colleges, and the summary of you from your onboarding
          interview), and the titles and text of your other essays, so Quill can tell you where two of them
          repeat each other. When you ask Quill to look for ideas in your record, we send that summary of
          your record, with things you said in your onboarding interview, and the names of the ideas already
          on your board, including ones you named yourself, so it does not repeat them. During a brainstorm,
          we send your answers so far and the summary of your record, and, if you started from one of your
          idea cards, that card: its name, its questions and your notes on it. Typing, saving and keeping
          versions send nothing to an AI provider.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What stays out.</strong> Your essays, their versions,
          Quill's notes and your brainstorm answers are never added to long-term memory. The chat advisor
          cannot read them: it sees only a list with each essay's title, the prompt number or school, its
          status and word count, and the names of your ideas. Essays about hard things, such as loss, illness
          or family, are read like any other essay. If a draft or an answer says you are in danger right now,
          Quill stops and shows you where to get help instead. Your essay stays where you saved it, but we do
          not keep that message or any notes on the writing; our usage analytics record only that a review
          ended this way, never the words.</p>
          <p>You can delete any essay, saved version, set of notes or idea at any time. Deleting an essay
          deletes its versions and notes with it, and deleting your account deletes all of it.</p>
        </Section>

        <Section title="8. Your school counselor, only if you join a school">
          <p style={{ marginBottom: "0.9rem" }}><strong>Joining is your choice.</strong> A school counselor
          can set up their school in Mentorable and get a join code. You are linked to a school only when
          you enter its code on your Profile page and press Join. A join link only fills the code in for
          you. You can be linked to one school at a time. We do not check that the person who set up a
          school works there, so only enter a code that your own school counselor gave you.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What a counselor always sees.</strong> While you are
          linked, the counselors of that school can see your name, grade and graduation year, the date you
          joined, and the meeting requests you send them.</p>
          <p style={{ marginBottom: "0.4rem" }}><strong>What you may choose to share.</strong> Four parts of
          your record, each with its own switch on your Profile page. All four are off until you turn them
          on:</p>
          <ul style={{ margin: "0 0 0.9rem", paddingLeft: "1.3rem" }}>
            <li style={{ marginBottom: "0.4rem" }}><strong>College List:</strong> the schools on your list,
            where each one is, whether it is sorted as a reach, target or likely and whether you or Mentorable
            sorted it, with each school's published admission rate and net price.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Portfolio:</strong> your GPA and its scale, your
            intended majors, test scores, courses, activities and awards, on a page your counselor can print
            or save as a PDF.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Quest:</strong> your quest's title and summary, when
            it started, its milestones and how far along they are, your streak, and how many check-ins you
            have made and when the last one was. Never what you wrote in a check-in.</li>
            <li><strong>Essay progress:</strong> for each essay, whether it is your personal statement or a
            supplement, its stage, its word count and word limit, and when it last changed. Never its title,
            the school it is for, its prompt, or a word of it.</li>
          </ul>
          <p style={{ marginBottom: "0.9rem" }}><strong>What a counselor's list points out.</strong> A
          counselor's list of students marks three things for them: a meeting request that is waiting for an
          answer and, only from what you share, a College List with no likely school on it and an active quest
          that has gone a week without a check-in.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>What a counselor can never see.</strong> Your chats
          with the advisor, what Mentorable remembers about you, the words, titles and prompts of your essays,
          Quill's notes on them and your brainstorm answers, what you write in Quest check-ins, Beaker's
          outreach board and emails, Talon's board, and any part of your record you have not switched on.
          A counselor's pages cannot read our database directly. Each time one of them asks for something,
          the database itself checks that you are linked to that counselor's school and that the part asked
          for is switched on.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Changing your mind.</strong> You can turn any switch
          off, or leave the school, at any time from your Profile page. Either takes effect at once: the
          next time your counselor opens or reloads a page, that part of your record, or all of it, is gone
          from their view. Leaving also deletes your meeting requests at that school. A counselor can also
          remove you from their school, which ends the link in the same way and deletes your meeting
          requests there. We cannot take back what a counselor already saw, printed or saved while it was
          shared.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Meeting requests.</strong> While you are linked you
          can ask your counselor for a meeting: a message of up to 300 characters and up to three times that
          work for you. Your school's counselors can read the request, confirm one of your times or another
          one, or decline with a short note, and you see their answer on your Profile page. You can cancel a
          request. Requests are not read around the clock and are not a way to get help in an emergency.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>The daily email to counselors.</strong> When new
          requests are waiting, we send a counselor at most one email a day, through our email provider,
          Resend. It says how many students asked for a meeting and names the school, with a link to sign
          in. It never contains a student's name, message or times.</p>
          <p><strong>If you are a counselor.</strong> Students linked to your school can see the school's
          name and your name as you entered it. What a student shares with you is the student's own record
          as they entered it. We have not verified it, and it is not an official transcript.</p>
        </Section>

        <Section title="9. Data retention">
          We retain your account and profile data for as long as your account is active. Chat and
          research history is retained to preserve product context unless you delete it. Your school link
          and your meeting requests there are kept until you leave the school, a counselor removes you, or
          you delete your account. You can
          delete your account and associated data at any time from your Profile page.
        </Section>

        <Section title="10. Your rights and choices">
          Depending on where you live, you may have the right to access, correct, export, or delete
          your personal information, and to object to or restrict certain processing. You can exercise
          most of these rights directly from your Profile page, or by contacting us at the email below.
        </Section>

        <Section title="11. Children's privacy">
          Mentorable is intended for users 13 years of age or older. We do not knowingly collect
          personal information from children under 13. If you believe a child under 13 has provided us
          information, contact us and we will delete it.
        </Section>

        <Section title="12. Security">
          We use industry-standard safeguards, including encryption in transit and access controls
          (row-level security on all database tables), to protect your information. No system is
          perfectly secure, and we cannot guarantee absolute security.
        </Section>

        <Section title="13. Changes to this policy">
          We may update this policy from time to time. We'll update the "Last updated" date above and,
          for material changes, provide additional notice.
        </Section>

        <Section title="14. Contact us">
          Questions about this policy or your data? Reach us at{" "}
          <a href="mailto:app.mentora.ai@gmail.com" style={{ color: P }}>app.mentora.ai@gmail.com</a>.
        </Section>
      </div>
    </div>
  );
}
