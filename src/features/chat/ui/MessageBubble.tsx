// One message: user (plain text) or assistant (sanitized markdown), with
// status/error indicators and actions.

import { MarkdownRenderer } from "@/features/chat/ui/MarkdownRenderer";
import { MessageActions } from "@/features/chat/ui/MessageActions";
import { StreamingCursor } from "@/features/chat/ui/StreamingCursor";
import { ThinkingIndicator } from "@/features/chat/ui/ThinkingIndicator";
import { formatTime } from "@/shared/lib/date";
import type { MessageDbRow } from "@/shared/supabase/types";
import styles from "./chat.module.css";

export interface MessageBubbleProps {
  message: MessageDbRow;
  /** Actively receiving deltas. */
  streaming?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}

export function MessageBubble({ message, streaming = false, onRetry, retrying }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const failed = message.status === "error";
  const showThinking = streaming && message.content.length === 0;
  const interrupted = Boolean((message.metadata as { interrupted?: boolean })?.interrupted);

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}>
      <div
        className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant} ${
          failed ? styles.bubbleError : ""
        }`}
      >
        {isUser ? (
          <div className={styles.userText}>{message.content}</div>
        ) : (
          <>
            {showThinking ? <ThinkingIndicator /> : null}
            {message.content ? (
              <>
                <MarkdownRenderer content={message.content} />
                {streaming ? <StreamingCursor /> : null}
              </>
            ) : null}
          </>
        )}

        {failed && message.error ? (
          <div className={styles.errorBanner} role="alert">
            {message.error}
          </div>
        ) : null}
        {interrupted && !streaming && message.content ? (
          <div className={styles.interruptedNote}>Generation stopped.</div>
        ) : null}
      </div>

      <div className={styles.messageFooter}>
        <span className={styles.messageTime}>{formatTime(message.created_at)}</span>
        <MessageActions
          content={message.content}
          failed={failed && !isUser}
          onRetry={onRetry}
          retrying={retrying}
        />
      </div>
    </div>
  );
}
