"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResearchButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "research failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "research failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn primary" onClick={run} disabled={busy}>
        {busy && <span className="spinner" />}
        {busy ? "Researching live sources…" : "Research this software"}
      </button>
      {err && (
        <div style={{ fontSize: 12, color: "var(--crit)", marginTop: 6 }}>{err}</div>
      )}
    </div>
  );
}

const CHOICES = [
  { key: "APPROVE", label: "Approve", cls: "btn primary" },
  { key: "CONDITIONS", label: "Approve with conditions", cls: "btn" },
  { key: "MORE_INFO", label: "Request more info", cls: "btn" },
  { key: "REJECT", label: "Reject", cls: "btn danger" },
] as const;

export function DecideButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(outcome: string) {
    setBusy(outcome);
    try {
      await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, outcome }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="actions">
      {CHOICES.map((c) => (
        <button
          key={c.key}
          className={c.cls}
          onClick={() => decide(c.key)}
          disabled={busy !== null}
        >
          {busy === c.key && <span className="spinner" />}
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function AckButton({ label, done }: { label: string; done: string }) {
  const [clicked, setClicked] = useState(false);
  if (clicked) return <span className="pill p-ok">{done}</span>;
  return (
    <button className="btn primary" onClick={() => setClicked(true)}>
      {label}
    </button>
  );
}
