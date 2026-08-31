// Provider setup empty state: shown when no provider connection exists.

import { Button, EmptyState, Key } from "@/shared/ui";

export interface ProviderSetupEmptyStateProps {
  onAddProvider: () => void;
  compact?: boolean;
}

export function ProviderSetupEmptyState({ onAddProvider, compact = false }: ProviderSetupEmptyStateProps) {
  return (
    <EmptyState
      icon={Key}
      title="No providers connected yet"
      description="Keyport uses your own AI provider keys. Add one to start chatting — it is stored encrypted and works on all your devices."
      action={
        !compact ? (
          <Button onClick={onAddProvider}>Add provider key</Button>
        ) : undefined
      }
    />
  );
}
