/** Client for process-analyzer (AnuV6).
 *
 *  That tool answers "what is actually running"; GreenLight answers "what did
 *  we approve". It already exposes everything needed, so nothing in its repo
 *  is modified — GreenLight is a pure client in both directions:
 *
 *    GET  /api/processes   → the scan          (reality in)
 *    GET  /api/whitelist   → its current lists
 *    POST /api/whitelist   → {processName, action}   (policy out)
 *
 *  It hardcodes port 3000 with no env fallback, which is why GreenLight runs
 *  on 3001. Every call is time-boxed and returns null rather than throwing —
 *  an analyzer that is switched off must degrade the page, not break it.
 */

import { getJson } from "./http";

export const PA_URL = process.env.PROCESS_ANALYZER_URL ?? "http://localhost:3000";

/** One row of process-analyzer's scan output. */
export type ProcessRecord = {
  pid: number;
  name: string;
  path: string | null;
  parentPid?: number;
  memoryMB?: number;
  commandLine?: string | null;
  publisher?: string | null;
  threatLevel: "Safe" | "Suspicious" | "Malicious" | string;
  category: "Native Windows" | "Microsoft" | "Third-party" | "Unknown" | string;
  threatScore?: number;
  threatReasons?: string[];
};

export type ScanPayload = {
  processes: ProcessRecord[];
  stats?: {
    total: number;
    safe: number;
    suspicious: number;
    malicious: number;
    nativeWindows: number;
    microsoft: number;
    thirdParty: number;
    unknown: number;
  };
  timestamp?: string;
};

export type WhitelistPayload = { whitelisted: string[]; blacklisted: string[] };

export async function isUp(): Promise<boolean> {
  const r = await getJson<WhitelistPayload>(`${PA_URL}/api/whitelist`, { timeout: 2500 });
  return r !== null;
}

/** Pull a scan. Returns null when the analyzer is not running. */
export async function fetchScan(): Promise<ScanPayload | null> {
  // enumerating every process via WMI is not fast; give it room
  return getJson<ScanPayload>(`${PA_URL}/api/processes`, { timeout: 45_000 });
}

export async function fetchWhitelist(): Promise<WhitelistPayload | null> {
  return getJson<WhitelistPayload>(`${PA_URL}/api/whitelist`, { timeout: 5_000 });
}

export type PolicyAction = "whitelist" | "blacklist" | "remove";

/** Push one process name. The analyzer's own endpoint takes a single name per
 *  call; over localhost that is cheap enough not to matter. */
export async function pushPolicy(processName: string, action: PolicyAction): Promise<boolean> {
  const r = await getJson<{ success?: boolean }>(`${PA_URL}/api/whitelist`, {
    method: "POST",
    timeout: 6_000,
    body: { processName, action },
  });
  return Boolean(r && r.success !== false);
}

/** Native Windows and Microsoft processes are hundreds of rows of noise that
 *  no one is deciding anything about. The estate view is about third-party
 *  software, which is the only kind that goes through an approval. */
export function isThirdParty(p: ProcessRecord): boolean {
  return p.category !== "Native Windows" && p.category !== "Microsoft";
}

export const normalise = (name: string): string => name.toLowerCase().trim();
