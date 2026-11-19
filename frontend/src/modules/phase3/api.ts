import { useCallback, useEffect, useRef, useState } from 'react';
import { expireApiSession, getApiAuthHeaders } from '../../lib/apiSession';

export type JsonRow = Record<string, unknown>;
export type Party = { id: string; name: string };
export type Product = {
  id: number;
  name: string;
  sku: string;
  landedCostReference?: string | number | null;
};
export type FinanceDocument = {
  id: string;
  number: string;
  kind: string;
  direction: string;
  partyId: string;
  status: string;
  dueDate: string;
  total: string;
  outstanding?: string;
  relatedDocumentId?: string;
  data?: JsonRow;
};
export type Balances = {
  documents: FinanceDocument[];
  aging: unknown;
  totalOutstanding: string;
};
export const input =
  'phase3-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
export const primary =
  'phase3-primary rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
export const secondary =
  'phase3-secondary rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const money = (value: unknown, precision = 2) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: precision,
  }).format(Number(value) || 0);
export function journalTotals(lines: { debit: string; credit: string }[]) {
  const cents = (value: string) => {
    if (!value) return 0n;
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    const debitCents = cents(line.debit);
    const creditCents = cents(line.credit);
    if (debitCents === null || creditCents === null) return null;
    debit += debitCents;
    credit += creditCents;
  }
  const format = (value: bigint) => {
    const magnitude = value < 0n ? -value : value;
    return `${value < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
  };
  return {
    debit: format(debit),
    credit: format(credit),
    difference: format(debit - credit),
    balanced: debit === credit,
  };
}
export const date = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
      })
    : '—';
export const asRows = (value: unknown): JsonRow[] =>
  Array.isArray(value)
    ? value.filter((row): row is JsonRow => !!row && typeof row === 'object')
    : [];
export const asObject = (value: unknown): JsonRow =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRow)
    : {};
export const textValue = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
export const formValue = (form: HTMLFormElement, key: string) =>
  String(new FormData(form).get(key) || '').trim();

export async function phase3Request<T>(
  api: string,
  company: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const authHeaders = getApiAuthHeaders();
  const response = await fetch(`${api}/phase3${path}`, {
    method,
    headers: {
      ...authHeaders,
      'x-company': company,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal || AbortSignal.timeout(120000),
  });
  if (
    response.status === 401 &&
    getApiAuthHeaders().Authorization === authHeaders.Authorization
  )
    expireApiSession();
  const result = await response.json().catch(() => null);
  if (response.status === 404 && typeof result?.message === 'string' && /^Cannot (GET|POST|PATCH|DELETE) /.test(result.message)) {
    throw new Error('This feature is unavailable on the connected backend version. Deploy the matching backend and database updates, then refresh.');
  }
  if (!response.ok)
    throw new Error(
      Array.isArray(result?.message)
        ? result.message.join(', ')
        : result?.message || `Request failed (${response.status}).`,
    );
  return result as T;
}

export function usePhase3Data<T>(
  api: string,
  company: string,
  path: string,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(false);
  const writing = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const value = await phase3Request<T>(
          api,
          company,
          path,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) setData(value);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load records.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [api, company, path, revision, enabled]);
  const run = async <Result = unknown>(
    endpoint: string,
    body: unknown,
    message: string,
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
    onSuccess?: (result: Result) => void,
  ): Promise<boolean> => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await phase3Request<Result>(api, company, endpoint, body, undefined, method);
      if (alive.current) {
        onSuccess?.(result);
        setNotice(message);
        refresh();
      }
      return true;
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : 'Could not save records.',
        );
      return false;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { data, error, notice, loading, busy, refresh, run };
}
