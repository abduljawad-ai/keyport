// Stop generation button shown while streaming.

import styles from "./chat.module.css";

export interface StopGeneratingButtonProps {
  onClick: () => void;
}

export function StopGeneratingButton({ onClick }: StopGeneratingButtonProps) {
  return (
    <button
      type="button"
      className={styles.stopButton}
      onClick={onClick}
      aria-label="Stop generating"
    >
      <span className={styles.stopSquare} aria-hidden="true" />
      Stop generating
    </button>
  );
}
