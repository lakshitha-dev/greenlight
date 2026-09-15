-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "product" TEXT,
    "vendor" TEXT,
    "seats" INTEGER,
    "requester" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "tier" INTEGER,
    "routeCause" TEXT,
    "routeNote" TEXT,
    "personalData" BOOLEAN NOT NULL DEFAULT false,
    "specialCat" BOOLEAN NOT NULL DEFAULT false,
    "subjectCount" INTEGER,
    "subjects" TEXT,
    "categories" TEXT,
    "purpose" TEXT,
    "retention" TEXT,
    "crossBorder" TEXT,
    "monitoring" BOOLEAN NOT NULL DEFAULT false,
    "automated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "facts" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "model" TEXT,
    "elapsedMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "used" INTEGER NOT NULL,
    "approved" TEXT NOT NULL,
    "review" TEXT NOT NULL,
    "entities" TEXT NOT NULL,
    "kev" INTEGER NOT NULL DEFAULT 0,
    "kevSince" INTEGER NOT NULL DEFAULT 0,
    "owner" TEXT NOT NULL,
    "cost" TEXT NOT NULL,
    "processNames" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'process-analyzer',
    "processes" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "comment" TEXT,
    "packId" TEXT NOT NULL,
    "packVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dossier_requestId_key" ON "Dossier"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_name_key" ON "CatalogEntry"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_requestId_key" ON "Decision"("requestId");

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
