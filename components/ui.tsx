export function Panel({
  title,
  eyebrow,
  children,
  flush,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="panel">
      <header>
        <h2>{title}</h2>
        {eyebrow && <span className={`eyebrow ${eyebrow.includes("@") ? "mono" : ""}`}>{eyebrow}</span>}
      </header>
      <div className="body" style={flush ? { padding: 0 } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v ${mono ? "mono" : ""}`}>{v}</span>
    </div>
  );
}

export function Callout({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "info" | "ok";
  children: React.ReactNode;
}) {
  return (
    <div className={`callout ${tone === "warn" ? "" : tone}`}>
      {/* decorative — without this it is announced as "black diamond" ahead of
          every explanatory paragraph in the app */}
      <span aria-hidden="true">◆</span>
      <div>{children}</div>
    </div>
  );
}

/** The status glyph. Previously hand-rolled at eight call sites, which is how
 *  "failed" came to render as ✕ on the request page and ! on the estate page —
 *  the same state, two shapes, in a UI where shape is what colour-blind and
 *  greyscale readers navigate by.
 *
 *  It also carries the accessible name. Without one, whether a blocking
 *  requirement passed reached a screen reader as "check mark", or as nothing. */
const MARK: Record<string, { cls: string; glyph: string; label: string }> = {
  pass: { cls: "m-pass", glyph: "✓", label: "Met" },
  fail: { cls: "m-fail", glyph: "✕", label: "Failed" },
  miss: { cls: "m-miss", glyph: "?", label: "Not evaluated" },
  off: { cls: "m-off", glyph: "–", label: "Waived by Operations" },
};

export function Mark({ status, label }: { status: keyof typeof MARK | string; label?: string }) {
  const m = MARK[status] ?? MARK.off;
  return (
    <span className={`mark ${m.cls}`} role="img" aria-label={label ?? m.label}>
      <span aria-hidden="true">{m.glyph}</span>
    </span>
  );
}

/** Provenance badge. The border style — solid vs dashed — is the load-bearing
 *  part: solid means the evidence stands on its own and can satisfy a blocking
 *  requirement, dashed means it cannot. The suffix says so out loud, because
 *  "vendor claim" on its own does not tell a reader what follows from it. */
const PROV_CONSEQUENCE: Record<string, string> = {
  verified: "independently verified; can satisfy a blocking requirement",
  sourced: "found on an identifiable page; can satisfy a blocking requirement",
  claimed: "vendor claim only; cannot satisfy a blocking requirement",
  none: "not established; cannot satisfy a blocking requirement",
};

export function Prov({ prov, label }: { prov: string; label: string }) {
  const key = prov in PROV_CONSEQUENCE ? prov : "none";
  return (
    <span className={`prov pv-${key}`}>
      {label}
      <span className="sr-only"> — {PROV_CONSEQUENCE[key]}</span>
    </span>
  );
}

/** The legend, rendered where the badges are so the rule is learned in place
 *  rather than remembered. */
export function ProvKey() {
  return (
    <div className="provkey">
      <span className="prov pv-verified">verified</span>
      <span className="prov pv-sourced">sourced</span>
      <span>stands alone</span>
      <span className="prov pv-claimed">vendor claim</span>
      <span className="prov pv-none">not found</span>
      <span>does not</span>
    </div>
  );
}
