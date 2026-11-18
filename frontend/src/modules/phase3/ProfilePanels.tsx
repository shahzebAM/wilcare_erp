import { useState } from 'react';
import { DataTable, Field, Notice } from './shared';
import { asObject, asRows, date, input, money, primary, secondary, usePhase3Data } from './api';
import type { Balances, JsonRow } from './api';

const postingFields = [
  { name: 'salesAccountId', label: 'Sales income account', type: 'REVENUE' },
  { name: 'cogsAccountId', label: 'Cost of goods sold account', type: 'EXPENSE' },
  { name: 'inventoryAccountId', label: 'Inventory asset account', type: 'ASSET' },
] as const;

type PostingSelections = Record<(typeof postingFields)[number]['name'], string | null>;
type PostingAccount = { id: string; code: string; name: string; type: string; active: boolean; eligible?: boolean };
type PostingSettings = {
  accounts: PostingAccount[];
  selections: PostingSelections;
};

const canPostToAccount = (account: PostingAccount, type: string) =>
  account.type === type && account.active && account.eligible !== false;

function PostingAccountsForm({ settings, canWrite, disabled, onSave }: {
  settings: PostingSettings;
  canWrite: boolean;
  disabled: boolean;
  onSave: (selections: PostingSelections) => Promise<boolean>;
}) {
  const [selections, setSelections] = useState(settings.selections);
  const changed = postingFields.some(({ name }) => selections[name] !== settings.selections[name]);
  const hasUnavailableSelection = postingFields.some(({ name, type }) =>
    selections[name] !== null && !settings.accounts.some(
      (account) => account.id === selections[name] && canPostToAccount(account, type),
    ),
  );

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (canWrite && !disabled && changed && !hasUnavailableSelection) void onSave(selections);
    }}>
      <fieldset disabled={!canWrite || disabled} className="grid gap-4 sm:grid-cols-3">
        {postingFields.map(({ name, label, type }) => {
          const selected = selections[name];
          const options = settings.accounts.filter((account) => account.id === selected || canPostToAccount(account, type));
          return (
            <Field key={name} label={label}>
              <select
                className={input}
                value={selected ?? ''}
                onChange={(event) => setSelections({ ...selections, [name]: event.target.value || null })}
              >
                <option value="">Use company default</option>
                {selected !== null && !options.some(({ id }) => id === selected) && (
                  <option value={selected} disabled>Saved account unavailable</option>
                )}
                {options.map((account) => {
                  const available = canPostToAccount(account, type);
                  const status = account.active ? 'unavailable' : 'archived';
                  return (
                    <option key={account.id} value={account.id} disabled={!available}>
                      {account.code} · {account.name}{available ? '' : ` (${status})`}
                    </option>
                  );
                })}
              </select>
            </Field>
          );
        })}
      </fieldset>
      {canWrite && (
        <>
          {hasUnavailableSelection && (
            <p className="mt-3 text-sm text-amber-800">Replace unavailable accounts or select the company default before saving.</p>
          )}
          <button type="submit" className={`${primary} mt-4`} disabled={disabled || !changed || hasUnavailableSelection}>
            Save posting accounts
          </button>
        </>
      )}
    </form>
  );
}

export function ProductPostingAccounts({ api, company, productId, canWrite }: {
  api: string;
  company: string;
  productId: number;
  canWrite: boolean;
}) {
  const path = `/books/products/${productId}/posting-accounts`;
  const state = usePhase3Data<PostingSettings>(api, company, path);
  return (
    <section className="space-y-3 border-t border-slate-200 bg-white p-8">
      <h3 className="text-base font-bold text-slate-900">Posting accounts</h3>
      <p className="text-sm text-slate-600">These accounts apply to future sales invoices for this item. Adjustments use the original invoice’s accounts. The company default follows the posting setup in Books.</p>
      <Notice error={state.error} loading={state.loading} notice={state.notice} />
      {state.data && (
        <PostingAccountsForm
          key={JSON.stringify(state.data.selections)}
          settings={state.data}
          canWrite={canWrite}
          disabled={state.busy || state.loading}
          onSave={(selections) => state.run(path, selections, 'Posting accounts saved.')}
        />
      )}
      {!state.data && state.error && (
        <button type="button" className={secondary} disabled={state.loading} onClick={state.refresh}>Retry loading accounts</button>
      )}
    </section>
  );
}

