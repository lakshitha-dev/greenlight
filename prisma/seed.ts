/** Seed: one working day of requests at BISTEC Global.
 *
 *  Catalog seat counts and review dates are set so the gate demonstrates all
 *  three tiers on real data — Slack's review lapses today, which is what makes
 *  it re-escalate rather than self-serve. */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { fieldsFromExtraction, draftClarification, type Extraction } from "../lib/email";

const db = new PrismaClient();
const today = new Date().toISOString().slice(0, 10);

const catalog = [
  {
    name: "Zoom",
    vendor: "Zoom Communications",
    seats: 180,
    used: 157,
    approved: "2026-01-22",
    review: "2027-01-22",
    entities: ["BISTEC Global"],
    kev: 0,
    kevSince: 0,
    owner: "IT Infrastructure",
    cost: "LKR 2,160,000 / yr",
    processNames: JSON.stringify(["zoom.exe", "cpthost.exe", "zoommgr.exe"]),
  },
  {
    name: "Confluence",
    vendor: "Atlassian",
    seats: 142,
    used: 118,
    approved: "2025-06-18",
    review: "2027-06-18",
    entities: ["BISTEC Global"],
    kev: 13,
    kevSince: 0,
    owner: "Delivery",
    cost: "LKR 1,704,000 / yr",
    processNames: JSON.stringify([]),
  },
  {
    name: "Figma",
    vendor: "Figma Inc",
    seats: 26,
    used: 26,
    approved: "2026-02-10",
    review: "2027-02-10",
    entities: ["BISTEC Global"],
    kev: 0,
    kevSince: 0,
    owner: "Design",
    cost: "LKR 936,000 / yr",
    processNames: JSON.stringify(["figma.exe", "figma_agent.exe"]),
  },
  {
    name: "Slack",
    vendor: "Salesforce",
    seats: 210,
    used: 187,
    approved: "2025-11-04",
    review: today, // lapses today — the anti-rot case
    entities: ["BISTEC Global"],
    kev: 0,
    kevSince: 0,
    owner: "IT Infrastructure",
    cost: "LKR 5,040,000 / yr",
    processNames: JSON.stringify(["slack.exe"]),
  },
  {
    name: "Microsoft 365",
    vendor: "Microsoft",
    seats: 340,
    used: 311,
    approved: "2025-03-02",
    review: "2026-09-30",
    entities: ["BISTEC Global"],
    kev: 388,
    kevSince: 6,
    owner: "IT Infrastructure",
    cost: "LKR 12,240,000 / yr",
    processNames: JSON.stringify(["winword.exe", "excel.exe", "outlook.exe", "ms-teams.exe", "onedrive.exe", "powerpnt.exe"]),
  },
];

