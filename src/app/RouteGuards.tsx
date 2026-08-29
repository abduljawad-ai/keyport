// Route guards.
// Rules (spec Part 4 §7):
//   * unauthenticated users are redirected to /auth
//   * authenticated users are redirected away from /auth to /chat
//   * nothing private renders while the session is still resolving

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/features/auth/model/authQueries";
import { Spinner } from "@/shared/ui";

function SessionLoadingScreen() {
  return (
    <div className="fullscreen-center" role="status" aria-label="Checking your session">
      <Spinner size="lg" label="Checking your session" />
    </div>
  );
}

/** Wrap protected routes: requires a confirmed session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) return <SessionLoadingScreen />;
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Wrap public-only routes (e.g. /auth): bounce signed-in users to /chat. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();

  if (isLoading) return <SessionLoadingScreen />;
  if (session) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}
