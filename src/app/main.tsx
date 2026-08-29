// Application entry point.
// Imports global styles, applies the cached theme before first paint
// (non-secret cache only — prevents a theme flash), then boots the app.
// A configuration failure (missing env vars) renders a readable fallback
// instead of a blank page.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import "@/shared/styles/tokens.css";
import "@/shared/styles/theme-light.css";
import "@/shared/styles/theme-dark.css";
import "@/shared/styles/app.css";

// Theme boot: read the non-secret cache; fall back to system preference.
(function applyBootstrapTheme() {
  try {
    const cached = window.localStorage.getItem("keyport.theme");
    if (cached === "light" || cached === "dark") {
      document.documentElement.dataset.theme = cached;
      return;
    }
  } catch {
    /* storage unavailable */
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
})();

function requireRoot(): HTMLElement {
  const element = document.getElementById("root");
  if (!element) throw new Error("Root container missing");
  return element;
}
const container = requireRoot();

async function bootstrap(): Promise<void> {
  try {
    const [{ AppProviders }, { router }] = await Promise.all([
      import("@/app/AppProviders"),
      import("@/app/router"),
    ]);
    createRoot(container).render(
      <StrictMode>
        <ErrorBoundary>
          <AppProviders>
            <RouterProvider router={router} />
          </AppProviders>
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    createRoot(container).render(
      <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 560 }}>
        <h1 style={{ fontSize: 20 }}>Configuration error</h1>
        <p style={{ color: "#555" }}>
          {error instanceof Error
            ? error.message
            : "The application could not start. Check the console for details."}
        </p>
      </div>,
    );
  }
}

void bootstrap();
