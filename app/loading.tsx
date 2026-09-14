/** Every page is force-dynamic and several block on database reads or a
 *  network probe before the first byte. Without this the browser shows the
 *  previous page, frozen, with no indication anything is happening. */
export default function Loading() {
  return (
    <div style={{ padding: "48px 0", color: "var(--muted)", fontSize: 13.5 }}>
      <span className="spinner" style={{ marginRight: 10 }} />
      Loading…
    </div>
  );
}
