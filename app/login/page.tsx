import { redirect } from "next/navigation";
import { signIn, auth, ROLE_LABEL, type Role } from "@/lib/auth";
import { db } from "@/lib/db";

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

  // The seeded accounts are shown because this is a demo environment. Remove
  // this block before any real deployment — it is guarded on NODE_ENV so a
  // production build never renders it.
  const demoUsers =
    process.env.NODE_ENV === "production"
      ? []
      : await db.user.findMany({ orderBy: { role: "asc" }, select: { email: true, role: true, name: true } });

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "72px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <span className="dot" />
        <div>
          <b style={{ fontSize: 17, letterSpacing: "-.02em" }}>GreenLight</b>
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>BISTEC Global · Ops</div>
        </div>
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Sign in</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 22, lineHeight: 1.6 }}>
        Every decision is recorded against the person who made it, so GreenLight
        needs to know who you are.
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
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label className="fl" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn primary" type="submit" style={{ width: "100%", marginTop: 4 }}>
          Sign in
        </button>
      </form>

      {demoUsers.length > 0 && (
        <div className="panel" style={{ marginTop: 26 }}>
          <header>
            <h2>Demo accounts</h2>
            <span className="eyebrow">development only</span>
          </header>
          <div className="body">
            {demoUsers.map((u) => (
              <div className="kv" key={u.email}>
                <span className="k">
                  <span className="mono">{u.email}</span>
                  <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{u.name}</div>
                </span>
                <span className="v">
                  <span className={`pill ${u.role === "requester" ? "p-mute" : "p-ok"}`}>
                    {ROLE_LABEL[u.role as Role]}
                  </span>
                </span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              Password for all three: <span className="mono">greenlight</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
