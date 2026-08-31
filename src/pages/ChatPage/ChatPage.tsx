// Chat page: renders the chat shell for /chat and /chat/:conversationId.

import { useParams } from "react-router-dom";
import { useConversation } from "@/features/chat/model/useConversations";
import { ChatShell } from "@/widgets/ChatShell";
import { ChatCircleDots, EmptyState } from "@/shared/ui";

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { data: conversation, isLoading, isError } = useConversation(conversationId);

  if (conversationId && !isLoading && (isError || !conversation)) {
    return (
      <div className="fullscreen-center">
        <EmptyState
          icon={ChatCircleDots}
          title="Conversation not found"
          description="This conversation may have been deleted or you may not have access to it."
          action={
            <a className="btn btn--primary" href="/chat">
              Back to chat
            </a>
          }
        />
      </div>
    );
  }

  return <ChatShell conversationId={conversationId ?? null} />;
}

export default ChatPage;
