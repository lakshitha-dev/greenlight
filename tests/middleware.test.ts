/** The middleware matcher decides which paths require a session. Getting it
 *  wrong fails silently in both directions, which is why it is pinned here.
 *
 *  Too narrow and the brand assets 302 to /login: Next serves the file-
 *  convention icons at bare paths, and every link unfurler is unauthenticated,
 *  so an OpenGraph image behind auth is an OpenGraph image that never renders
 *  and never errors. Too broad and a real route stops being protected — the
 *  reason this asserts what must still match, not just what must not. */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Read the source rather than importing it. Importing would evaluate
 *  NextAuth(authConfig) at module load, which wants an Edge runtime and the
 *  session secret — neither belongs in a unit test of a string. */
function matcher(): string {
  const src = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const m = src.match(/matcher:\s*\[\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) throw new Error("middleware.ts no longer declares a single string matcher");
  return m[1].replace(/\\\\/g, "\\");
}

const matches = (path: string) => new RegExp(`^${matcher()}$`).test(path);

/** The handler exempts a few paths from the session check before it ever
 *  looks at req.auth. That list is a second, quieter auth surface, so what is
 *  on it is asserted here too. */
function openPaths(): string {
  const src = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const m = src.match(/const open =([\s\S]*?);/);
  if (!m) throw new Error("middleware.ts no longer declares an `open` list");
  return m[1];
}

describe("paths exempt from the session check", () => {
  it("exempts email intake, which authenticates itself instead", () => {
    /** Power Automate cannot hold a session. The route checks a shared secret
     *  in its own code — see intakeTokenOk — so the exemption is not a hole,
     *  but it is the only one of its kind and should stay deliberate. */
    expect(openPaths()).toMatch(/\/api\/intake\/email/);
  });

  it("exempts nothing else beyond sign-in and the auth endpoints", () => {
    const paths = openPaths().match(/"([^"]+)"/g) ?? [];
    expect(paths.sort()).toEqual(['"/api/auth"', '"/api/intake/email"', '"/login"']);
  });
});

describe("middleware matcher", () => {
  it("lets brand assets through without a session", () => {
    for (const path of [
      "/favicon.ico",
      "/icon.png",
      "/apple-icon.png",
      "/opengraph-image.png",
      "/brand/bistec-lockup.png",
      "/brand/bistec-lockup-dark.png",
    ]) {
      expect(matches(path), `${path} must not require auth`).toBe(false);
    }
  });

  it("still guards the framework paths it always guarded", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
  });

  it("still protects pages and API routes", () => {
    for (const path of [
      "/",
      "/catalog",
      "/estate",
      "/rules",
      "/audit",
      "/request/SR-1043",
      "/dpia/SR-1043",
      "/api/requests",
      "/api/skill/software-compliance-research",
    ]) {
      expect(matches(path), `${path} must require auth`).toBe(true);
    }
  });

  it("escapes the dot in favicon.ico rather than matching any character", () => {
    /** An unescaped `.` would exempt faviconXico too. Nothing serves that, but
     *  the same laxness copied onto a real asset name is how an auth hole
     *  starts. */
    expect(matches("/faviconXico")).toBe(true);
  });

  it("does not exempt a route merely for containing a dot", () => {
    expect(matches("/api/v1.1/requests")).toBe(true);
    expect(matches("/request/some.vendor.com")).toBe(true);
  });
});
