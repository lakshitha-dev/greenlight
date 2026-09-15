/** Authentication and authorisation.
 *
 *  Two things matter here. Passwords must never be comparable in variable
 *  time, and the role ladder must actually stop a requester from deciding —
 *  an audit trail that records a decision nobody was authorised to make is
 *  worse than no audit trail, because it looks like evidence. */

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { atLeast, ROLE_LABEL, type Role } from "@/lib/roles";

describe("password hashing", () => {
  it("accepts the correct password", async () => {
    const stored = await hashPassword("greenlight");
    expect(await verifyPassword("greenlight", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("greenlight");
    expect(await verifyPassword("Greenlight", stored)).toBe(false);
    expect(await verifyPassword("greenligh", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts, so the same password never produces the same hash", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("stores the scheme, so the format can be migrated later", async () => {
    expect(await hashPassword("x")).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it("never stores the password itself", async () => {
    expect(await hashPassword("hunter2")).not.toContain("hunter2");
  });

  it("rejects a malformed or empty stored hash rather than throwing", async () => {
    for (const stored of ["", "garbage", "scrypt:", "scrypt:abc", "bcrypt:a:b", "::"]) {
      expect(await verifyPassword("anything", stored), stored).toBe(false);
    }
  });

  it("rejects a hash of the wrong length without throwing on the comparison", async () => {
    expect(await verifyPassword("x", "scrypt:aabb:00")).toBe(false);
  });
});

describe("role ladder", () => {
  const roles: Role[] = ["requester", "approver", "admin"];

  it("lets every role act as a requester", () => {
    for (const r of roles) expect(atLeast(r, "requester"), r).toBe(true);
  });

  it("stops a requester deciding", () => {
    expect(atLeast("requester", "approver")).toBe(false);
  });

  it("lets an approver decide", () => {
    expect(atLeast("approver", "approver")).toBe(true);
  });

  it("lets an admin do anything an approver can", () => {
    expect(atLeast("admin", "approver")).toBe(true);
    expect(atLeast("admin", "admin")).toBe(true);
  });

  it("stops an approver doing admin work", () => {
    expect(atLeast("approver", "admin")).toBe(false);
  });

  it("treats an absent role as the weakest, not the strongest", () => {
    expect(atLeast(undefined, "requester")).toBe(true);
    expect(atLeast(undefined, "approver")).toBe(false);
    expect(atLeast(undefined, "admin")).toBe(false);
  });

  it("names every role for display", () => {
    for (const r of roles) expect(ROLE_LABEL[r]).toBeTruthy();
  });
});
