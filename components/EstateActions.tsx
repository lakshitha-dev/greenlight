"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function run(url: string, body?: unknown, onOk?: (b: Record<string, unknown>) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ text: String(data.error ?? "failed"), bad: true });
        return;
      }
      setMsg({ text: onOk ? onOk(data) : "Done", bad: false });
      router.refresh();
    } catch {
      setMsg({ text: "Could not reach GreenLight.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return { busy, msg, run };
}

export function PullScanButton() {
  const { busy, msg, run } = useAction();
  return (
    <div>
      <button
        className="btn primary"
        disabled={busy}
        onClick={() =>
          run("/api/scan", undefined, (d) => `Scanned ${d.host} · ${d.total} processes`)
        }
      >
        {busy && <span className="spinner" />}
        {busy ? "Scanning this machine…" : "Pull live scan"}
      </button>
      {msg && (
        <div style={{ fontSize: 12, marginTop: 6, color: msg.bad ? "var(--crit)" : "var(--signal)" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

export function SyncPolicyButton() {
  const { busy, msg, run } = useAction();
  return (
    <div>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run("/api/policy/sync", undefined, (d) => {
            const w = (d.whitelisted as string[] | undefined) ?? [];
            const b = (d.blacklisted as string[] | undefined) ?? [];
            const s = (d.skipped as unknown[] | undefined) ?? [];
            return `${w.length} permitted, ${b.length} denied, ${s.length} withheld`;
          })
        }
      >
        {busy && <span className="spinner" />}
        {busy ? "Pushing…" : "Sync policy to endpoints"}
      </button>
      {msg && (
        <div style={{ fontSize: 12, marginTop: 6, color: msg.bad ? "var(--crit)" : "var(--signal)" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

export function RaiseButton({
  processName,
  publisher,
}: {
  processName: string;
  publisher: string | null;
}) {
  const { busy, msg, run } = useAction();
  if (msg && !msg.bad) return <span className="pill p-ok">{msg.text}</span>;
  return (
    <>
      <button
        className="btn sm"
        disabled={busy}
        onClick={() =>
          run("/api/estate/raise", { processName, publisher }, (d) => `Raised ${d.id}`)
        }
      >
        {busy && <span className="spinner" />}
        Raise request
      </button>
      {msg?.bad && <div style={{ fontSize: 11.5, color: "var(--crit)", marginTop: 4 }}>{msg.text}</div>}
    </>
  );
}
