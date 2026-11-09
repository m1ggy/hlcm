-- Share links for applications (docs/client-portal-eod-plan.md, Phase D): a
-- read-only progress page anyone with the link can open. Only the token's
-- SHA-256 is stored.
--
-- Hand-written from `prisma migrate diff`; ends with the tenant policies and
-- same-org triggers every new tenant table gets.
-- CreateTable
CREATE TABLE "application_share_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "application_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_share_links_organizationId_idx" ON "application_share_links"("organizationId");

-- CreateIndex
CREATE INDEX "application_share_links_applicationId_idx" ON "application_share_links"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "application_share_links_organizationId_tokenHash_key" ON "application_share_links"("organizationId", "tokenHash");

-- AddForeignKey
ALTER TABLE "application_share_links" ADD CONSTRAINT "application_share_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_share_links" ADD CONSTRAINT "application_share_links_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_share_links" ADD CONSTRAINT "application_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_share_links" ADD CONSTRAINT "application_share_links_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One active (not revoked) link per application.
CREATE UNIQUE INDEX "application_share_links_one_active" ON "application_share_links"("applicationId") WHERE "revokedAt" IS NULL;

SELECT ensure_tenant_policies();
SELECT ensure_same_org_triggers();
