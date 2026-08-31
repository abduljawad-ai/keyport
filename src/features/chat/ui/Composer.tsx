// Message composer: auto-expanding textarea, provider/model selector,
// send/stop states, and guidance when no provider is connected.
// Provider/model selection is controlled by ChatShell so retry reuses it.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import { Button, Input, Label, Stop } from "@/shared/ui";
import { useToast } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { composerMessageSchema } from "@/shared/lib/validators";
import { useSettings } from "@/features/settings/model/settingsQueries";
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ProviderId,
  type ProviderWithKey,
} from "@/shared/types/provider";
import { getModelOptions, getModelsForProvider } from "@/shared/types/providerModels";
import { ModelPicker } from "@/shared/ui";
import styles from "./chat.module.css";

export interface ComposerSendInput {
  content: string;
  providerConnectionId: string;
  providerId: ProviderId;
  model: string;
}

export interface ComposerProps {
  conversationId: string | null;
  isStreaming: boolean;
  onSend: (input: ComposerSendInput) => Promise<void>;
  onStop: () => void;
  activeProviders: ProviderWithKey[];
  providersLoading?: boolean;
  selectedConnectionId: string | null;
  onSelectProvider: (connectionId: string) => void;
  model: string;
  onModelChange: (model: string) => void;
}

export function Composer({
  conversationId,
  isStreaming,
  onSend,
  onStop,
  activeProviders,
  providersLoading = false,
  selectedConnectionId,
  onSelectProvider,
  model,
  onModelChange,
}: ComposerProps) {
  const { settings } = useSettings();
  const toast = useToast();

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendBehavior =
    settings?.send_behavior === "enter-for-newline" ? "enter-for-newline" : "enter-to-send";

  // Draft is per-conversation; clear when switching.
  useEffect(() => {
    setDraft("");
  }, [conversationId]);

  const selectedProvider: ProviderWithKey | undefined =
    activeProviders.find((p) => p.provider_connection.id === selectedConnectionId) ?? undefined;

  // The provider dropdown mirrors the Settings catalog (same shared
  // PROVIDER_IDS / PROVIDER_LABELS): every supported provider appears,
  // connected ones are usable, the rest are disabled with a hint to add a key.
  const connectedProviderIds = new Set(
    activeProviders.map((p) => p.provider_connection.provider_id),
  );
  const notConnectedProviderIds = PROVIDER_IDS.filter(
    (id) => !connectedProviderIds.has(id),
  );

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  useEffect(autoResize, [draft, autoResize]);

  const canSend =
    !isStreaming &&
    Boolean(selectedProvider) &&
    draft.trim().length > 0 &&
    draft.trim().length <= 32_000 &&
    model.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSend || !selectedProvider) return;
    const parsed = composerMessageSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid message.");
      return;
    }
    const content = parsed.data;
    setDraft(""); // input clears after successful send
    try {
      await onSend({
        content,
        providerConnectionId: selectedProvider.provider_connection.id,
        providerId: selectedProvider.provider_connection.provider_id,
        model: model.trim(),
      });
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const sendOnEnter = sendBehavior === "enter-to-send" && !event.shiftKey;
    const sendOnModifier =
      sendBehavior === "enter-for-newline" && (event.ctrlKey || event.metaKey);
    if (sendOnEnter || sendOnModifier) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  if (!providersLoading && activeProviders.length === 0) {
    return (
      <div className={styles.composer}>
        <div className={styles.composerBlocked} role="status">
          <p>
            <strong>No provider connected.</strong> Add an API key to start chatting.
          </p>
          <Link className="btn btn--primary btn--sm" to="/settings/providers">
            Connect a provider
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.composer}>
      <div className={styles.composerSelectors}>
        <div className="field" style={{ minWidth: 180 }}>
          <Label htmlFor="composer-provider" className="visually-hidden">
            Provider
          </Label>
          <select
            id="composer-provider"
            aria-label="Provider"
            className="select"
            value={selectedConnectionId ?? ""}
            onChange={(event) => onSelectProvider(event.target.value)}
            disabled={isStreaming || activeProviders.length === 0}
          >
            {activeProviders.map((provider) => {
              const connection = provider.provider_connection;
              return (
                <option key={connection.id} value={connection.id}>
                  {PROVIDER_LABELS[connection.provider_id]}
                  {connection.display_name ? ` — ${connection.display_name}` : ""}
                </option>
              );
            })}
            {notConnectedProviderIds.length > 0 && (
              <optgroup label={`Not connected — add a key in Settings (${notConnectedProviderIds.length})`}>
                {notConnectedProviderIds.map((id) => (
                  <option key={id} value="" disabled>
                    {PROVIDER_LABELS[id]}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {notConnectedProviderIds.length > 0 && (
            <div className={styles.composerSyncHint}>
              Showing all supported providers.{" "}
              <Link to="/settings/providers">Add keys in Settings</Link> to enable the rest.
            </div>
          )}
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <Label htmlFor="composer-model" className="visually-hidden">
            Model
          </Label>
          {(() => {
            const providerId = selectedProvider?.provider_connection.provider_id;
            const curated = getModelsForProvider(providerId);
            // Named providers get a curated/preset dropdown; the custom
            // endpoint keeps a free-text input since its model set is
            // defined by the endpoint.
            if (!curated) {
              return (
                <Input
                  id="composer-model"
                  aria-label="Model"
                  value={model}
                  onChange={(event) => onModelChange(event.target.value)}
                  placeholder="Model id"
                  disabled={isStreaming}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={200}
                />
              );
            }
            const options = getModelOptions(providerId, model);
            return (
              <ModelPicker
                id="composer-model"
                ariaLabel="Model"
                options={options}
                value={model}
                onChange={onModelChange}
                placeholder="Select a model…"
                disabled={isStreaming}
              />
            );
          })()}
        </div>
      </div>

      <div className={styles.composerInputRow}>
        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            sendBehavior === "enter-to-send"
              ? "Send a message… (Enter to send, Shift+Enter for a new line)"
              : "Send a message… (Ctrl/Cmd+Enter to send)"
          }
          aria-label="Message"
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button variant="secondary" onClick={onStop} aria-label="Stop generating">
            <Stop size={16} weight="bold" />
            Stop
          </Button>
        ) : (
          <Button onClick={() => void handleSubmit()} disabled={!canSend} aria-label="Send message">
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
