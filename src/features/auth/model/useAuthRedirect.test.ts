import { describe, expect, it } from "vitest";
import { getAuthRedirectTarget } from "./useAuthRedirect";

describe("getAuthRedirectTarget", () => {
  it("does not redirect while auth is still resolving", () => {
    expect(getAuthRedirectTarget({ isAuthenticated: null, pathname: "/chat" })).toBeNull();
    expect(getAuthRedirectTarget({ isAuthenticated: null, pathname: "/auth" })).toBeNull();
  });

  it("redirects unauthenticated users from protected routes to /auth", () => {
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "/chat" })).toBe("/auth");
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "/chat/abc" })).toBe("/auth");
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "/settings/providers" })).toBe(
      "/auth",
    );
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "/usage" })).toBe("/auth");
  });

  it("keeps unauthenticated users on public routes", () => {
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "/auth" })).toBeNull();
    expect(getAuthRedirectTarget({ isAuthenticated: false, pathname: "*" })).toBeNull();
  });

  it("bounces authenticated users away from /auth to /chat", () => {
    expect(getAuthRedirectTarget({ isAuthenticated: true, pathname: "/auth" })).toBe("/chat");
  });

  it("keeps authenticated users on protected routes", () => {
    expect(getAuthRedirectTarget({ isAuthenticated: true, pathname: "/chat" })).toBeNull();
    expect(getAuthRedirectTarget({ isAuthenticated: true, pathname: "/chat/x" })).toBeNull();
  });
});
