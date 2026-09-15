"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Research the compliance half in Claude, on a subscription, and paste it
 *  back. No API key, and a person is on the judgement step — which is the
 *  principle the rest of the tool holds to anyway. */
export function ClaudeResearch({
  requestId,
  prompt,
}: {
  requestId: string;
  prompt: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setOpen(true); // clipboard blocked — the textarea below shows the prompt
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, findings: text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(String(body.error ?? "Could not record those findings."));
        return;
      }
      setText("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach GreenLight.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ol
        style={{
          margin: "0 0 16px",
          paddingLeft: 20,
          fontSize: "13.2px",
          color: "var(--ink-2)",
          lineHeight: 1.65,
        }}
      >
        <li>Copy the prompt below.</li>
        <li>
          Paste it into Claude with the{" "}
          <span className="mono">software-compliance-research</span> skill loaded.
        </li>
        <li>Paste the JSON it returns back here.</li>
      </ol>

      <div className="actions" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={copy}>
          {copied ? "Copied" : "Copy research prompt"}
        </button>
        <button className="btn primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Paste findings"}
        </button>
      </div>

      {copied && (
        <div style={{ fontSize: 12, color: "var(--signal)", marginBottom: 12 }}>
          Prompt copied — run it in Claude, then come back and paste the JSON.
        </div>
      )}

      {open && (
        <div>
          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: "12.5px", color: "var(--muted)" }}>
              Show the prompt
            </summary>
            <pre
              className="mono"
              style={{
                fontSize: 11.5,
                background: "var(--surface-2)",
                border: "1px solid var(--line-soft)",
                borderRadius: 7,
                padding: 13,
                marginTop: 10,
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {prompt}
            </pre>
          </details>

          <div className="field">
            <label className="fl" htmlFor="findings">
              JSON from Claude
            </label>
            <textarea
              id="findings"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{ "soc2": { "value": true, "provenance": "sourced", "source": "https://…" }, … }'
              style={{ minHeight: 190, fontFamily: "var(--mono)", fontSize: 12 }}
            />
          </div>

          {error && (
            <div className="callout" style={{ marginBottom: 12 }}>
              <span>◆</span>
              <div>{error}</div>
            </div>
          )}

          <button className="btn primary" onClick={submit} disabled={busy || text.trim().length < 2}>
            {busy && <span className="spinner" />}
            {busy ? "Recording…" : "Record findings"}
          </button>

          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.55 }}>
            Every field is stored with the provenance Claude gave it, and the audit
            trail records that you researched it. Anything marked <b>none</b> stays
            &ldquo;not found&rdquo; — a gap is a finding, not something to fill in.
          </p>
        </div>
      )}
    </div>
  );
}
