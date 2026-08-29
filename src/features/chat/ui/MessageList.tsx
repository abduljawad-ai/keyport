// Message list: merges server messages with the active stream row,
// reconciles by message id, renders day separators, and manages
// auto-scroll ("follow unless the user scrolled up").

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getStreamForConversation,
  useChatStreamStore,
} from "@/features/chat/model/chatStreamStore";
import { useMessages } from "@/features/chat/model/useMessages";
import { DateSeparator } from "@/features/chat/ui/DateSeparator";
import { MessageBubble } from "@/features/chat/ui/MessageBubble";
import { ScrollToBottomButton } from "@/features/chat/ui/ScrollToBottomButton";
import { groupMessagesByDay, streamToMessageRow } from "@/features/chat/lib/messageFormatting";
import { EmptyState, Spinner } from "@/shared/ui";
import type { MessageDbRow } from "@/shared/supabase/types";
import styles from "./chat.module.css";

export interface MessageListProps {
  conversationId: string;
  onRetry: () => void;
  retrying: boolean;
}

const FOLLOW_THRESHOLD_PX = 120;

export function MessageList({ conversationId, onRetry, retrying }: MessageListProps) {
  const { data: serverMessages, isLoading } = useMessages(conversationId);
  const stream = useChatStreamStore((state) =>
    getStreamForConversation(state.streams, conversationId),
  );
  const clearStream = useChatStreamStore((state) => state.clearStream);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);

  // Merge: hide the stream row once the server row with the same id exists
  // (reconciliation by message id, spec Part 4 §16.13).
  const mergedMessages = useMemo<MessageDbRow[]>(() => {
    const base = (serverMessages ?? []) as MessageDbRow[];
    if (!stream) return base;
    if (stream.serverMessageId && base.some((row) => row.id === stream.serverMessageId)) {
      return base;
    }
    return [...base, streamToMessageRow(stream) as MessageDbRow];
  }, [serverMessages, stream]);

  // Once reconciled server-side, drop the local stream copy.
  useEffect(() => {
    if (
      stream &&
      stream.serverMessageId &&
      (serverMessages ?? []).some((row) => row.id === stream.serverMessageId)
    ) {
      clearStream(conversationId);
    }
  }, [stream, serverMessages, clearStream, conversationId]);

  const streamingRowId =
    stream && (stream.status === "starting" || stream.status === "streaming")
      ? (stream.serverMessageId ?? stream.tempId)
      : null;

  // Auto-scroll while following new content.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !following) return;
    container.scrollTop = container.scrollHeight;
  }, [mergedMessages, following]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setFollowing(distanceFromBottom < FOLLOW_THRESHOLD_PX);
  };

  const scrollToBottom = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setFollowing(true);
  };

  if (isLoading && !stream) {
    return (
      <div className="fullscreen-center" role="status">
        <Spinner size="lg" label="Loading messages" />
      </div>
    );
  }

  if (mergedMessages.length === 0) {
    return (
      <div className={styles.messagesScroll}>
        <EmptyState
          icon="💬"
          title="Start the conversation"
          description="Send your first message below. Responses stream in from your own provider key."
        />
      </div>
    );
  }

  const groups = groupMessagesByDay(mergedMessages);

  return (
    <div className={styles.messagesContainer}>
      <div ref={scrollRef} className={styles.messagesScroll} onScroll={handleScroll}>
        <div className={styles.messagesColumn}>
          {groups.map((group) => (
            <div key={group.day}>
              <DateSeparator day={group.day} />
              {group.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={message.id === streamingRowId}
                  onRetry={message.role === "assistant" ? onRetry : undefined}
                  retrying={retrying}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <ScrollToBottomButton visible={!following} onClick={scrollToBottom} />
    </div>
  );
}
