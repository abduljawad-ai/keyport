// Provider list with loading / error / empty / connected states.

import { useState } from "react";
import { useProviderKeys } from "@/features/providers/model/providerQueries";
import { AddProviderDialog } from "@/features/providers/ui/AddProviderDialog";
import { ProviderRow } from "@/features/providers/ui/ProviderRow";
import { ProviderSetupEmptyState } from "@/features/providers/ui/ProviderSetupEmptyState";
import { Button } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import type { ProviderId } from "@/shared/types/provider";
import styles from "./providers.module.css";

function ProviderListSkeleton() {
  return (
    <div className={styles.providers} aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="skeleton" style={{ height: 84, borderRadius: 16 }} />
      ))}
    </div>
  );
}

export function ProviderList() {
  const { data, isLoading, isError, error, refetch } = useProviderKeys();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replaceProviderId, setReplaceProviderId] = useState<ProviderId | undefined>(undefined);

  const openAdd = () => {
    setReplaceProviderId(undefined);
    setDialogOpen(true);
  };

  if (isLoading) {
    return <ProviderListSkeleton />;
  }

  if (isError) {
    const normalized = normalizeError(error);
    return (
      <div className="empty-state" role="alert">
        <div className="empty-state__title">Couldn't load providers</div>
        <div className="empty-state__description">
          {normalized.message || getUserFriendlyMessage(normalized.code)}
        </div>
        <div className="empty-state__action">
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const providers = data?.providers ?? [];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button onClick={openAdd}>Add provider key</Button>
      </div>

      {providers.length === 0 ? (
        <ProviderSetupEmptyState onAddProvider={openAdd} />
      ) : (
        <div className={styles.providers}>
          {providers.map((provider) => (
            <ProviderRow
              key={provider.provider_connection.id}
              provider={provider}
              onReplaceKey={(providerId) => {
                setReplaceProviderId(providerId);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AddProviderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialProviderId={replaceProviderId}
      />
    </>
  );
}
