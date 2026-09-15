/** Roles, with no dependencies at all.
 *
 *  Separate from lib/auth.ts on purpose: importing that pulls in the whole
 *  next-auth runtime, which needs the Next server environment. Asking whether
 *  an approver outranks a requester should not require a web framework, and a
 *  test of that rule should not need one either. */

export type Role = "requester" | "approver" | "admin";

const RANK: Record<Role, number> = { requester: 1, approver: 2, admin: 3 };

export function atLeast(role: Role | undefined, required: Role): boolean {
  return RANK[role ?? "requester"] >= RANK[required];
}

export const ROLE_LABEL: Record<Role, string> = {
  requester: "Requester",
  approver: "Approver",
  admin: "Administrator",
};
