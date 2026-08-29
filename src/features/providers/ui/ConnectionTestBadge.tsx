// Visual status of a provider connection key test.

import { Spinner } from "@/shared/ui";
import type { TestApiKeyResponse } from "@/shared/types/provider";

export type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "done"; result: TestApiKeyResponse };

export function ConnectionTestBadge({ state }: { state: TestState }) {
  if (state.status === "idle") return null;

  if (state.status === "testing") {
    return (
      <span className="badge badge--neutral" role="status">
        <Spinner size="sm" label="Testing key" /> Testing…
      </span>
    );
  }

  if (state.result.ok) {
    return (
      <span className="badge badge--success" role="status">
        <span className="badge__dot" aria-hidden="true" /> Valid key
      </span>
    );
  }

  return (
    <span className="badge badge--danger" role="alert">
      <span className="badge__dot" aria-hidden="true" />
      {state.result.message || "Test failed"}
    </span>
  );
}
