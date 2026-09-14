"use client";

import { useEffect } from "react";

/** Any throw inside a route segment lands here instead of Next's bare 500.
 *  The digest is shown deliberately: it is the only handle a user has when
 *  they report the problem, and the server log is keyed by it. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[greenlight] route error", error);
  }, [error]);

  return (
    <div style={{ maxWidth: 620, padding: "48px 0" }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Something failed
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>This page could not be loaded</h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
        The rest of GreenLight is unaffected — no decision or audit record has been changed.
      </p>
      <div className="email" style={{ marginBottom: 20 }}>
        {error.message || "No message was attached to the error."}
        {error.digest && `\n\nReference: ${error.digest}`}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={reset}>
          Try again
        </button>
        <a className="btn" href="/">
          Back to the queue
        </a>
      </div>
    </div>
  );
}
