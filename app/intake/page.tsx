import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { withUniqueId } from "@/lib/ids";
import { Panel, Callout } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ENTITIES = [
  "BISTEC Solutions",
  "BISTEC Global (SL)",
  "BISTEC Australia",
  "BISTEC Accounting",
  "BISTEC Care",
];

async function submit(formData: FormData) {
  "use server";

  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const product = s("product");
  const entity = s("entity") || ENTITIES[0];
  if (!product) redirect("/intake");

  const requester = s("requester") || "Unnamed requester";

  /** One ID generator for both intake paths — these used to be minted from
   *  row counts with different offsets here and in the endpoint-raise route,
   *  which collide on the primary key past about a hundred rows. */
  const created = await withUniqueId((id) =>
    db.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: {
          id,
          kind: "software",
          product,
          vendor: s("vendor") || null,
          seats: Number(formData.get("seats")) || null,
          subject: `${product} — ${requester}`,
          requester,
          team: s("team") || "—",
          entity,
          body: s("body") || `Requesting ${product}.`,
          personalData: formData.get("personalData") === "on",
          specialCat: formData.get("specialCat") === "on",
          monitoring: formData.get("monitoring") === "on",
          subjectCount: Number(formData.get("subjectCount")) || null,
          subjects: s("subjects") || null,
          purpose: s("purpose") || null,
          retention: s("retention") || null,
          crossBorder: s("crossBorder") || "unknown",
          categories: s("categories")
            ? JSON.stringify(
                s("categories")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
              )
            : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          requestId: id,
          action: "Request received",
          detail: `${product} · ${entity} · submitted via intake`,
          actor: requester,
          authority: "catalog-gate@1.0",
        },
      });
      return r;
    })
  );

  redirect(`/request/${created.id}`);
}

export default function IntakePage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>New software request</h1>
          <div className="sub">
            Name any tool. GreenLight checks the catalog first, then researches it against live
            sources if nothing is on file.
          </div>
        </div>
        <div className="actions">
          <Link href="/" className="btn sm">
            Back to queue
          </Link>
        </div>
      </div>

      <form action={submit}>
        <div className="split">
          <div className="stack">
            <Panel title="The request">
              <div className="grid2">
                <div className="field">
                  <label className="fl" htmlFor="product">
                    Software
                  </label>
                  <input id="product" name="product" type="text" placeholder="e.g. Airtable" required />
                </div>
                <div className="field">
                  <label className="fl" htmlFor="vendor">
                    Vendor
                  </label>
                  <input id="vendor" name="vendor" type="text" placeholder="e.g. Formagrid Inc" />
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label className="fl" htmlFor="requester">
                    Requester
                  </label>
                  <input id="requester" name="requester" type="text" placeholder="Name" />
                </div>
                <div className="field">
                  <label className="fl" htmlFor="team">
                    Team
                  </label>
                  <input id="team" name="team" type="text" placeholder="e.g. Support Team" />
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label className="fl" htmlFor="entity">
                    Entity
                  </label>
                  <select id="entity" name="entity" defaultValue={ENTITIES[0]}>
                    {ENTITIES.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="fl" htmlFor="seats">
                    Seats
                  </label>
                  <input id="seats" name="seats" type="number" min={1} defaultValue={1} />
                </div>
              </div>
              <div className="field">
                <label className="fl" htmlFor="body">
                  Paste the request
                </label>
                <textarea
                  id="body"
                  name="body"
                  placeholder="Paste the email or type the business justification…"
                />
              </div>
            </Panel>
          </div>

          <div className="stack">
            <Panel title="Processing profile" eyebrow="drives DPIA screening">
              <div className="field">
                <label className="fl" htmlFor="purpose">
                  Purpose
                </label>
                <input id="purpose" name="purpose" type="text" placeholder="What it will be used for" />
              </div>
              <div className="field">
                <label className="fl" htmlFor="subjects">
                  Whose data
                </label>
                <input id="subjects" name="subjects" type="text" placeholder="e.g. Marketing contacts" />
              </div>
              <div className="grid2">
                <div className="field">
                  <label className="fl" htmlFor="subjectCount">
                    How many people
                  </label>
                  <input id="subjectCount" name="subjectCount" type="number" min={0} placeholder="blank = unbounded" />
                </div>
                <div className="field">
                  <label className="fl" htmlFor="crossBorder">
                    Leaves the jurisdiction?
                  </label>
                  <select id="crossBorder" name="crossBorder" defaultValue="unknown">
                    <option value="unknown">Not known</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="fl" htmlFor="categories">
                  Categories of data
                </label>
                <input id="categories" name="categories" type="text" placeholder="Comma separated" />
              </div>
              <div className="field">
                <label className="fl" htmlFor="retention">
                  Retention
                </label>
                <input id="retention" name="retention" type="text" placeholder="How long it is kept" />
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: "13px" }}>
                <label htmlFor="personalData">
                  <input id="personalData" name="personalData" type="checkbox" defaultChecked /> Personal data
                </label>
                <label htmlFor="specialCat">
                  <input id="specialCat" name="specialCat" type="checkbox" /> Special category
                </label>
                <label htmlFor="monitoring">
                  <input id="monitoring" name="monitoring" type="checkbox" /> Systematic monitoring
                </label>
              </div>
            </Panel>

            <Callout tone="info">
              <b>Only the processing profile needs a person.</b> Everything else — vulnerabilities,
              certifications, residency, pricing — GreenLight finds for itself.
            </Callout>

            <button className="btn primary" type="submit" style={{ alignSelf: "flex-start" }}>
              Submit request
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
