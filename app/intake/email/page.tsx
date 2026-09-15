import Link from "next/link";
import { EmailIntake } from "@/components/EmailIntake";
import { allowedDomains } from "@/lib/email";
import { hasKey } from "@/lib/sources/claude";

export const dynamic = "force-dynamic";

/** The intake path that matches how a request actually arrives.
 *
 *  The allowed domains and whether a credential exists are both read on the
 *  server and handed down, so the preview in the browser reflects this
 *  deployment rather than a default. */
export default function EmailIntakePage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Log an emailed request</h1>
          <div className="sub">
            Paste the email. GreenLight reads it into the same fields the form collects, and
            writes down what it could not establish rather than filling it in.
          </div>
        </div>
        <div className="actions">
          <Link href="/intake" className="btn sm">
            Use the form instead
          </Link>
          <Link href="/" className="btn sm">
            Back to queue
          </Link>
        </div>
      </div>

      <EmailIntake domains={allowedDomains()} autoRead={hasKey()} />
    </>
  );
}
