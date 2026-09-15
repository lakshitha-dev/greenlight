/** Seed: one working day of requests across the five BISTEC entities.
 *
 *  Catalog seat counts and review dates are set so the gate demonstrates all
 *  three tiers on real data — Slack's review lapses today, which is what makes
 *  it re-escalate rather than self-serve. */

import { PrismaClient } from "@prisma/client";

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
    entities: ["BISTEC Solutions", "BISTEC Global (SL)", "BISTEC Australia"],
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
    entities: ["BISTEC Solutions", "BISTEC Global (SL)"],
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
    entities: ["BISTEC Solutions"],
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
    entities: ["BISTEC Solutions", "BISTEC Global (SL)"],
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
    entities: [
      "BISTEC Solutions",
      "BISTEC Global (SL)",
      "BISTEC Australia",
      "BISTEC Accounting",
      "BISTEC Care",
    ],
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
    entity: "BISTEC Solutions",
    body: "Hi,\n\nNew technician starting Monday on the BDO Australia desk. She needs a Zoom licence for customer calls.\n\nSupport Team",
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
    entity: "BISTEC Global (SL)",
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
    entity: "BISTEC Solutions",
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
    entity: "BISTEC Solutions",
    body: "Scheduled re-review. Slack was approved on 2025-11-04 with a ten-month review interval.\n\nThe catalog entry lapses today. Until it is renewed, Slack requests no longer self-serve.",
    personalData: true,
    subjectCount: 210,
    subjects: "BISTEC staff across two entities",
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
    entity: "BISTEC Solutions",
    body: "Hi,\n\nThe support team needs a remote-access tool so we can take over customer machines during BDO Australia service desk calls. ScreenConnect is what the outgoing provider used, so the team already knows it.\n\nLooking at 12 technician seats. Can we get this approved this week? The desk goes live on the 28th.\n\nThanks,\nSupport Team",
    personalData: true,
    subjects: "Customer end-users on supported machines — population not bounded",
    categories: ["Screen contents during support sessions", "Device identifiers", "Session recordings"],
    purpose: "Remote technical support for the BDO Australia service desk",
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
    entity: "BISTEC Solutions",
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
    entity: "BISTEC Global (SL)",
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
    entity: "BISTEC Australia",
    body: "Requesting FortiClient for the Australian team's VPN access. 40 seats.",
    personalData: true,
    subjectCount: 40,
    subjects: "BISTEC Australia employees",
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
    entity: "BISTEC Global (SL)",
    body: "Dear IT,\n\nPlease find attached the revised Asset Management Procedure (v4) for your approval ahead of the internal audit.\n\nAttachment: BG-QMS-PR-014-AssetManagement-v4.docx\n\nRegards,\nQuality",
    personalData: false,
  },
];

async function main() {
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

  console.log(`seeded ${catalog.length} catalog entries, ${requests.length} requests`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
