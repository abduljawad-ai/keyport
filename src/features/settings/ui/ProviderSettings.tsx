// Settings: Providers section — the BYOK control center.

import { ProviderList } from "@/features/providers/ui/ProviderList";
import styles from "./settings.module.css";

export function ProviderSettings() {
  return (
    <section aria-labelledby="settings-providers-heading">
      <h2 id="settings-providers-heading" className={styles.sectionTitle}>
        Providers
      </h2>
      <p className={styles.sectionDescription}>
        Connect your own AI provider API keys. Keys are encrypted before storage, used
        only server-side, and never returned to this browser.
      </p>
      <ProviderList />
    </section>
  );
}
