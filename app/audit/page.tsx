import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Audit trail</h1>
          <div className="sub">
            {events.length} events · automatic provisioning is recorded exactly like a human decision
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event</th>
                <th>Detail</th>
                <th>Reference</th>
                <th>Authority</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: "11.5px", whiteSpace: "nowrap" }}>
                    {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td>
                    <b>{e.action}</b>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{e.detail}</td>
                  <td className="mono" style={{ fontSize: "11.5px" }}>
                    {e.requestId ?? "—"}
                  </td>
                  <td className="mono" style={{ fontSize: "11.5px" }}>
                    {e.authority}
                  </td>
                  <td style={{ fontSize: "12.5px" }}>{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
