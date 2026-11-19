BEGIN;

ALTER TABLE "LedgerAccount"
  ADD COLUMN "parentAccountId" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "note" TEXT;

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_parentAccountId_company_fkey"
    FOREIGN KEY ("parentAccountId", "company") REFERENCES "LedgerAccount"("id", "company")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LedgerAccount_parentAccountId_no_self"
    CHECK ("parentAccountId" IS DISTINCT FROM "id");

CREATE INDEX "LedgerAccount_company_parentAccountId_idx" ON "LedgerAccount"("company", "parentAccountId");

COMMIT;
