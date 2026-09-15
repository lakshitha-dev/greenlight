-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "draftReply" TEXT,
ADD COLUMN     "emailConversationId" TEXT,
ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "emailReceivedAt" TEXT,
ADD COLUMN     "gaps" TEXT,
ADD COLUMN     "rawEmail" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'form';

-- CreateIndex
CREATE UNIQUE INDEX "Request_emailConversationId_key" ON "Request"("emailConversationId");

