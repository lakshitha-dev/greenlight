"use client";

/** The last resort: a throw in the root layout, or in anything it imports,
 *  has no other handler. This replaces the whole document, so it carries its
 *  own styling rather than relying on globals.css having loaded. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#f7f8f8",
          color: "#14191a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "56px 24px",
        }}
      >
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>GreenLight could not start</h1>
          <p style={{ color: "#677577", fontSize: 14, lineHeight: 1.6 }}>
            This usually means the environment is misconfigured — most often <code>DATABASE_URL</code>{" "}
            missing or pointing somewhere unreachable.
          </p>
          <pre
            style={{
              background: "#fff",
              border: "1px solid #e2e6e6",
              borderRadius: 7,
              padding: 14,
              fontSize: 12.5,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {error.message}
            {error.digest ? `\n\nReference: ${error.digest}` : ""}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #0f7a4d",
              background: "#0f7a4d",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
