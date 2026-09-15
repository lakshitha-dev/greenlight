import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { hasKey } from "@/lib/research";
import { auth, ROLE_LABEL, signOut, type Role } from "@/lib/auth";
import { NavLink } from "@/components/NavLink";

export const metadata: Metadata = {
  /** metadataBase makes og:image absolute. Without it Next emits a relative URL
   *  that several unfurlers reject, and warns at build. Port 3001 matches the
   *  dev/start scripts. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: "GreenLight",
  description: "Approval console — BISTEC Global",
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Request queue", section: "Decisions" },
  { href: "/catalog", label: "Software catalog", section: "Decisions" },
  { href: "/estate", label: "Endpoint estate", section: "Decisions" },
  { href: "/privacy", label: "Privacy assessments", section: "Governance" },
  { href: "/rules", label: "Rule packs", section: "Governance" },
  { href: "/skill", label: "Claude skills", section: "Governance" },
  { href: "/audit", label: "Audit trail", section: "Governance" },
];

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/** Lato is the BISTEC typeface. It ships 100/300/400/700/900 — asking
          *  for 500 or 600 returns nothing and the browser silently rounds, so
          *  only weights Lato has are requested and only those are declared in
          *  globals.css. Plex Mono stays for ids and dates. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Lato:wght@400;700;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  /** Signed out — the sign-in page gets the document and nothing else. Reading
   *  the counts here would query the database for someone with no session. */
  if (!session?.user) {
    return (
      <Document>
        <main style={{ padding: "0 24px" }}>{children}</main>
      </Document>
    );
  }

  const [queue, catalog, events] = await Promise.all([
    db.request.count(),
    db.catalogEntry.count(),
    db.auditEvent.count(),
  ]);

  const counts: Record<string, string | number> = {
    "/": queue,
    "/catalog": catalog,
    "/audit": events,
  };

  return (
    <Document>
      <div className="shell">
        <nav className="rail" aria-label="Primary">
            <Link href="/" className="brand">
              {/** Two files rather than one: the light lockup ends "BISTEC" in
                *  navy, which is 1.72:1 on the dark rail. display:none keeps the
                *  unused one out of the accessibility tree too. */}
              <img
                className="lockup lockup-light"
                src="/brand/bistec-lockup.png"
                width={168}
                height={46}
                alt="BISTEC Global"
              />
              <img
                className="lockup lockup-dark"
                src="/brand/bistec-lockup-dark.png"
                width={168}
                height={46}
                alt="BISTEC Global"
              />
              <span className="product">
                <b>GreenLight</b>
                <span>Approval console</span>
              </span>
            </Link>

            {["Decisions", "Governance"].map((section) => (
              <div key={section} style={{ display: "contents" }}>
                <h2 className="navsec eyebrow">{section}</h2>
                {NAV.filter((n) => n.section === section).map((n) => (
                  <NavLink key={n.href} href={n.href} label={n.label} count={counts[n.href]} />
                ))}
              </div>
            ))}

            <div className="railfoot">
              Signed in as <b>{session.user.name}</b>
              <br />
              <span className="mono" style={{ fontSize: "10.5px" }}>
                {ROLE_LABEL[session.user.role as Role]}
                {session.user.entity ? ` · ${session.user.entity}` : " · all entities"}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  style={{
                    marginTop: 8,
                    fontSize: 11.5,
                    color: "var(--muted)",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Sign out
                </button>
              </form>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
                <span className={`pill ${hasKey() ? "p-ok" : "p-mute"}`}>
                  {hasKey() ? "Synthesis on" : "Sources only"}
                </span>
              </div>
            </div>
        </nav>
        <main>{children}</main>
      </div>
    </Document>
  );
}
