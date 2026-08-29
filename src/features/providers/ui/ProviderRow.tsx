// One row per provider connection: status, metadata, actions.
// Only non-secret metadata is displayed (never keys or ciphertext).

import { useState } from "react";
import { useDeleteApiKeyMutation, useTestApiKeyMutation } from "@/features/providers/model/providerMutations";
import { Button, Dialog, Menu } from "@/shared/ui";
import { formatRelative } from "@/shared/lib/date";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { getProviderBaseUrl, PROVIDER_LABELS, type ProviderWithKey } from "@/shared/types/provider";
import styles from "./providers.module.css";

export interface ProviderRowProps {
  provider: ProviderWithKey;
  onReplaceKey: (providerId: ProviderWithKey["provider_connection"]["provider_id"]) => void;
}

export function ProviderRow({ provider, onReplaceKey }: ProviderRowProps) {
  const connection = provider.provider_connection;
  const keyMeta = provider.api_key_metadata;
  const testMutation = useTestApiKeyMutation();
  const deleteMutation = useDeleteApiKeyMutation();

  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const statusBadge = !keyMeta.exists ? (
    <span className="badge badge--neutral">No key</span>
  ) : keyMeta.status === "active" ? (
    <span className="badge badge--success">
      <span className="badge__dot" aria-hidden="true" /> Active
    </span>
  ) : keyMeta.status === "invalid" ? (
    <span className="badge badge--danger">
      <span className="badge__dot" aria-hidden="true" /> Invalid
    </span>
  ) : (
    <span className="badge badge--warning">
      <span className="badge__dot" aria-hidden="true" /> Disabled
    </span>
  );

  const handleTestStored = async () => {
    setTestMessage(null);
    try {
      const result = await testMutation.mutateAsync({
        provider_connection_id: connection.id,
      });
      setTestMessage(result.ok ? "Key verified with the provider." : result.message || "Key test failed.");
    } catch (err) {
      const normalized = normalizeError(err);
      setTestMessage(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(connection.id);
      setConfirmDeleteOpen(false);
    } catch {
      setConfirmDeleteOpen(false); // toast already shown by the mutation
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.rowInfo}>
        <div className={styles.rowTitle}>
          {connection.display_name || PROVIDER_LABELS[connection.provider_id]}
          {statusBadge}
        </div>
        <div className={styles.rowMeta}>
          {PROVIDER_LABELS[connection.provider_id]}
          {connection.base_url
            ? ` · ${connection.base_url}`
            : getProviderBaseUrl(connection.provider_id)
              ? ` · ${getProviderBaseUrl(connection.provider_id)}`
              : ""}
          {connection.default_model_id ? ` · default: ${connection.default_model_id}` : ""}
        </div>
        <div className={styles.rowMeta}>
          {keyMeta.exists
            ? `Verified ${keyMeta.last_verified_at ? formatRelative(keyMeta.last_verified_at) : "never"} · Used ${
                keyMeta.last_used_at ? formatRelative(keyMeta.last_used_at) : "never"
              }`
            : "No key stored for this connection."}
        </div>
        {testMessage ? (
          <div className={styles.rowMeta} role="status" aria-live="polite">
            {testMessage}
          </div>
        ) : null}
      </div>

      <Menu
        ariaLabel={`Actions for ${PROVIDER_LABELS[connection.provider_id]}`}
        trigger={<span className="btn btn--ghost btn--sm">⋯ Actions</span>}
        items={[
          ...(keyMeta.exists
            ? [
                {
                  label: testMutation.isPending ? "Testing…" : "Test key",
                  onSelect: () => void handleTestStored(),
                },
              ]
            : []),
          {
            label: keyMeta.exists ? "Replace key" : "Add key",
            onSelect: () => onReplaceKey(connection.provider_id),
          },
          "separator",
          {
            label: deleteMutation.isPending ? "Deleting…" : "Delete key",
            onSelect: () => setConfirmDeleteOpen(true),
            danger: true,
            disabled: !keyMeta.exists,
          },
        ]}
      />

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete stored key?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleteMutation.isPending}>
              Delete key
            </Button>
          </>
        }
      >
        <p>
          This removes the encrypted key for{" "}
          <strong>{PROVIDER_LABELS[connection.provider_id]}</strong>. Chats for this provider
          will stop working until you add a new key. This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}
