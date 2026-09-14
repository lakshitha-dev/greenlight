import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { hasKey } from "@/lib/research";

export const metadata: Metadata = {
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
  { href: "/audit", label: "Audit trail", section: "Governance" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <nav className="rail">
            <Link href="/" className="brand">
              <span className="dot" />
              <span>
                <b>GreenLight</b>
                <span>BISTEC Global · Ops</span>
              </span>
            </Link>

            {["Decisions", "Governance"].map((section) => (
              <div key={section} style={{ display: "contents" }}>
                <div className="navsec eyebrow">{section}</div>
                {NAV.filter((n) => n.section === section).map((n) => (
                  <Link key={n.href} href={n.href} className="navitem">
                    {n.label}
                    {counts[n.href] !== undefined && <span className="ct">{counts[n.href]}</span>}
                  </Link>
                ))}
              </div>
            ))}

            <div className="railfoot">
              Signed in as <b>Sajith</b>
              <br />
              Head of Operations &amp; IT
              <br />
              <span className="mono" style={{ fontSize: "10.5px" }}>
                Approver · all entities
              </span>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
                <span className={`pill ${hasKey() ? "p-ok" : "p-mute"}`}>
                  {hasKey() ? "Synthesis on" : "Sources only"}
                </span>
              </div>
            </div>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
