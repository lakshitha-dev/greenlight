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
  const open = pathname.startsWith("/api/auth") || pathname === "/login";
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
