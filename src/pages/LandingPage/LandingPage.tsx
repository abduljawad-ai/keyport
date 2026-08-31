// Public landing page — the primary indexable page for Keyport.
// This is what Googlebot crawls, so it carries the product value prop and
// the creator's identity ("Abdul Jawad Gopang") for personal-brand ranking.

import { AppIcon } from "@/shared/ui";
import styles from "./landing.module.css";

const FEATURES = [
  {
    icon: "🔑",
    title: "Bring your own key",
    description:
      "Connect your existing AI provider API keys. No monthly subscription and no vendor lock-in.",
  },
  {
    icon: "🔒",
    title: "Encrypted, server-side only",
    description:
      "Your keys are stored encrypted and used only server-side. They are never returned to your browser.",
  },
  {
    icon: "💬",
    title: "Private AI chat",
    description:
      "Chat with your chosen models while keeping your data and credentials under your control.",
  },
];

const FAQ = [
  {
    q: "What is Keyport?",
    a: "Keyport is a private, bring-your-own-key (BYOK) AI chat application. Instead of paying a monthly subscription, you connect your own AI provider API keys and chat with your chosen models directly.",
  },
  {
    q: "Are my API keys stored safely?",
    a: "Yes. Keyport encrypts your API keys at rest and uses them only server-side. Your keys are never returned to your browser, so they stay out of client-side code and out of the hands of third parties.",
  },
  {
    q: "Who created Keyport?",
    a: "Keyport is built and maintained by Abdul Jawad Gopang (also known as Jawad Gopang), a software developer focused on privacy-first web applications. You can follow his work on GitHub.",
  },
  {
    q: "What is a bring-your-own-key AI chat app?",
    a: "A BYOK AI chat app lets you supply your own provider API keys (for example, from your preferred AI provider) and use them to run conversations. It gives you control over which models you use and how your data is handled.",
  },
  {
    q: "Do I need a subscription to use Keyport?",
    a: "No. Keyport has no monthly subscription. You bring your own API keys, and you only pay your provider's normal usage costs — nothing more.",
  },
];

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <AppIcon kind="brand" size={20} />
          </span>
          <span className={styles.brandName}>Keyport</span>
        </div>
        <nav className={styles.navLinks} aria-label="Main">
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
          <a href="#about">About</a>
          <a className="btn btn--primary btn--sm" href="/auth">
            Sign in
          </a>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Secure BYOK AI chat</p>
          <h1 className={styles.title}>
            Chat with AI using <span className={styles.accent}>your</span> own API keys
          </h1>
          <p className={styles.lede}>
            Keyport is a private, bring-your-own-key AI chat app created by Abdul Jawad
            Gopang. You bring the provider API keys; Keyport stores them encrypted and
            uses them server-side only — so nothing sensitive ever touches your browser.
          </p>
          <div className={styles.ctaRow}>
            <a className="btn btn--primary btn--lg" href="/auth">
              Create your account
            </a>
            <a className="btn btn--secondary btn--lg" href="#features">
              Learn more
            </a>
          </div>
        </section>

        <section id="features" className={styles.section}>
          <h2 className={styles.sectionTitle}>Why Keyport</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <article key={f.title} className={styles.feature}>
                <div className={styles.featureIcon} aria-hidden="true">
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className={styles.section}>
          <h2 className={styles.sectionTitle}>About the creator</h2>
          <p className={styles.aboutText}>
            Keyport is built and maintained by <strong>Abdul Jawad Gopang</strong> (also
            known as Jawad Gopang), a software developer focused on privacy-first web
            applications. You can find his work on{" "}
            <a href="https://github.com/abduljawad-ai" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
        </section>

        <section id="faq" className={styles.section}>
          <h2 className={styles.sectionTitle}>Frequently asked questions</h2>
          <div className={styles.faqList}>
            {FAQ.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>{item.q}</summary>
                <p className={styles.faqAnswer}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Keyport — Secure AI Chat by Abdul Jawad Gopang. Your API keys are stored
          encrypted and used server-side only.
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
