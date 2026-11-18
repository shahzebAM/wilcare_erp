import * as XLSX from "xlsx";
import { date, journalTotals } from "./api";

type JournalDocument = {
  number: string;
  date: string;
  memo: string;
  entries: { account: string; debit: string; credit: string; memo: string }[];
};

const headers = ["Account", "Debit (PHP)", "Credit (PHP)", "Memo"];

function journalDocumentRows(journal: JournalDocument) {
  return journal.entries.map(({ account, debit, credit, memo }) => {
    const amounts = journalTotals([{ debit, credit }]);
    return [account, amounts?.debit ?? debit, amounts?.credit ?? credit, memo];
  });
}

function totalRow(journal: JournalDocument) {
  const totals = journalTotals(journal.entries);
  return ["Total", totals?.debit ?? "", totals?.credit ?? "", ""];
}

export function downloadJournal(company: string, journal: JournalDocument) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Company", company],
    ["Journal reference", journal.number],
    ["Journal date", date(journal.date)],
    ["Journal description", journal.memo],
    [],
    headers,
    ...journalDocumentRows(journal),
    totalRow(journal),
  ]);
  sheet["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Journal");
  XLSX.writeFile(workbook, `${journal.number.replace(/[^\w.-]/g, "-")}.xlsx`);
}

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function printJournal(company: string, journal: JournalDocument) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to print the journal and try again.");
  printWindow.opener = null;
  const row = (cells: string[], tag: "th" | "td") =>
    `<tr>${cells.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
  const document = printWindow.document;
  document.open();
  document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>${escapeHtml(journal.number)}</title>
    <style>
      @page { margin: 16mm; }
      body { font: 11pt system-ui, sans-serif; color: #172033; }
      h1 { margin: 0 0 0.5em; font-size: 18pt; }
      p { margin: 0.4em 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; margin-top: 1.5em; }
      th, td { border-bottom: 1px solid #9ca3af; text-align: left; padding: 0.5em; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
      th:nth-child(2), th:nth-child(3), td:nth-child(2), td:nth-child(3) { text-align: right; white-space: nowrap; }
      thead { display: table-header-group; }
      tfoot { display: table-row-group; font-weight: bold; }
      tr { break-inside: avoid; }
    </style></head><body>
    <h1>Journal entry</h1><p>${escapeHtml(company)}</p>
    <p><strong>Reference</strong> ${escapeHtml(journal.number)}</p>
    <p><strong>Date</strong> ${escapeHtml(date(journal.date))}</p>
    <p><strong>Description</strong> ${escapeHtml(journal.memo)}</p>
    <table><thead>${row(headers, "th")}</thead>
    <tbody>${journalDocumentRows(journal).map((cells) => row(cells, "td")).join("")}</tbody>
    <tfoot>${row(totalRow(journal), "td")}</tfoot></table></body></html>`);
  document.close();
  printWindow.focus();
  printWindow.print();
}
