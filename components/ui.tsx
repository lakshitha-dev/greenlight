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
      <span>◆</span>
      <div>{children}</div>
    </div>
  );
}
