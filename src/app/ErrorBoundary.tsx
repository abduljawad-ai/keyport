// Global React ErrorBoundary with a safe, non-technical fallback UI.
// Never renders raw error details that could leak internals.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { EmptyState, Warning } from "@/shared/ui";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log only non-sensitive diagnostic context to the console.
    console.error("Unhandled application error:", error.name, info.componentStack);
  }

  private handleReload = () => {
    window.location.assign("/");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fullscreen-center" role="alert">
          <EmptyState
            icon={Warning}
            title="Something went wrong"
            description="An unexpected error occurred. Your data is safe. Please reload the page to continue."
            action={
              <button type="button" className="btn btn--primary" onClick={this.handleReload}>
                Reload app
              </button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
