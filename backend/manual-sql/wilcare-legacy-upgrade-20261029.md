# Wilcare legacy database upgrade

`wilcare-legacy-upgrade-20261029.sql` upgrades the verified 24-table Wilcare
database to the schema used by backend commit `515f563`. It is a one-time,
transactional script, outside Prisma's historical migration chain. It does not
run automatically on application startup or a GitHub push. Do not replay it
against an upgraded database or use it as another database's baseline.

The upgrade adds 47 tables, 22 columns, 96 indexes, 68 foreign keys, 26 check
constraints, three functions and eight triggers. It retains the legacy
`Attendance.holidayPercentage` column and its values. The employee company
default becomes Wilcare for future inserts. Existing records are not updated,
deleted or recalculated; historical migration ledger entries are not fabricated.

Before application, a full PostgreSQL backup was restored to a separate local
PostgreSQL instance. All 24 original tables and 339 records retained identical
counts and original-column checksums after the clone upgrade. Existing isolated
accounting, financial-reporting, posting-mapping and inventory-reconciliation
integration scripts passed 47 checks with no findings. The only remaining Prisma
diff was the deliberately preserved legacy holiday-percentage column.

The same SQL was applied to Wilcare on 29 October 2026 in one transaction with
bounded lock/statement timeouts. Original tables were locked against concurrent
writes while their before/after counts and checksums were compared. All 339
records were unchanged before commit. The resulting inventory was 71 tables,
26 checks, three functions and eight enabled user triggers. Local environment
files were preserved.

Backups and detailed verification receipts are stored outside the repository.
This schema update is separate from deploying the matching backend to Railway;
the deployment must retain Wilcare's own database and service environment.
