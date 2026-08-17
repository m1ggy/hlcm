-- Login-credentials section for a Client, kept separate from Notes so it
-- doesn't get buried under a growing comment thread (docs/pipeline-stage-plan.md).
-- Plain fields, same visibility as the rest of a Client record — not
-- encrypted at rest (confirmed choice).

-- CreateTable
CREATE TABLE "client_credentials" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_credentials_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
