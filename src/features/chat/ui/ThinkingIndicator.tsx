// Shown while waiting for the first streamed token.
// Uses a polite live region to avoid excessive screen reader noise.

import styles from "./chat.module.css";

export function ThinkingIndicator() {
  return (
    <div className={styles.thinking} role="status" aria-live="polite">
      <span className={styles.thinkingDot} aria-hidden="true" />
      <span className={styles.thinkingDot} aria-hidden="true" />
      <span className={styles.thinkingDot} aria-hidden="true" />
      <span className="visually-hidden">Assistant is responding…</span>
    </div>
  );
}
