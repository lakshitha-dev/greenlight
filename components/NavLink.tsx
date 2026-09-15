"use client";

/** The rail had no current-page indication at all: globals.css styled
 *  .navitem[aria-current] and the layout never set it. Knowing where you are is
 *  the cheapest orientation a console can offer, and aria-current="page" is also
 *  the only way a screen-reader user gets it.
 *
 *  This is the one client component in the shell. The server-side alternative —
 *  having middleware stamp the path into a header for the layout to read — means
 *  restructuring the pass-through return in auth-critical code, which is a poor
 *  trade for a nav highlight. */

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count?: string | number;
}) {
  const pathname = usePathname();
  /** "/" only ever matches itself; every other section also owns its children,
   *  so /request/SR-1043 keeps "Request queue" lit. */
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link href={href} className="navitem" aria-current={active ? "page" : undefined}>
      {label}
      {count !== undefined && <span className="ct">{count}</span>}
    </Link>
  );
}
