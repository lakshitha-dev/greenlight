import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPacks } from "@/lib/rulepack";
import { Panel, Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function RulesPage() {
  const packs = loadPacks().sort((a, b) => a.entity.localeCompare(b.entity));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Rule packs</h1>
          <div className="sub">
            Policy as versioned files on disk, owned by Operations. Editing a pack changes company
            policy for every decision made after it — no developer, no deploy.
          </div>
        </div>
      </div>

      <div className="stack">
        {packs.map((p) => {
          const raw = readFileSync(join(process.cwd(), "rules", p.file), "utf8");
          return (
            <Panel key={p.file} title={`${p.entity} · ${p.jurisdiction}`} eyebrow={`${p.id}@${p.version}`}>
              <div style={{ fontSize: "12.5px", color: "var(--muted)", marginBottom: 14 }}>
                {p.regime} · <span className="mono">rules/{p.file}</span>
              </div>
              {p.requirements.map((r) => (
                <div className="check" key={r.id}>
                  <span className="mark m-off">{r.id.replace("R", "")}</span>
                  <div>
                    <div className="lbl">{r.label}</div>
                    <div className="why">
                      <span className="mono">{r.field}</span> {r.op}
                      {r.value !== undefined ? ` ${r.value}` : ""} · {r.authority}
                      {r.breach ? <b style={{ color: "var(--warn)" }}> → {r.breach}</b> : null}
                    </div>
                  </div>
                  <span className={`pill ${r.severity === "blocking" ? "p-crit" : "p-warn"}`}>
                    {r.severity}
                  </span>
                </div>
              ))}
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer", fontSize: "12.5px", color: "var(--muted)" }}>
                  View the file as Operations edits it
                </summary>
                <pre
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 7,
                    padding: 13,
                    overflowX: "auto",
                    marginTop: 10,
                    lineHeight: 1.6,
                  }}
                >
                  {raw}
                </pre>
              </details>
            </Panel>
          );
        })}

        <Callout tone="info">
          <b>Change a severity in the YAML and restart nothing.</b> The next request evaluated picks
          up the new pack, and its verdict is stamped with the new version. The model supplies facts
          and their provenance; the pack supplies the verdict. Neither can overrule the other, and
          neither approves anything.
        </Callout>
      </div>
    </>
  );
}
