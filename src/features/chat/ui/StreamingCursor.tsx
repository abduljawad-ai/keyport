// Blinking cursor shown while assistant text is streaming in.

import styles from "./chat.module.css";

export function StreamingCursor() {
  return <span className={styles.streamingCursor} aria-hidden="true" />;
}
