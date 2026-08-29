// Provider setup empty state: shown when no provider connection exists.

import { Button } from "@/shared/ui";

export interface ProviderSetupEmptyStateProps {
  onAddProvider: () => void;
  compact?: boolean;
}

export function ProviderSetupEmptyState({ onAddProvider, compact = false }: ProviderSetupEmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">🔑</div>
      <div className="empty-state__title">No providers connected yet</div>
      <div className="empty-state__description">
        Keyport uses your own AI provider keys. Add one to start chatting — it is stored
        encrypted and works on all your devices.
      </div>
      {!compact ? (
        <div className="empty-state__action">
          <Button onClick={onAddProvider}>Add provider key</Button>
        </div>
      ) : null}
    </div>
  );
}
