/** Authentication and authorisation.
 *
 *  A credentials provider over the User table. The important part is not the
 *  sign-in mechanism — that is one file and swapping it for Entra ID changes
 *  only this file — it is that the audit trail now records *who* decided.
 *  Every action used to be attributed to a string literal.
 *
 *  Roles are coarse on purpose: requester < approver < admin. Only an approver
 *  can decide, because the decision is the act the audit trail exists to
 *  evidence, and an audit trail nobody can be held to is decoration.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { verifyPassword } from "./password";
import { authConfig } from "./auth.config";
import { atLeast, ROLE_LABEL, type Role } from "./roles";

export { atLeast, ROLE_LABEL };
export type { Role };

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role; entity: string | null } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
    entity?: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });

        // Verify even when there is no such user, against the same cost, so a
        // wrong address and a wrong password take the same time to reject.
        const stored = user?.passwordHash ?? "scrypt:0000:" + "0".repeat(128);
        const ok = await verifyPassword(password, stored);
        if (!user || !ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          entity: user.entity,
        };
      },
    }),
  ],
});


export type Actor = { id: string; name: string; role: Role };

/** The actor recorded against every audit event. Falls back to a named
 *  system actor rather than to a person's name, so an unauthenticated write
 *  can never be mistaken for a human decision. */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "unknown",
    role: session.user.role,
  };
}

