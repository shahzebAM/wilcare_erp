import { useState } from "react";
import { secondary, usePhase3Data } from "./api";
import { DataTable, Notice, Panel } from "./shared";

type AuditRecord = {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
};

type AuditPage = {
  records?: AuditRecord[];
  items?: AuditRecord[];
  rows?: AuditRecord[];
  nextCursor?: string | null;
};

const activity = new Map([
  ["APPROVE", "Approved"],
  ["ARCHIVE", "Archived"],
  ["CALCULATE", "Calculated"],
  ["CLASSIFY_CASH_FLOW", "Classified cash flow"],
  ["COMPLETE", "Completed"],
  ["CREATE", "Created"],
  ["DELETE", "Deleted"],
  ["DESIGNATE_CASH_ACCOUNT", "Updated cash account designation"],
  ["DRAFT", "Created draft"],
  ["FINALIZE", "Finalized"],
  ["INITIALIZE", "Initialized"],
  ["MATCH", "Matched"],
  ["OCR_REVIEW", "Requested OCR review"],
  ["POST", "Posted"],
  ["POST_MEMO", "Posted memo"],
  ["QUERY", "Ran query"],
  ["RECORD_PAYMENT", "Recorded payment"],
  ["REGISTER", "Registered"],
  ["REJECT", "Rejected"],
  ["RESTORE", "Restored"],
  ["SCHEDULE", "Scheduled"],
  ["SUBMIT", "Submitted"],
  ["UPDATE", "Updated"],
]);

const acronyms = new Set(["AI", "AP", "AR", "ERP", "ID", "OCR", "SKU", "VAT"]);
const statusFields = new Set([
  "allocationMethod", "direction", "from", "kind", "sourceType", "status", "type",
]);
const eventTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "medium",
});

function englishLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (acronyms.has(upper)) return upper;
      return index === 0
        ? upper.slice(0, 1) + word.slice(1).toLowerCase()
        : word.toLowerCase();
    })
    .join(" ");
}

function detailValue(value: unknown, nested = false): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => detailValue(item, true)).join(", ") || "—";
  if (typeof value === "object") {
    const details = Object.entries(value)
      .map(([key, field]) => {
        const label = key === "number" ? "Reference" : englishLabel(key);
        const text =
          statusFields.has(key) && typeof field === "string" && /^[A-Z][A-Z0-9_]*$/.test(field)
            ? englishLabel(field)
            : detailValue(field, true);
        return `${label} ${text}`;
      })
      .join(" · ");
    if (!details) return "—";
    return nested ? `(${details})` : details;
  }
  return String(value);
}

function formatEventTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : eventTime.format(timestamp);
}

export default function AuditLog({ api, company }: { api: string; company: string }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const path = `/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const { data, loading, error, refresh } = usePhase3Data<AuditPage | AuditRecord[]>(api, company, path);
  const records = Array.isArray(data) ? data : data?.records ?? data?.items ?? data?.rows;
  const nextCursor = Array.isArray(data) ? null : data?.nextCursor;

  return (
    <Panel
      title="Immutable ERP audit log"
      actions={
        <button type="button" className={secondary} disabled={loading} onClick={refresh}>
          Refresh audit log
        </button>
      }
    >
      <Notice error={error} loading={loading} />
      {records && !loading && !error && (
        <DataTable
          rows={records.map((record) => ({
            id: record.id,
            "Date and time (Manila)": formatEventTime(record.createdAt),
            Actor: record.actor,
            Action: activity.get(record.action) ?? englishLabel(record.action),
            Record: englishLabel(record.entityType),
            "Record ID": record.entityId,
            Details: detailValue(record.details),
          }))}
          columns={["Date and time (Manila)", "Actor", "Action", "Record", "Record ID", "Details"]}
        />
      )}
      <nav aria-label="Audit log pages" className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondary}
          disabled={loading || !cursors.length}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          Previous page
        </button>
        <span role="status" className="text-sm text-slate-600">Page {cursors.length + 1}</span>
        <button
          type="button"
          className={secondary}
          disabled={loading || !!error || !nextCursor}
          onClick={() => {
            if (nextCursor) setCursors([...cursors, nextCursor]);
          }}
        >
          Next page
        </button>
      </nav>
    </Panel>
  );
}
