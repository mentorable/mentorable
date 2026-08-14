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

export default function TermsOfServicePage({ navigate }) {
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
          Terms of Service
        </h1>
        <p style={{ fontFamily: BODY, fontSize: "0.85rem", color: MUT, marginBottom: "0.6rem" }}>
          Last updated: {LAST_UPDATED}
        </p>
        <p style={{
          fontFamily: BODY, fontSize: "0.82rem", color: "#9a5b00", background: "#fff3d6",
          border: "1px solid #f0d896", borderRadius: 8, padding: "0.7rem 0.9rem", marginBottom: "2.5rem",
        }}>
          Draft — pending attorney review. These terms describe our intended arrangement in good faith
          but have not yet been finalized by counsel.
        </p>

        <Section title="1. Acceptance of terms">
          By creating an account or using Mentorable ("the Service"), you agree to these Terms of
          Service and our Privacy Policy. If you do not agree, do not use the Service.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 13 years old to use the Service. If you are under 18, you confirm you
          have a parent or guardian's permission to use it.
        </Section>

        <Section title="3. Not professional advice">
          Mentorable uses AI to generate college and career guidance, quest suggestions, roadmap
          content, and research summaries. This content is for informational purposes only, may
          contain errors, and is not a substitute for advice from a licensed counselor, educator,
          financial advisor, or other professional. You are responsible for verifying any information
          before relying on it for decisions such as college applications, financial aid, or career
          choices.
        </Section>

        <Section title="4. Your account">
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activity under your account. Notify us promptly of any unauthorized use.
        </Section>

        <Section title="5. Acceptable use">
          You agree not to: misuse the Service to generate harmful, illegal, or abusive content;
          attempt to circumvent usage limits or security controls; scrape or reverse-engineer the
          Service; or use the Service in any way that violates applicable law.
        </Section>

        <Section title="6. Usage limits">
          The Service may enforce usage limits (for example, on chat messages, research queries, or
          quest generations) to manage costs during our demo period. We may change these limits at any
          time.
        </Section>

        <Section title="7. Content and intellectual property">
          You retain ownership of the information you provide. You grant us a license to use that
          information to operate and improve the Service, as described in our Privacy Policy. The
          Mentorable name, branding, and underlying software are owned by us and may not be used
          without permission.
        </Section>

        <Section title="8. Disclaimers">
          The Service is provided "as is" without warranties of any kind, express or implied, including
          warranties of merchantability, fitness for a particular purpose, or non-infringement. We do
          not warrant that the Service will be uninterrupted, error-free, or that AI-generated content
          will be accurate or complete.
        </Section>

        <Section title="9. Limitation of liability">
          To the maximum extent permitted by law, Mentorable and its affiliates will not be liable for
          any indirect, incidental, special, consequential, or punitive damages, or any loss of data,
          arising from your use of the Service.
        </Section>

        <Section title="10. Termination">
          You may stop using the Service and delete your account at any time from your Profile page. We
          may suspend or terminate access to the Service for violation of these terms or for any other
          reason, with or without notice.
        </Section>

        <Section title="11. Changes to these terms">
          We may update these terms from time to time. Continued use of the Service after changes take
          effect constitutes acceptance of the revised terms.
        </Section>

        <Section title="12. Contact us">
          Questions about these terms? Reach us at{" "}
          <a href="mailto:app.mentora.ai@gmail.com" style={{ color: P }}>app.mentora.ai@gmail.com</a>.
        </Section>
      </div>
    </div>
  );
}
