/** Everything except the sign-in page and the auth endpoints requires a
 *  session. Role checks live at the point of action rather than here, because
 *  "can this person decide" is a question about the decision, not the URL.
 *
 *  Uses the Edge-safe config: middleware cannot load a database driver. */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  /** Email intake is the one route a caller reaches without a session: a Power
   *  Automate flow in Outlook cannot hold one. It is not unauthenticated —
   *  it checks a shared secret in an x-greenlight-token header itself, and a
   *  signed-in person posting from /intake/email is accepted the usual way.
   *  Doing that check inside the route keeps the secret out of the Edge
   *  runtime and lets the failure say which of the two ways was missing. */
  const open =
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname === "/api/intake/email";
  if (open || req.auth) return;

  /** An API answers 401, a page redirects. Sending a caller that asked for
   *  JSON a 302 to an HTML sign-in form tells it nothing and breaks it in a
   *  way that looks like a parse error. */
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("from", pathname);
  return Response.redirect(url);
});

/** Brand assets must stay reachable without a session. Next serves the
 *  file-convention icons at bare paths (/icon.png, /apple-icon.png,
 *  /opengraph-image.png), so without these exclusions auth() runs on them and
 *  a signed-out request gets a 302 to /login. That breaks the favicon on the
 *  sign-in page and — because every link unfurler is unauthenticated — makes
 *  the OpenGraph image permanently unreachable to Slack and Teams.
 *
 *  Listed explicitly rather than as a generic "any path with a dot", which
 *  would also exempt API routes whose segments contain one. Guarded by
 *  tests/middleware.test.ts. */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image\\.png|brand/).*)",
  ],
};