export function CustomerFinanceBalance({
  api,
  company,
  customerId,
}: {
  api: string;
  company: string;
  customerId: string;
}) {
  const state = usePhase3Data<Balances>(
    api,
    company,
    `/balances?direction=AR&partyId=${encodeURIComponent(customerId)}`,
  );
  return (
    <section className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-cyan-950">Finance receivables</h4>
        <button
          className={secondary}
          disabled={state.loading}
          onClick={state.refresh}
        >
          Refresh
        </button>
      </div>
      <Notice error={state.error} loading={state.loading} />
      {state.data && (
        <>
          <p className="my-3 text-xl font-bold text-cyan-900">
            {money(state.data.totalOutstanding)} outstanding
          </p>
          <p className="mb-3 text-xs text-slate-500">
            From posted Phase 3 invoices, memos and payment allocations.
            Separate from the legacy customer balance.
          </p>
          <DataTable
            rows={state.data.documents.map((document) => ({
              ...document,
              due: date(document.dueDate),
              outstanding: money(document.outstanding),
            }))}
            columns={['number', 'due', 'outstanding']}
          />
        </>
      )}
    </section>
  );
}

export function ProductCostHistory({
  api,
  company,
  product,
  onClose,
}: {
  api: string;
  company: string;
  product: {
    id: number;
    sku: string;
    name: string;
    purchasePrice: number | string;
    landedCostReference?: number | string | null;
  };
  onClose: () => void;
}) {
  const state = usePhase3Data<unknown>(
    api,
    company,
    `/products/${product.id}/cost-history`,
  );
  const result = asObject(state.data);
  const history = Array.isArray(state.data)
    ? asRows(state.data)
    : asRows(result.history || result.records);
  const savedProduct = asObject(result.product);
  const reference =
    savedProduct.landedCostReference ??
    result.landedCostReference ??
    product.landedCostReference;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-history-title"
    >
      <section className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="cost-history-title" className="text-xl font-bold">
              Approved landed cost history
            </h3>
            <p className="text-sm text-slate-500">
              {product.sku} · {product.name}
            </p>
          </div>
          <button autoFocus className={secondary} onClick={onClose}>
            Close
          </button>
        </div>
        <Notice error={state.error} loading={state.loading} />
        <div className="my-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-emerald-50 p-4">
            <p className="text-xs text-slate-600">Manual cost price</p>
            <strong>{money(product.purchasePrice)}</strong>
          </div>
          <div className="rounded-lg bg-cyan-50 p-4">
            <p className="text-xs text-slate-600">
              Latest Finance-approved landed unit cost
            </p>
            <strong>
              {reference === null || reference === undefined
                ? 'Not approved yet'
                : money(reference, 6)}
            </strong>
          </div>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Finance approval records a separate base-cost reference and audit
          history. Manual cost price and customer tier overrides remain
          independent.
        </p>
        <DataTable
          rows={history.map((record: JsonRow) => ({
            ...record,
            approved: date(record.createdAt),
            shipment:
              asObject(record.shipment).shipmentNumber || record.shipmentId,
            landedCost:
              asObject(record.landedCost).number || record.landedCostId,
            unitCost: money(record.unitCost, 6),
          }))}
          columns={[
            'approved',
            'shipment',
            'landedCost',
            'quantity',
            'unitCost',
            'approvedBy',
          ]}
        />
      </section>
    </div>
  );
}
