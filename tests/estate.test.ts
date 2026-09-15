/** Reconciling approved against running.
 *
 *  Two regressions are pinned here. A scan of a real laptop returned 38
 *  "shadow IT" findings that were all audio and graphics drivers, and every
 *  process came back with no path and no publisher because the analyzer was
 *  not elevated — neither may be reported as unapproved software. */

import { describe, it, expect } from "vitest";
import { reconcile, origin, syncPolicy, processNamesOf, mappingIsCorrupt, entryIsValid } from "@/lib/estate";
import { catalogEntry, request, decision, proc, PAST, TODAY } from "./factories";

const ENTITY = "BISTEC Solutions";
const noRequests: never[] = [];

describe("origin — is this a business decision at all", () => {
  it("treats software under a user profile as deliberately installed", () => {
    expect(origin(proc({ path: "C:\\Users\\someone\\AppData\\Local\\Slack\\slack.exe" }))).toBe("installed");
  });

  it("treats a hardware vendor's service as system, not shadow IT", () => {
    expect(origin(proc({ publisher: "Intel Corporation", path: "" }))).toBe("system");
    expect(origin(proc({ publisher: "Realtek Semiconductor", path: "" }))).toBe("system");
    expect(origin(proc({ path: "C:\\Program Files\\Realtek\\Audio\\RtkAudUService64.exe", publisher: "" }))).toBe("system");
  });

  it("treats anything in the Windows directory as system", () => {
    expect(origin(proc({ path: "C:\\Windows\\System32\\something.exe", publisher: "" }))).toBe("system");
  });

  it("refuses to guess when there is no path and no publisher", () => {
    expect(origin(proc({ path: "", publisher: "" }))).toBe("unknown");
    expect(origin(proc({ path: null, publisher: null }))).toBe("unknown");
  });

  it("treats a signed non-OEM program in Program Files as installed", () => {
    expect(origin(proc({ path: "C:\\Program Files\\Notion\\notion.exe", publisher: "Notion Labs" }))).toBe("installed");
  });
});

describe("reconcile — what counts as a finding", () => {
  const catalog = [catalogEntry()];

  it("matches a running process to its catalog entry", () => {
    const e = reconcile([proc()], catalog, noRequests);
    expect(e.approved).toHaveLength(1);
    expect(e.shadow).toHaveLength(0);
    expect(e.approved[0].entry?.name).toBe("Slack");
  });

  it("reports genuinely unapproved software as shadow IT", () => {
    const e = reconcile(
      [proc({ name: "whatsapp.exe", path: "C:\\Users\\x\\AppData\\Local\\WhatsApp\\whatsapp.exe", publisher: "WhatsApp LLC" })],
      catalog,
      noRequests
    );
    expect(e.shadow.map((r) => r.name)).toEqual(["whatsapp.exe"]);
  });

  it("does not report driver noise as shadow IT — regression", () => {
    const drivers = [
      proc({ name: "IntelAudioService.exe", publisher: "Intel Corporation", path: "" }),
      proc({ name: "RtkAudUService64.exe", publisher: "Realtek Semiconductor", path: "" }),
    ];
    const e = reconcile(drivers, catalog, noRequests);
    expect(e.shadow).toHaveLength(0);
    expect(e.systemNoise).toBe(2);
  });

  it("does not report origin-unknown processes as unapproved — regression", () => {
    const e = reconcile(
      [proc({ name: "mystery.exe", path: "", publisher: "", threatReasons: ["Process path not accessible"] })],
      catalog,
      noRequests
    );
    expect(e.shadow).toHaveLength(0);
    expect(e.unclassified).toBe(1);
    expect(e.rows[0].note).toMatch(/run the analyzer as Administrator/i);
  });

  it("filters out native Windows and Microsoft components", () => {
    const e = reconcile(
      [proc({ name: "svchost.exe", category: "Native Windows" }), proc({ name: "winword.exe", category: "Microsoft" }), proc()],
      catalog,
      noRequests
    );
    expect(e.scanned).toBe(3);
    expect(e.thirdParty).toBe(1);
  });

  it("groups repeated processes into one row", () => {
    const e = reconcile([proc(), proc({ pid: 2 }), proc({ pid: 3 })], catalog, noRequests);
    expect(e.approved).toHaveLength(1);
    expect(e.approved[0].instances).toBe(3);
  });

  it("treats a lapsed catalog entry as running-without-permission", () => {
    const e = reconcile([proc()], [catalogEntry({ review: PAST })], noRequests);
    expect(e.approved).toHaveLength(0);
    expect(e.shadow[0].note).toMatch(/lapsed/i);
  });

  it("flags software that was rejected and is still running", () => {
    const e = reconcile(
      [proc()],
      [catalogEntry()],
      [{ ...request({ product: "Slack" }), decision: decision({ outcome: "REJECT" }) }]
    );
    expect(e.flagged).toHaveLength(1);
    expect(e.flagged[0].note).toMatch(/rejected by the head of operations/i);
  });

  it("flags installed software the analyzer scored suspicious", () => {
    const e = reconcile(
      [proc({ name: "anydesk.exe", path: "C:\\Users\\x\\AppData\\Temp\\anydesk.exe", publisher: "", threatLevel: "Suspicious" })],
      catalog,
      noRequests
    );
    expect(e.flagged).toHaveLength(1);
    expect(e.flagged[0].worstThreat).toBe("Suspicious");
  });

  it("reports approved software that was not seen running", () => {
    const e = reconcile([], [catalogEntry({ name: "Zoom", processNames: JSON.stringify(["zoom.exe"]) })], noRequests);
    expect(e.unused).toHaveLength(1);
  });

  it("separates web-only products, which no scan can ever see", () => {
    const e = reconcile([], [catalogEntry({ name: "Confluence", processNames: JSON.stringify([]) })], noRequests);
    expect(e.webOnly.map((c) => c.name)).toEqual(["Confluence"]);
    expect(e.unused).toHaveLength(0);
  });
});

