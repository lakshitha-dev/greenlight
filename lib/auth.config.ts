/** The Edge-safe half of the auth setup.
 *
 *  Middleware runs on the Edge runtime, which has no node:crypto and no
 *  database driver. It only needs to answer "is there a valid session", which
 *  the JWT callbacks alone can do — so the Credentials provider, the Prisma
 *  client and the scrypt hashing all live in lib/auth.ts, which is imported
 *  only from Node contexts. Keeping them in one file pulls node:crypto into
 *  the Edge bundle and the build fails. */

import type { NextAuthConfig } from "next-auth";
import type { Role } from "./roles";

export type { Role };

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // added in lib/auth.ts, which never reaches the Edge
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "requester";
        token.entity = user.entity ?? null;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.role = (token.role as Role) ?? "requester";
      session.user.entity = (token.entity as string | null) ?? null;
      return session;
    },
  },
};
