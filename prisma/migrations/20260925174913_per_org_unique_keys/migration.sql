-- Multitenancy Phase 3a: keys that were unique across the whole app become
-- unique per organization (each tenant has its own users, service types,
-- pipeline stages, form slugs and manual invoice numbers).

-- DropIndex
DROP INDEX "form_templates_slug_key";

-- DropIndex
DROP INDEX "invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "pipeline_stages_pipeline_abbrev_key";

-- DropIndex
DROP INDEX "service_types_name_key";

-- DropIndex
DROP INDEX "users_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_organizationId_slug_key" ON "form_templates"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_invoiceNumber_key" ON "invoices"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_organizationId_pipeline_abbrev_key" ON "pipeline_stages"("organizationId", "pipeline", "abbrev");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_organizationId_name_key" ON "service_types"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "users"("organizationId", "email");

