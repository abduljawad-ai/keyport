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
