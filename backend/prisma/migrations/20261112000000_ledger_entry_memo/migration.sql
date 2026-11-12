-- Preserve posted journals and their existing entries; historical line memos remain NULL.
ALTER TABLE "LedgerEntry" ADD COLUMN "memo" TEXT;
