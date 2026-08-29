// Chat shell: the core conversation surface.
// Owns the chat stream orchestration + provider/model selection so that
// retry uses the same target as send. Composes MessageList + Composer.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveProviders } from "@/features/providers/model/providerQueries";
import { useChatStream, useIsStreaming } from "@/features/chat/model/useChatStream";
import { Composer, type ComposerSendInput } from "@/features/chat/ui/Composer";
import { MessageList } from "@/features/chat/ui/MessageList";
import { PROVIDER_DEFAULT_MODELS, type ProviderWithKey } from "@/shared/types/provider";
import styles from "./ChatShell.module.css";

export interface ChatShellProps {
  conversationId: string | null;
}

export function ChatShell({ conversationId }: ChatShellProps) {
  const { activeProviders, isLoading: providersLoading } = useActiveProviders();
  const { send, retry, stop } = useChatStream();
  const isStreaming = useIsStreaming(conversationId);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [model, setModel] = useState("");

  // Keep a valid provider + model selected as data arrives.
  useEffect(() => {
    if (activeProviders.length === 0) {
      setSelectedConnectionId(null);
      return;
    }
    const valid = activeProviders.some((p) => p.provider_connection.id === selectedConnectionId);
    if (!valid) {
      const first = activeProviders[0];
      setSelectedConnectionId(first.provider_connection.id);
      setModel(
        first.provider_connection.default_model_id ??
          PROVIDER_DEFAULT_MODELS[first.provider_connection.provider_id] ??
          "",
      );
    }
  }, [activeProviders, selectedConnectionId]);

  const selectedProvider: ProviderWithKey | undefined = useMemo(
    () => activeProviders.find((p) => p.provider_connection.id === selectedConnectionId),
    [activeProviders, selectedConnectionId],
  );

  const handleProviderChange = useCallback(
    (connectionId: string) => {
      setSelectedConnectionId(connectionId);
      const provider = activeProviders.find((p) => p.provider_connection.id === connectionId);
      if (provider) {
        setModel(
          provider.provider_connection.default_model_id ??
            PROVIDER_DEFAULT_MODELS[provider.provider_connection.provider_id] ??
            "",
        );
      }
    },
    [activeProviders],
  );

  const handleSend = useCallback(
    async (input: ComposerSendInput) => {
      await send({
        content: input.content,
        conversationId,
        providerConnectionId: input.providerConnectionId,
        providerId: input.providerId,
        model: input.model,
      });
    },
    [conversationId, send],
  );

  // Retry a failed assistant message as a NEW attempt from the last user
  // message (does not mutate the failed row).
  const handleRetry = useCallback(async () => {
    if (!conversationId || !selectedProvider) return;
    await retry({
      conversationId,
      providerConnectionId: selectedProvider.provider_connection.id,
      providerId: selectedProvider.provider_connection.provider_id,
      model: model.trim(),
    });
  }, [conversationId, retry, selectedProvider, model]);

  return (
    <div className={styles.shell}>
      {conversationId ? (
        <MessageList conversationId={conversationId} onRetry={handleRetry} retrying={false} />
      ) : (
        <div className={styles.welcome} role="status">
          <div className={styles.welcomeTitle}>How can I help today?</div>
          <div className={styles.welcomeHint}>
            Your messages are answered by the provider you choose, using your own encrypted
            API key.
          </div>
        </div>
      )}
      <Composer
        conversationId={conversationId}
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={() => {
          if (conversationId) stop(conversationId);
        }}
        activeProviders={activeProviders}
        providersLoading={providersLoading}
        selectedConnectionId={selectedConnectionId}
        onSelectProvider={handleProviderChange}
        model={model}
        onModelChange={setModel}
      />
    </div>
  );
}

export default ChatShell;
