import { redirect } from "next/navigation";
import { signIn, auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function submit(formData: FormData) {
  "use server";
  const from = String(formData.get("from") ?? "/") || "/";
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: from,
    });
  } catch (e) {
    // signIn throws a redirect on success; anything else is a failed attempt
    if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
  if (await auth()) redirect("/");

  return (
    /** Signed out, the layout hands this page the whole document — no rail, no
     *  chrome. So it centres in the viewport rather than sitting in a column
     *  pinned to the top with two-thirds of the screen empty below it.
     *
     *  padding-block, not a padding shorthand: on a short window the card needs
     *  to push the page taller and scroll, not get clamped and clipped. */
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingBlock: "48px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/** Lockup centred above the card — the standard auth composition, and
          *  the light/dark pair swaps on the viewer's theme. */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <img
            className="lockup lockup-light"
            src="/brand/bistec-lockup.png"
            width={168}
            height={46}
            alt="BISTEC Global"
            style={{ margin: "0 auto" }}
          />
          <img
            className="lockup lockup-dark"
            src="/brand/bistec-lockup-dark.png"
            width={168}
            height={46}
            alt="BISTEC Global"
            style={{ margin: "0 auto" }}
          />
          <div className="product" style={{ marginTop: 12 }}>
            <b style={{ fontSize: 16 }}>GreenLight</b>
            <span>Approval console</span>
          </div>
        </div>

        {/** The app's own panel, so the one surface a person sees before signing
          *  in is the same surface they see everywhere after. */}
        <div className="panel">
          <div style={{ padding: "26px 26px 28px" }}>
            <h1 style={{ fontSize: 18, margin: "0 0 7px" }}>Sign in</h1>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              Every decision is recorded against the person who made it, so GreenLight needs
              to know who you are.
            </p>

            {error && (
              <div className="callout" style={{ marginBottom: 18 }}>
                <span>◆</span>
                <div>That email and password did not match an account.</div>
              </div>
            )}

            <form action={submit}>
              <input type="hidden" name="from" value={from ?? "/"} />
              <div className="field">
                <label className="fl" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: 20 }}>
                <label className="fl" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className="btn primary" type="submit" style={{ width: "100%" }}>
                Sign in
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
