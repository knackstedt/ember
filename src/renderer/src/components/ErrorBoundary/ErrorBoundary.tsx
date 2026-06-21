import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** "full" covers the whole viewport (default); "section" is a compact card for localized UI sections */
  variant?: "full" | "section";
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const variant = this.props.variant ?? "full";
      if (variant === "section") {
        return <SectionFallback error={this.state.error} />;
      }
      return <FullscreenFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function FullscreenFallback({ error }: { error?: Error }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "2rem",
        color: "#ff6b6b",
        background: "#111",
        fontFamily: "monospace",
      }}
    >
      <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
      <pre
        style={{
          maxWidth: "80vw",
          overflow: "auto",
          padding: "1rem",
          background: "#1a1a1a",
          borderRadius: "8px",
          fontSize: "0.85rem",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      >
        {error?.message}
      </pre>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "1.5rem",
          padding: "0.5rem 1.5rem",
          borderRadius: "6px",
          border: "none",
          background: "#ff6b6b",
          color: "#fff",
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        Reload
      </button>
    </div>
  );
}

function SectionFallback({ error }: { error?: Error }) {
  return (
    <div
      className="h-full w-full flex items-center justify-center p-6"
      style={{ color: "var(--color-text-dim)", background: "var(--color-surface)" }}
    >
      <div
        className="flex flex-col items-center gap-3 p-6 rounded-xl max-w-md w-full"
        style={{
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="text-2xl">⚠</div>
        <h3 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
          This section failed to load
        </h3>
        <pre
          className="text-xs w-full p-3 rounded"
          style={{
            color: "#ff6b6b",
            background: "#1a1a1a",
            overflow: "auto",
            fontFamily: "monospace",
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        >
          {error?.message}
        </pre>
        <button
          className="px-4 py-1.5 rounded-md text-xs font-medium"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--color-accent)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Reload App
        </button>
      </div>
    </div>
  );
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  variant?: "full" | "section"
): React.FC<P> {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} variant={variant}>
      <Component {...props} />
    </ErrorBoundary>
  );
}
