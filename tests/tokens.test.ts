/** The dark palette is declared twice — once for the OS preference, once for an
 *  explicit data-theme — because CSS gives no way to alias one selector to the
 *  other without a preprocessor. Two copies drift, and the drift is invisible:
 *  it only shows up for the subset of users on whichever block was not updated.
 *  So the duplication is allowed and the divergence is not.
 *
 *  The second test is the one that would have caught the real bug class here:
 *  a token added to :root but forgotten in dark mode does not throw, it just
 *  falls back to the light value and produces, say, navy text on a navy ground. */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** First match only: the print block re-declares these selectors to force the
 *  light set onto paper, and that copy is deliberately different. */
function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`globals.css no longer contains ${selector}`);
  return m[1];
}

function decls(body: string): Map<string, string> {
  return new Map(
    body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.includes(":"))
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
      }),
  );
}

const light = decls(block(/:root\{([^}]*)\}/));
const darkMedia = decls(block(/:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/));
const darkAttr = decls(block(/:root\[data-theme="dark"\]\{([^}]*)\}/));

const customProps = (m: Map<string, string>) =>
  [...m.keys()].filter((k) => k.startsWith("--")).sort();

describe("theme tokens", () => {
  it("declares the two dark blocks identically", () => {
    expect(Object.fromEntries(darkAttr)).toEqual(Object.fromEntries(darkMedia));
  });

  it("overrides every light custom property in dark mode", () => {
    const missing = customProps(light).filter(
      (k) => !darkMedia.has(k) && !["--sans", "--mono", "--rail"].includes(k),
    );
    expect(missing, `not overridden in dark mode: ${missing.join(", ")}`).toEqual([]);
  });

  it("introduces no dark-only token that has no light value", () => {
    const orphans = customProps(darkMedia).filter((k) => !light.has(k));
    expect(orphans, `dark-only, so undefined in light mode: ${orphans.join(", ")}`).toEqual([]);
  });

  it("keeps chrome and status on separate tokens", () => {
    /** The whole point of the re-theme: --brand paints the furniture, --signal
     *  means approved. If these ever resolve to the same value, green is back to
     *  meaning two things at once. */
    for (const set of [light, darkMedia]) {
      expect(set.get("--brand")).toBeDefined();
      expect(set.get("--signal")).toBeDefined();
      expect(set.get("--brand")).not.toBe(set.get("--signal"));
    }
  });

  it("never fills a button with raw brand green", () => {
    /** #2cb34a is 2.74:1 on white — legible as a logo, not as a label. It may
     *  appear in an asset or a gradient, never as a --signal value. */
    expect(light.get("--signal")).not.toBe("#2cb34a");
    expect(light.get("--signal")).not.toBe("#24963e");
  });

  it("declares no font weight Lato does not ship", () => {
    /** Lato has 100/300/400/700/900. A declared 500 silently renders 400 and a
     *  600 renders 700, so the file would be describing a hierarchy that does
     *  not exist. --mono is IBM Plex Mono, which does ship 500/600. */
    const sansWeights = css
      .split("\n")
      /** A rule is exempt when it sets --mono itself, or carries a `mono:`
       *  comment saying it inherits mono from an ancestor. Anything else is
       *  rendering in Lato and must declare a weight Lato has. */
      .filter((l) => !l.includes("var(--mono)") && !l.includes("/* mono:"))
      .flatMap((l) => [...l.matchAll(/font-weight:(\d{3})/g)].map((m) => m[1]));
    expect([...new Set(sansWeights)].sort()).not.toContain("500");
    expect([...new Set(sansWeights)].sort()).not.toContain("600");
  });
});
