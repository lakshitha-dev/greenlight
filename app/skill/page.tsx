import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Panel, Callout } from "@/components/ui";
import { hasKey } from "@/lib/research";

export const dynamic = "force-dynamic";

const SKILLS_DIR = join(process.cwd(), "skills");

type Skill = { dir: string; name: string; description: string; body: string; raw: string };

/** Skills ship inside the app rather than beside it. The compliance research
 *  has no public API to call, so the part a machine cannot do is packaged as
 *  something a person runs in Claude — and it belongs in the tool it serves,
 *  not in a folder someone has to be told about. */
function loadSkills(): Skill[] {
  let dirs: string[];
  try {
    dirs = readdirSync(SKILLS_DIR);
  } catch {
    return [];
  }

  return dirs.flatMap((dir) => {
    let raw: string;
    try {
      raw = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8");
    } catch {
      return [];
    }
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const front = fm?.[1] ?? "";
    const body = fm?.[2] ?? raw;
    const field = (k: string) =>
      front.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
    return [{ dir, name: field("name") || dir, description: field("description"), body, raw }];
  });
}

export default function SkillPage() {
  const skills = loadSkills();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Claude skills</h1>
          <div className="sub">
            The work a machine cannot do, packaged as something a person runs in Claude.
          </div>
        </div>
        <div>
          <span className={`pill ${hasKey() ? "p-ok" : "p-mute"}`}>
            {hasKey() ? "Running automatically" : "Run in Claude"}
          </span>
        </div>
      </div>

      {skills.length === 0 ? (
        <Panel title="No skills found">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Expected at least one <span className="mono">skills/*/SKILL.md</span>.
          </p>
        </Panel>
      ) : (
        <div className="stack">
          {skills.map((s) => (
            <Panel key={s.dir} title={s.name} eyebrow={`skills/${s.dir}/SKILL.md`}>
              <p
                style={{
                  fontSize: "13.2px",
                  color: "var(--ink-2)",
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                {s.description}
              </p>

              <div className="actions" style={{ marginBottom: 18 }}>
                <a className="btn" href={`/api/skill/${s.dir}`} download={`${s.dir}.md`}>
                  Download SKILL.md
                </a>
              </div>

              <details>
                <summary
                  style={{ cursor: "pointer", fontSize: "12.5px", color: "var(--muted)" }}
                >
                  Read it
                </summary>
                <pre
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: 7,
                    padding: 15,
                    marginTop: 12,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.65,
                    maxHeight: 460,
                    overflowY: "auto",
                  }}
                >
                  {s.body.trim()}
                </pre>
              </details>
            </Panel>
          ))}

          <Callout tone="info">
            <b>Why a skill and not an API call.</b> Whether a vendor holds a current SOC 2,
            publishes a DPA, or discloses its sub-processors has no public API — that
            evidence lives as prose on trust centres, shaped differently by every vendor.
            Reading it is language work, so GreenLight hands that step to Claude and takes
            back typed facts with a source against each one. Set a Claude credential and
            the same step runs automatically; without one, a person runs it on an ordinary
            subscription. Either way the rule pack cannot tell which produced a fact, and
            does not need to.
          </Callout>
        </div>
      )}
    </>
  );
}
