"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <DefaultFallback error={this.state.error} onReset={this.reset} />
      );
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div className="min-h-[200px] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-gray-900">Something went wrong</p>
        <p className="text-sm text-gray-500 max-w-xs">
          {process.env.NODE_ENV === "development" ? error.message : "An unexpected error occurred in this section."}
        </p>
      </div>
      <button
        onClick={onReset}
        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

// Convenience wrapper for page sections
export function SafeSection({
  children,
  label = "section",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
          <p className="text-sm text-red-600 font-medium">
            {label} failed to load — <button className="underline" onClick={() => window.location.reload()}>reload page</button>
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
