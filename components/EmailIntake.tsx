"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  parseRawEmail,
  parseExtraction,
  senderAllowed,
  fieldsFromExtraction,
  draftClarification,
  extractionPrompt,
  EMPTY_EXTRACTION,
} from "@/lib/email";

/** Paste an email, watch it become a request.
 *
 *  Everything shown here is computed in the browser by the same pure functions
 *  the server uses, so the preview is the actual outcome rather than a
 *  rehearsal of it. The server re-runs all of it on submit — a preview is a
 *  courtesy, not a check. */
export function EmailIntake({
  domains,
  autoRead,
}: {
  domains: string[];
  autoRead: boolean;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => (raw.trim() ? parseRawEmail(raw) : null), [raw]);
  const email = parsed?.ok ? parsed.data : null;
  const allowed = email ? senderAllowed(email.from, domains) : false;

  const extracted = useMemo(() => (json.trim() ? parseExtraction(json) : null), [json]);

  const preview = useMemo(() => {
    if (!email) return null;
    const x = extracted?.ok ? extracted.data : EMPTY_EXTRACTION;
    const { fields, gaps } = fieldsFromExtraction(email, x);
    return { fields, gaps, reply: draftClarification(email, gaps) };
  }, [email, extracted]);

  async function copyPrompt() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(extractionPrompt(email));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Clipboard blocked — the prompt is shown below, copy it by hand.");
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw, extraction: json.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(String(body.error ?? "Could not log that email."));
        return;
      }
      router.push(`/request/${body.requestId}`);
    } catch {
      setError("Could not reach GreenLight.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <div className="stack">
        <div className="panel">
          <header>
            <h2>The email</h2>
            <span className="eyebrow">paste it whole, headers included</span>
          </header>
          <div className="body">
            <textarea
              id="raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"From: Nimal Perera <nimal@bistecglobal.com>\nSent: Monday, 15 September 2026 09:14\nSubject: Figma licences\n\nHi, can we get Figma for the design team? About 5 of us…"}
              style={{ minHeight: 260, fontFamily: "var(--mono)", fontSize: 12 }}
            />

            {parsed && !parsed.ok && (
              <div className="callout" style={{ marginTop: 14 }}>
                <span>◆</span>
                <div>{parsed.error}</div>
              </div>
            )}

            {email && (
              <div style={{ marginTop: 16 }}>
                <div className="kv">
                  <span className="k">From</span>
                  <span className="v mono">{email.from}</span>
                </div>
                <div className="kv">
                  <span className="k">Subject</span>
                  <span className="v">{email.subject || "—"}</span>
                </div>
                <div className="kv">
                  <span className="k">Sender</span>
                  <span className="v">
                    <span className={`pill ${allowed ? "p-ok" : "p-bad"}`}>
                      {allowed ? "internal" : "not an internal address"}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {email && !allowed && (
              <div className="callout" style={{ marginTop: 14 }}>
                <span>◆</span>
                <div>
                  Only mail from {domains.join(", ")} becomes a request. The address in
                  angle brackets is what counts — a display name can say anything.
                </div>
              </div>
            )}
          </div>
        </div>

        {email && allowed && !autoRead && (
          <div className="panel">
            <header>
              <h2>Read it with Claude</h2>
              <span className="eyebrow">no API key needed</span>
            </header>
            <div className="body">
              <ol
                style={{
                  margin: "0 0 16px",
                  paddingLeft: 20,
                  fontSize: "13.2px",
                  color: "var(--ink-2)",
                  lineHeight: 1.65,
                }}
              >
                <li>Copy the prompt.</li>
                <li>
                  Paste it into Claude with the{" "}
                  <span className="mono">email-request-triage</span> skill loaded.
                </li>
                <li>Paste the JSON it returns back here.</li>
              </ol>

              <div className="actions" style={{ marginBottom: 14 }}>
                <button className="btn" onClick={copyPrompt} type="button">
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>

              <details style={{ marginBottom: 14 }}>
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
                  {extractionPrompt(email)}
                </pre>
              </details>

              <div className="field">
                <label className="fl" htmlFor="json">
                  JSON from Claude
                </label>
                <textarea
                  id="json"
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder='{ "product": { "value": "Figma", "provenance": "stated", "source": "…" }, … }'
                  style={{ minHeight: 150, fontFamily: "var(--mono)", fontSize: 12 }}
                />
              </div>

              {extracted && !extracted.ok && (
                <div className="callout">
                  <span>◆</span>
                  <div>{extracted.error}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="stack">
        <div className="panel">
          <header>
            <h2>What gets logged</h2>
            <span className="eyebrow">{extracted?.ok ? "read" : "not read yet"}</span>
          </header>
          <div className="body">
            {!preview && (
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                Paste an email on the left and this fills in.
              </p>
            )}

            {preview && (
              <>
                <div className="kv">
                  <span className="k">Requester</span>
                  <span className="v">{preview.fields.requester}</span>
                </div>
                <div className="kv">
                  <span className="k">Software</span>
                  <span className="v">{preview.fields.product ?? <i>not established</i>}</span>
                </div>
                <div className="kv">
                  <span className="k">Vendor</span>
                  <span className="v">{preview.fields.vendor ?? <i>not established</i>}</span>
                </div>
                <div className="kv">
                  <span className="k">Seats</span>
                  <span className="v">{preview.fields.seats ?? <i>not established</i>}</span>
                </div>
                <div className="kv">
                  <span className="k">Team</span>
                  <span className="v">{preview.fields.team}</span>
                </div>
                <div className="kv">
                  <span className="k">Legal entity</span>
                  <span className="v">
                    {preview.fields.entity || <i>not established — decides which rules apply</i>}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {preview && preview.gaps.length > 0 && (
          <div className="panel">
            <header>
              <h2>What it does not say</h2>
              <span className="eyebrow">{preview.gaps.length} to ask</span>
            </header>
            <div className="body">
              {preview.gaps.map((g) => (
                <div className="kv" key={g.field}>
                  <span className="k">{g.label}</span>
                  <span className="v" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {g.why}
                  </span>
                </div>
              ))}

              <div className="field" style={{ marginTop: 16 }}>
                <label className="fl" htmlFor="reply">
                  Drafted reply — you send it, not GreenLight
                </label>
                <textarea
                  id="reply"
                  readOnly
                  value={preview.reply}
                  style={{ minHeight: 170, fontSize: 12.6, lineHeight: 1.6 }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="callout">
            <span>◆</span>
            <div>{error}</div>
          </div>
        )}

        <button
          className="btn primary"
          type="button"
          onClick={submit}
          disabled={busy || !email || !allowed}
          style={{ alignSelf: "flex-start" }}
        >
          {busy && <span className="spinner" />}
          {busy ? "Logging…" : "Log this request"}
        </button>

        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          The email is stored exactly as written, so an approver can always compare
          what was said against what was read out of it. Anything it did not
          establish is recorded as a question, never filled in.
        </p>
      </div>
    </div>
  );
}
