// Per-message actions: copy (all), retry (failed assistant messages).

import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Button } from "@/shared/ui";
import styles from "./chat.module.css";

export interface MessageActionsProps {
  content: string;
  failed?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}

export function MessageActions({ content, failed, onRetry, retrying }: MessageActionsProps) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className={styles.messageActions}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void copy(content)}
        aria-label="Copy message content"
      >
        {copied ? "Copied ✓" : "Copy"}
      </Button>
      {failed && onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
