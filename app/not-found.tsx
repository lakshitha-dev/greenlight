import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ maxWidth: 560, padding: "48px 0" }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Not found
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>No such request</h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
        It may have been removed, or the database may have been re-seeded since this link was made.
      </p>
      <Link className="btn primary" href="/">
        Back to the queue
      </Link>
    </div>
  );
}
