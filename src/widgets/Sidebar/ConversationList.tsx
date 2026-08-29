// Sidebar conversation list: loading / empty / items.

import { ConversationItem } from "@/features/conversations/ui/ConversationItem";
import { EmptyState } from "@/shared/ui";
import type { ConversationDbRow } from "@/shared/supabase/types";
import styles from "./sidebar.module.css";

export interface ConversationListProps {
  conversations: ConversationDbRow[];
  isLoading: boolean;
  onNavigate?: () => void;
}

export function ConversationList({ conversations, isLoading, onNavigate }: ConversationListProps) {
  if (isLoading) {
    return (
      <div className={styles.list}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton" style={{ height: 42, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        description="Start a new chat and it will show up here."
      />
    );
  }

  return (
    <div className={styles.list} onClickCapture={onNavigate} role="navigation" aria-label="Conversations">
      {conversations.map((conversation) => (
        <ConversationItem key={conversation.id} conversation={conversation} />
      ))}
    </div>
  );
}

export default ConversationList;
