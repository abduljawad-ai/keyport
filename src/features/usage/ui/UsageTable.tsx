// Usage history table (read-only projection of usage_events).

import { Button } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib/date";
import { PROVIDER_LABELS, type ProviderId } from "@/shared/types/provider";
import type { UsageEventRow } from "@/shared/supabase/types";
import styles from "./usage.module.css";

function providerLabel(providerId: string | null): string {
  if (!providerId) return "—";
  return PROVIDER_LABELS[providerId as ProviderId] ?? providerId;
}

export interface UsageTableProps {
  events: UsageEventRow[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function UsageTable({ events, hasMore = false, onLoadMore }: UsageTableProps) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Provider</th>
            <th scope="col">Model</th>
            <th scope="col" className={styles.numeric}>Input</th>
            <th scope="col" className={styles.numeric}>Output</th>
            <th scope="col" className={styles.numeric}>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td className={styles.nowrap}>{formatDateTime(event.created_at)}</td>
              <td>{providerLabel(event.provider_id)}</td>
              <td className={styles.modelCell}>{event.model_id ?? "—"}</td>
              <td className={styles.numeric}>{event.input_tokens ?? "—"}</td>
              <td className={styles.numeric}>{event.output_tokens ?? "—"}</td>
              <td className={styles.numeric}>
                {event.cost_estimate != null ? `$${event.cost_estimate}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && onLoadMore ? (
        <div className={styles.loadMore}>
          <Button variant="secondary" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
