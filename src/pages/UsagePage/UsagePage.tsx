// Usage page: token usage history recorded server-side.

import { useUsageEvents } from "@/features/usage/model/usageQueries";
import { UsageSummaryCards } from "@/features/usage/ui/UsageSummaryCards";
import { UsageTable } from "@/features/usage/ui/UsageTable";
import { Button, EmptyState } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import styles from "./usagePage.module.css";

export function UsagePage() {
  const { data, isLoading, isError, error, hasMore, loadMore, refetch } = useUsageEvents();

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.heading}>Usage</h1>
        <p className={styles.subheading}>
          AI requests recorded by the server from your provider keys. Cost is shown only
          when pricing data is available.
        </p>

        {isLoading ? (
          <div className={styles.skeletonStack} aria-hidden="true">
            <div className="skeleton" style={{ height: 90, borderRadius: 16 }} />
            <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
          </div>
        ) : isError ? (
          <div className="empty-state" role="alert">
            <div className="empty-state__title">Couldn't load usage</div>
            <div className="empty-state__description">
              {normalizeError(error).message || getUserFriendlyMessage("internal_error")}
            </div>
            <div className="empty-state__action">
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No usage recorded yet"
            description="Once you send chat messages, token usage will appear here."
          />
        ) : (
          <>
            <UsageSummaryCards events={data} />
            <UsageTable events={data} hasMore={hasMore} onLoadMore={loadMore} />
          </>
        )}
      </div>
    </div>
  );
}

export default UsagePage;
