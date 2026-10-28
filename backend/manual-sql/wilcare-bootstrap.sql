-- MANUAL ONLY: this file is outside Prisma migrations and is not run by the app.
-- Review and explicitly execute only against the separate Wilcare database.
-- Requires PostgreSQL 13+ and the existing Company/Employee tables from the ERP schema.
-- This does not provision the remaining schema required by the replicated backend.
-- Historical Prisma migrations have an incomplete baseline and conflicting Phase 1
-- table definitions; do not blindly run migrate deploy or db push to bridge that gap.
-- Existing companies, employees, permissions and operational records are preserved.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

INSERT INTO "Company" ("id", "name", "createdAt")
VALUES (gen_random_uuid()::text, 'Wilcare', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Employee" ALTER COLUMN "company" SET DEFAULT 'Wilcare';

COMMIT;
