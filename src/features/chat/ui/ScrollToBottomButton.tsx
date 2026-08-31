// Floating button to jump back to the latest message.

import { ArrowDown } from "@/shared/ui";
import styles from "./chat.module.css";

export interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({ visible, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className={styles.scrollToBottom}
      onClick={onClick}
      aria-label="Scroll to latest message"
    >
      <ArrowDown size={18} weight="bold" />
    </button>
  );
}
