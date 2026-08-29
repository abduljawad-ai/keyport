// Usage event queries.
// SECURITY: usage_events is READ-ONLY from the browser (RLS select-only).
// Rows are written exclusively by the chat Edge Function server-side.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/shared/supabase/client";
import { normalizeError } from "@/shared/lib/errors";
import type { UsageEventRow } from "@/shared/supabase/types";

export const USAGE_QUERY_KEY = ["usage", "events"] as const;
const PAGE_SIZE = 50;

export async function fetchUsageEvents(offset: number): Promise<UsageEventRow[]> {
  const { data, error } = await supabase
    .from("usage_events")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw normalizeError(error);
  return data ?? [];
}

export interface UseUsageEventsResult {
  data: UsageEventRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * Paginated usage history with cumulative fetching for simple "load more".
 */
export function useUsageEvents(): UseUsageEventsResult {
  const [pages, setPages] = useState(1);

  // Fresh on mount: opening the page always reflects the latest server-side
  // usage recorded by the chat Edge Function.
  const query = useQuery({
    queryKey: [...USAGE_QUERY_KEY, pages],
    queryFn: async () => {
      const rows: UsageEventRow[] = [];
      for (let page = 0; page < pages; page++) {
        const batch = await fetchUsageEvents(page * PAGE_SIZE);
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return rows;
    },
    staleTime: 30_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: (query.data?.length ?? 0) >= pages * PAGE_SIZE,
    loadMore: () => setPages((current) => current + 1),
    refetch: () => void query.refetch(),
  };
}
