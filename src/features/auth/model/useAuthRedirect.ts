// Auth redirect logic.
// The pure function getAuthRedirectTarget() is unit-testable; the hook
// applies it with the router.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/features/auth/model/authQueries";

export interface AuthRedirectParams {
  /** null while the session is still resolving — never redirect then. */
  isAuthenticated: boolean | null;
  pathname: string;
}

/** Protected prefixes from the spec's route table (Part 4 §6). */
const PROTECTED_PREFIXES = ["/chat", "/settings", "/usage"] as const;

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Returns the path to redirect to, or null when no redirect is needed.
 * Rules (spec Part 4 §6–7):
 *   - unauthenticated users are sent to /auth from protected routes only
 *     (/chat, /settings/*, /usage); the not-found route stays public
 *   - authenticated users are kept away from /auth
 *   - never redirect while auth state is unresolved
 */
export function getAuthRedirectTarget(params: AuthRedirectParams): string | null {
  const { isAuthenticated, pathname } = params;
  if (isAuthenticated === null) return null;
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/");
  if (!isAuthenticated && isProtectedRoute(pathname)) return "/auth";
  if (isAuthenticated && isAuthRoute) return "/chat";
  return null;
}

/** Watches session + location and performs redirects declaratively. */
export function useAuthRedirect(): void {
  const { session, isLoading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const target = getAuthRedirectTarget({
    isAuthenticated: isLoading ? null : session !== null,
    pathname: location.pathname,
  });

  useEffect(() => {
    if (target) navigate(target, { replace: true });
  }, [target, navigate]);
}