const requests = [
  {
    id: "SR-1050",
    kind: "software",
    product: "Zoom",
    vendor: "Zoom Communications",
    seats: 1,
    subject: "Zoom — licence for new support hire",
    requester: "the Support Engineer",
    team: "Support Team",
    entity: "BISTEC Global",
    body: "Hi,\n\nNew technician starting Monday on the managed service desk. She needs a Zoom licence for customer calls.\n\nSupport Team",
    personalData: false,
  },
  {
    id: "SR-1051",
    kind: "software",
    product: "Confluence",
    vendor: "Atlassian",
    seats: 2,
    subject: "Confluence — access for two new engineers",
    requester: "the Delivery Lead",
    team: "Delivery",
    entity: "BISTEC Global",
    body: "Two engineers joined the platform team this week and need Confluence access for the delivery documentation space.\n\nDelivery",
    personalData: false,
  },
  {
    id: "SR-1052",
    kind: "software",
    product: "Figma",
    vendor: "Figma Inc",
    seats: 1,
    subject: "Figma — seat for incoming designer",
    requester: "the Marketing Lead",
    team: "Marketing",
    entity: "BISTEC Global",
    body: "We have a designer starting on the 21st and need a Figma seat for her.\n\nMarketing",
    personalData: false,
  },
  {
    id: "SR-1045",
    kind: "software",
    product: "Slack",
    vendor: "Salesforce",
    seats: 210,
    subject: "Slack — scheduled re-review",
    requester: "GreenLight (automatic)",
    team: "System",
    entity: "BISTEC Global",
    body: "Scheduled re-review. Slack was approved on 2025-11-04 with a ten-month review interval.\n\nThe catalog entry lapses today. Until it is renewed, Slack requests no longer self-serve.",
    personalData: true,
    subjectCount: 210,
    subjects: "BISTEC staff",
    categories: ["Name", "Work email", "Message content"],
    purpose: "Internal team communication",
    retention: "Per workspace retention policy",
    crossBorder: "true",
  },
  {
    id: "SR-1042",
    kind: "software",
    product: "ScreenConnect",
    vendor: "ConnectWise",
    seats: 12,
    subject: "ConnectWise ScreenConnect — remote support tooling",
    requester: "the Support Engineer",
    team: "Support Team",
    entity: "BISTEC Global",
    body: "Hi,\n\nThe support team needs a remote-access tool so we can take over customer machines during managed service desk calls. ScreenConnect is what the outgoing provider used, so the team already knows it.\n\nLooking at 12 technician seats. Can we get this approved this week? The desk goes live on the 28th.\n\nThanks,\nSupport Team",
    personalData: true,
    subjects: "Customer end-users on supported machines — population not bounded",
    categories: ["Screen contents during support sessions", "Device identifiers", "Session recordings"],
    purpose: "Remote technical support for the managed service desk",
    retention: "Session recordings retained 90 days (vendor default)",
    crossBorder: "true",
    monitoring: true,
  },
  {
    id: "SR-1043",
    kind: "software",
    product: "Notion",
    vendor: "Notion Labs",
    seats: 18,
    subject: "Notion — team workspace for Marketing",
    requester: "the Marketing Lead",
    team: "Marketing",
    entity: "BISTEC Global",
    body: "Hi,\n\nMarketing would like Notion for campaign planning and the content calendar. We're currently running everything out of spreadsheets and it isn't holding up.\n\n18 users on the Business plan. Budget is approved by our department.\n\nMarketing",
    personalData: true,
    subjectCount: 4200,
    subjects: "Marketing contacts and prospects",
    categories: ["Name", "Business email", "Campaign engagement history"],
    purpose: "Campaign planning and content calendar",
    retention: "Until account closure",
    crossBorder: "true",
  },
  {
    id: "SR-1044",
    kind: "software",
    product: "Flowtrace AI",
    vendor: "Flowtrace Labs",
    seats: 4,
    subject: "Flowtrace AI — automated test-case generation",
    requester: "the Delivery Lead",
    team: "QA",
    entity: "BISTEC Global",
    body: "Requesting Flowtrace AI for the QA team — it generates regression test cases from Jira tickets. Saw it demoed at a conference.\n\nSmall vendor, 4 seats to trial.",
    personalData: true,
    subjects: "Anyone named in a Jira ticket — customers and staff",
    categories: ["Free-text defect descriptions", "Customer data pasted into tickets"],
    purpose: "Automated regression test-case generation",
    retention: "Unknown — no published retention policy",
    crossBorder: "unknown",
  },
  {
    id: "SR-1046",
    kind: "software",
    product: "FortiClient",
    vendor: "Fortinet",
    seats: 40,
    subject: "Fortinet FortiClient VPN — remote workforce",
    requester: "the Infrastructure Engineer",
    team: "IT Infrastructure",
    entity: "BISTEC Global",
    body: "Requesting FortiClient for the remote engineering team's VPN access. 40 seats.",
    personalData: true,
    subjectCount: 40,
    subjects: "BISTEC Global employees",
    categories: ["Employee identifier", "Connection logs", "Source IP address"],
    purpose: "VPN access control for the remote workforce",
    retention: "Connection logs retained 12 months",
    crossBorder: "false",
  },
  {
    id: "AR-0318",
    kind: "iso",
    subject: "ISO document approval — Asset Management Procedure v4",
    requester: "the Quality Manager",
    team: "Quality",
    entity: "BISTEC Global",
    body: "Dear IT,\n\nPlease find attached the revised Asset Management Procedure (v4) for your approval ahead of the internal audit.\n\nAttachment: BG-QMS-PR-014-AssetManagement-v4.docx\n\nRegards,\nQuality",
    personalData: false,
  },
];

