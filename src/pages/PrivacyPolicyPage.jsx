const SANS = "'Raleway', sans-serif";
const BODY = "'Raleway', sans-serif";
const BG = "#faf8f4";
const FG = "#141413";
const MUT = "#4b5563";
const P = "#1d4ed8";

const LAST_UPDATED = "July 22, 2026";

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
          Draft — pending attorney review. This page describes our current data practices in good faith
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
          ElevenLabs, and processed to build a profile — including your interests, strengths, career
          matches, work style, and similar fields you provide.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Chat, research, and quest activity.</strong> Messages
          you send in Chat, research queries and results, and quest/roadmap activity are stored so the
          product can maintain context across sessions.</p>
          <p style={{ marginBottom: "0.9rem" }}><strong>Usage analytics.</strong> We record product-usage
          events (e.g., which features you use, how often) tied to your account, via PostHog, to
          understand and improve the product.</p>
          <p><strong>Communications.</strong> If you join our waitlist or contact us, we collect the
          email address and any message you provide.</p>
        </Section>

        <Section title="3. How we use your information">
          We use your information to: provide and personalize the product (e.g., generating quests,
          roadmap guidance, and chat responses tailored to your profile); maintain your account;
          operate rate limits and abuse prevention; analyze and improve the product; and communicate
          with you about your account or, if you've opted in, product updates.
        </Section>

        <Section title="4. Who we share information with">
          We share data with the service providers ("subprocessors") that power Mentorable, each
          bound by their own confidentiality and data-handling terms:
          <ul style={{ marginTop: "0.6rem", paddingLeft: "1.3rem" }}>
            <li style={{ marginBottom: "0.4rem" }}><strong>Supabase</strong> — database, authentication, and file storage.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Anthropic</strong> — processes chat, research, and profile content to generate AI responses.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>ElevenLabs</strong> — records and transcribes voice onboarding calls.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>Brave Search</strong> — powers web research results.</li>
            <li style={{ marginBottom: "0.4rem" }}><strong>PostHog</strong> — product usage analytics.</li>
            <li><strong>Railway / Render / Vercel</strong> — application hosting infrastructure.</li>
          </ul>
          We do not sell your personal information.
        </Section>

        <Section title="5. Data retention">
          We retain your account and profile data for as long as your account is active. Chat and
          research history is retained to preserve product context unless you delete it. You can
          delete your account and associated data at any time from your Profile page.
        </Section>

        <Section title="6. Your rights and choices">
          Depending on where you live, you may have the right to access, correct, export, or delete
          your personal information, and to object to or restrict certain processing. You can exercise
          most of these rights directly from your Profile page, or by contacting us at the email below.
        </Section>

        <Section title="7. Children's privacy">
          Mentorable is intended for users 13 years of age or older. We do not knowingly collect
          personal information from children under 13. If you believe a child under 13 has provided us
          information, contact us and we will delete it.
        </Section>

        <Section title="8. Security">
          We use industry-standard safeguards, including encryption in transit and access controls
          (row-level security on all database tables), to protect your information. No system is
          perfectly secure, and we cannot guarantee absolute security.
        </Section>

        <Section title="9. Changes to this policy">
          We may update this policy from time to time. We'll update the "Last updated" date above and,
          for material changes, provide additional notice.
        </Section>

        <Section title="10. Contact us">
          Questions about this policy or your data? Reach us at{" "}
          <a href="mailto:app.mentora.ai@gmail.com" style={{ color: P }}>app.mentora.ai@gmail.com</a>.
        </Section>
      </div>
    </div>
  );
}