describe("reconcile — survives a malformed scan", () => {
  it("skips records with no usable name rather than throwing", () => {
    const bad = [{ pid: 1, category: "Third-party", threatLevel: "Safe" }, proc()] as never[];
    const e = reconcile(bad, [catalogEntry()], noRequests);
    expect(e.scanned).toBe(1);
    expect(e.approved).toHaveLength(1);
  });

  it("tolerates a payload that is not an array at all", () => {
    expect(() => reconcile("nonsense" as never, [catalogEntry()], noRequests)).not.toThrow();
  });
});

describe("syncPolicy — policy reaching the endpoint", () => {
  const dry = { dryRun: true };

  it("permits a valid entry's processes", async () => {
    const p = await syncPolicy([catalogEntry()], noRequests, dry);
    expect(p.whitelisted).toContain("slack.exe");
  });

  it("withholds a lapsed entry — the anti-rot property", async () => {
    const p = await syncPolicy([catalogEntry({ review: TODAY })], noRequests, dry);
    expect(p.whitelisted).not.toContain("slack.exe");
    expect(p.skipped[0].why).toMatch(/lapsed/i);
  });

  it("withholds an entry with new exploited vulnerabilities since approval", async () => {
    const p = await syncPolicy([catalogEntry({ kevSince: 6 })], noRequests, dry);
    expect(p.whitelisted).toHaveLength(0);
    expect(p.skipped[0].why).toMatch(/6 new exploited/i);
  });

  it("denies the processes of anything rejected", async () => {
    const p = await syncPolicy(
      [catalogEntry()],
      [{ ...request({ product: "Slack" }), decision: decision({ outcome: "REJECT" }) }],
      dry
    );
    expect(p.blacklisted).toContain("slack.exe");
    expect(p.whitelisted).not.toContain("slack.exe");
  });

  it("never lists the same process as both permitted and denied", async () => {
    const p = await syncPolicy(
      [catalogEntry()],
      [{ ...request({ product: "Slack" }), decision: decision({ outcome: "REJECT" }) }],
      dry
    );
    for (const n of p.whitelisted) expect(p.blacklisted).not.toContain(n);
  });

  it("skips web-only products with an honest reason", async () => {
    const p = await syncPolicy([catalogEntry({ name: "Confluence", processNames: JSON.stringify([]) })], noRequests, dry);
    expect(p.skipped[0].why).toMatch(/web-only/i);
  });

  it("distinguishes an unreadable mapping from a deliberate web-only one", async () => {
    const p = await syncPolicy([catalogEntry({ processNames: "{broken" })], noRequests, dry);
    expect(p.skipped[0].why).toMatch(/unreadable/i);
    expect(p.skipped[0].why).not.toMatch(/web-only/i);
  });
});

describe("catalog mapping helpers", () => {
  it("reads and normalises process names", () => {
    expect(processNamesOf(catalogEntry({ processNames: JSON.stringify(["Slack.EXE"]) }))).toEqual(["slack.exe"]);
  });

  it("drops non-string entries", () => {
    expect(processNamesOf(catalogEntry({ processNames: JSON.stringify(["a.exe", 42, null]) }))).toEqual(["a.exe"]);
  });

  it("tells an empty mapping apart from a broken one", () => {
    expect(mappingIsCorrupt(catalogEntry({ processNames: JSON.stringify([]) }))).toBe(false);
    expect(mappingIsCorrupt(catalogEntry({ processNames: null }))).toBe(false);
    expect(mappingIsCorrupt(catalogEntry({ processNames: "{broken" }))).toBe(true);
  });

  it("agrees with the catalog gate on what 'valid' means", () => {
    expect(entryIsValid(catalogEntry())).toBe(true);
    expect(entryIsValid(catalogEntry({ review: TODAY }))).toBe(false);
    expect(entryIsValid(catalogEntry({ kevSince: 1 }))).toBe(false);
  });
});