/** Three accounts, one per role, so the difference between them is
 *  demonstrable. A shared password is acceptable for seeded demo data and for
 *  nothing else. */
const users = [
  { email: "ops@bistec.example", name: "Head of Operations", role: "approver", entity: null },
  { email: "support@bistec.example", name: "Support Engineer", role: "requester", entity: "BISTEC Global" },
  { email: "admin@bistec.example", name: "Platform Administrator", role: "admin", entity: null },
];
const DEMO_PASSWORD = "greenlight";

async function main() {
  await db.user.deleteMany();
  await db.auditEvent.deleteMany();
  await db.decision.deleteMany();
  await db.dossier.deleteMany();
  await db.request.deleteMany();
  await db.catalogEntry.deleteMany();

  for (const c of catalog) {
    await db.catalogEntry.create({ data: { ...c, entities: JSON.stringify(c.entities) } });
  }

  const ages = [4, 7, 1320, 10800, 187200, 94800, 21600, 39600, 263000]; // seconds in queue
  let i = 0;
  for (const r of requests) {
    const { categories, ...rest } = r;
    await db.request.create({
      data: {
        ...rest,
        categories: categories ? JSON.stringify(categories) : null,
        receivedAt: new Date(Date.now() - ages[i++] * 1000),
      },
    });
  }

  /** Two requests that arrived the way requests actually arrive.
   *
   *  Built by the same functions the intake route uses rather than hand-written,
   *  so the demo data cannot drift away from what the code produces — including
   *  the rule that an inferred legal entity is a question, not a value. */
  const field = <T,>(value: T, provenance: "stated" | "inferred" | "none", source: string | null) =>
    ({ value, provenance, source }) as never;

  const emailed: { id: string; age: number; email: { from: string; subject: string; body: string; receivedAt: string; conversationId: string }; x: Extraction }[] = [
    {
      id: "SR-1047",
      age: 5400,
      email: {
        from: "Marketing Lead <marketing.lead@bistecglobal.com>",
        subject: "Canva Pro for the marketing team",
        body: [
          "Hi,",
          "",
          "Could we get Canva Pro for the marketing team? There are 6 of us and we are",
          "rebuilding the case-study templates.",
          "",
          "Thanks,",
          "Marketing Lead",
        ].join("\n"),
        receivedAt: "Tuesday, 15 September 2026 08:40",
        conversationId: "AAQkSEED-CANVA-01",
      },
      x: {
        product: field("Canva Pro", "stated", "Could we get Canva Pro"),
        vendor: field("Canva", "inferred", "the maker of the named product"),
        seats: field(6, "stated", "There are 6 of us"),
        team: field("Marketing", "stated", "for the marketing team"),
        // The email never names an entity. Marketing sits in more than one, so
        // there is nothing to infer from either — this is the question the
        // drafted reply goes back with.
        // One legal entity today, so an email that does not name one leaves
        // nothing open.
        entity: field(null, "none", null),
        purpose: field("Rebuilding case-study templates", "stated", "rebuilding the case-study templates"),
        // The email never raises the subject. Silence is not a denial, so this is
        // "none" and becomes the question the drafted reply goes back with.
        personalData: field(null, "none", null),
        specialCat: field(null, "none", null),
      },
    },
    {
      id: "SR-1048",
      age: 260,
      email: {
        from: "Delivery Lead <delivery.lead@bistecglobal.com>",
        subject: "Linear for the delivery team",
        body: [
          "Hi,",
          "",
          "We would like Linear for issue tracking on the platform engagements.",
          "12 seats. No client personal data goes in — it is",
          "ticket titles and engineering notes only.",
          "",
          "Delivery Lead",
        ].join("\n"),
        receivedAt: "Tuesday, 15 September 2026 09:55",
        conversationId: "AAQkSEED-LINEAR-01",
      },
      x: {
        product: field("Linear", "stated", "We would like Linear"),
        vendor: field("Linear Orbit, Inc.", "inferred", "the maker of the named product"),
        seats: field(12, "stated", "12 seats"),
        team: field("Delivery", "stated", "for the delivery team"),
        entity: field("BISTEC Global", "stated", "the only entity"),
        purpose: field("Issue tracking for platform engagements", "stated", "issue tracking on the platform engagements"),
        personalData: field(false, "stated", "No client personal data goes in"),
        specialCat: field(false, "stated", "ticket titles and engineering notes only"),
      },
    },
  ];

  for (const e of emailed) {
    const { fields, gaps } = fieldsFromExtraction(e.email, e.x);
    await db.request.create({
      data: {
        id: e.id,
        kind: "software",
        product: fields.product,
        vendor: fields.vendor,
        seats: fields.seats,
        subject: fields.subject,
        requester: fields.requester,
        team: fields.team,
        entity: fields.entity,
        body: fields.body,
        personalData: fields.personalData,
        specialCat: fields.specialCat,
        purpose: e.x.purpose.value,
        crossBorder: "unknown",
        source: "email",
        emailFrom: e.email.from,
        emailReceivedAt: e.email.receivedAt,
        emailConversationId: e.email.conversationId,
        rawEmail: e.email.body,
        gaps: gaps.length ? JSON.stringify(gaps) : null,
        draftReply: draftClarification(e.email, gaps) || null,
        receivedAt: new Date(Date.now() - e.age * 1000),
      },
    });
    await db.auditEvent.create({
      data: {
        requestId: e.id,
        action: "Request received by email",
        detail: [
          `From ${e.email.from}`,
          fields.product ?? "no product named",
          "read in Claude and pasted back",
          gaps.length ? `${gaps.length} question(s) to put back` : "nothing left unanswered",
        ].join(" · "),
        actor: fields.requester,
        authority: "email-intake@1.0",
      },
    });
  }

  // the two self-service provisionings already happened this morning
  for (const id of ["SR-1050", "SR-1051"]) {
    const req = await db.request.findUnique({ where: { id } });
    const entry = await db.catalogEntry.findUnique({ where: { name: req!.product! } });
    await db.auditEvent.create({
      data: {
        requestId: id,
        action: "Provisioned automatically",
        detail: `${req!.product} · catalog entry current to ${entry!.review} · no approver required`,
        actor: "GreenLight",
        authority: "catalog-gate@1.0",
      },
    });
  }

  /** The ISO document's assessments, recorded against requirement ids. An
   *  assessed requirement resolves to the same Fact type a measured one does,
   *  so the identical engine, provenance rules and audit trail apply. */
  const isoAssessments = {
    R1: { value: false, prov: "sourced", src: "No business outcome or driver is given for the revision." },
    R2: { value: false, prov: "sourced", src: "The document names no accountable owner for the asset register." },
    R3: { value: true,  prov: "sourced", src: "Cites ISO 27001 A.5.9 in the header." },
    R4: { value: true,  prov: "sourced", src: "Revision history table present, v3 to v4 deltas listed." },
    R5: { value: true,  prov: "sourced", src: "Next review 2027-03-01, within twelve months." },
  };
  await db.dossier.create({
    data: {
      requestId: "AR-0318",
      facts: JSON.stringify(isoAssessments),
      sources: JSON.stringify([
        {
          source: "Document review",
          result: "Assessed against iso-document-approval@1.4 — two blocking requirements unmet.",
          kind: "hit",
        },
      ]),
      model: "assessed by Quality",
      elapsedMs: 0,
    },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of users) await db.user.create({ data: { ...u, passwordHash } });

  console.log(
    `seeded ${catalog.length} catalog entries, ${requests.length + emailed.length} requests ` +
      `(${emailed.length} of them by email), ${users.length} users`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
