import { db } from "@/lib/db";
import { entitiesOf, today } from "@/lib/catalog";
import { Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const catalog = await db.catalogEntry.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Software catalog</h1>
          <div className="sub">
            The deflection layer. A request matching a valid entry never reaches an approver — and
            every entry expires, so the catalog cannot rot into an allowlist.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Software</th>
                <th>Vendor</th>
                <th>Seats</th>
                <th>Entities</th>
                <th>Approved</th>
                <th>Next review</th>
                <th>KEV</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((c) => {
                const free = c.seats - c.used;
                const lapsed = c.review <= today();
                const pct = Math.round((c.used / c.seats) * 100);
                const scope = entitiesOf(c);
                const status = lapsed ? (
                  <span className="pill p-warn">Re-review due</span>
                ) : c.kevSince > 0 ? (
                  <span className="pill p-crit">Monitoring · {c.kevSince} new KEV</span>
                ) : free <= 0 ? (
                  <span className="pill p-info">Seats exhausted</span>
                ) : (
                  <span className="pill p-ok">Self-service</span>
                );

                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <div style={{ fontSize: "11.5px", color: "var(--faint)", marginTop: 2 }}>
                        {c.owner}
                      </div>
                    </td>
                    <td>{c.vendor}</td>
                    <td className="mono">
                      {c.used}/{c.seats}
                      <span className={`seatbar ${free <= 0 ? "full" : ""}`}>
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 3 }}>
                        {free} free
                      </div>
                    </td>
                    <td style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                      {scope.length >= 5 ? "All five entities" : scope.join(", ")}
                    </td>
                    <td className="mono">{c.approved}</td>
                    <td className="mono" style={{ color: lapsed ? "var(--warn)" : "var(--muted)" }}>
                      {c.review}
                    </td>
                    <td className="mono" style={{ color: c.kev > 0 ? "var(--crit)" : "var(--muted)" }}>
                      {c.kev}
                    </td>
                    <td>{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Callout>
          <b>An entry that has lapsed, drifted out of entity scope, or picked up new
          actively-exploited vulnerabilities stops self-serving</b> and re-escalates until it is
          reassessed. A catalog that never expires is just an allowlist with better manners.
        </Callout>
      </div>
    </>
  );
}
