import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';

const require = createRequire(import.meta.url);
const source = (name) => readFileSync(new URL(`../src/modules/phase3/${name}`, import.meta.url), 'utf8');

// Compile the real TSX with the installed compiler, as the existing backend UI
// regression suite does. Inject hook state without a browser or extra packages.
function load(name, dependencies) {
  const exports = {};
  const code = ts.transpileModule(source(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports,
    require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    Intl,
    Date,
    URL,
    AbortSignal,
    console,
  });
  return exports;
}

function presentation({ query = '', executive } = {}) {
  const react = { useState: (value) => [typeof value === 'function' ? value() : value, () => {}] };
  const api = load('api.ts', {
    react,
    '../../lib/apiSession': {},
  });
  const shared = load('shared.tsx', {
    react: { useState: () => [query, () => {}] },
    './api': api,
  });
  const insights = load('InsightsWorkspace.tsx', {
    react,
    './shared': shared,
    './FinancialReports': load('FinancialReports.tsx', { react, './shared': shared, './api': api, './accountHierarchy': load('accountHierarchy.ts', {}) }),
    './api': { ...api, usePhase3Data: () => ({ data: executive, loading: false, refresh: () => {} }) },
    '../../lib/phase3Access': {},
  });
  return { ...shared, ...insights };
}

const invoices = [
  { id: 'one', number: 'INV-0001', party: 'Northstar Hospital', total: '1234.560000', hidden: 'private-source' },
  { id: 'two', number: 'INV-0002', party: 'West Clinic', total: '89.01' },
];

test('table search finds loaded invoice values without changing monetary strings or source rows', () => {
  const { DataTable } = presentation({ query: '  NORTHSTAR  ' });
  const before = structuredClone(invoices);
  const html = renderToStaticMarkup(DataTable({ rows: invoices, columns: ['number', 'party', 'total'], searchLabel: 'Search invoices' }));
  assert.match(html, /INV-0001/);
  assert.match(html, /1234\.560000/);
  assert.doesNotMatch(html, /INV-0002/);
  assert.match(html, /1 of 2 records/);
  assert.deepEqual(invoices, before);
});

test('table search only searches displayed columns and reports no matches honestly', () => {
  const { DataTable } = presentation({ query: 'private-source' });
  const html = renderToStaticMarkup(DataTable({ rows: invoices, columns: ['number', 'party'], searchLabel: 'Search invoices' }));
  assert.match(html, /No matching records/);
  assert.match(html, /0 of 2 records/);
  assert.doesNotMatch(html, /INV-0001/);
});

test('unsearchable tables keep every supplied row and empty tables display an empty state', () => {
  const { DataTable } = presentation({ query: 'unrelated' });
  const full = renderToStaticMarkup(DataTable({ rows: invoices, columns: ['number'] }));
  assert.match(full, /INV-0001/);
  assert.match(full, /INV-0002/);
  assert.doesNotMatch(full, /type="search"/);
  const empty = renderToStaticMarkup(DataTable({ rows: [], columns: ['number'] }));
  assert.match(empty, /No records in this workspace/);
});

test('restricted executive forecast renders its empty state while keeping authorized backend amounts', () => {
  const executive = {
    summary: [{ id: 'receivables', title: 'Net receivables', value: '1234.56', unit: 'PHP' }],
    alerts: [], forecast: null, reports: [], generatedAt: '2026-10-25T00:00:00.000Z',
  };
  const { ExecutiveWorkspace } = presentation({ executive });
  const html = renderToStaticMarkup(ExecutiveWorkspace({ api: 'http://test', company: 'Test' }));
  assert.match(html, /1,234\.56/);
  assert.match(html, /Demand planning is not available for your current reporting access/);
  assert.doesNotMatch(html, /projected units/);
});

test('demand chart shows server projection values and leaves the source report intact', () => {
  const executive = {
    summary: [], alerts: [], reports: [],
    forecast: { method: 'Trailing 90 days', status: 'READY', rows: [{ sku: 'DEMO-1', productName: 'Demo product', projectedQuantity: '37.25', deliveredQuantity: 112, averageDaily: '1.24' }] },
  };
  const before = structuredClone(executive);
  const { ExecutiveWorkspace } = presentation({ executive });
  const html = renderToStaticMarkup(ExecutiveWorkspace({ api: 'http://test', company: 'Test' }));
  assert.match(html, /37\.25 projected units/);
  assert.match(html, /Planning estimate|planning estimate/);
  assert.deepEqual(executive, before);
});

function productPostingForm(canWrite) {
  const path = '/books/products/17/posting-accounts';
  const requests = [];
  const writes = [];
  let selection;
  const react = { useState: (initial) => [selection ?? initial, (value) => { selection = value; }] };
  const api = load('api.ts', { react, '../../lib/apiSession': {} });
  const shared = load('shared.tsx', { react, './api': api });
  const settings = {
    accounts: [
      { id: 'revenue', type: 'REVENUE', code: '4001', name: 'Custom sales income', active: true },
      { id: 'expense', type: 'EXPENSE', code: '5101', name: 'Custom cost of goods sold', active: true },
      { id: 'asset', type: 'ASSET', code: '1301', name: 'Custom inventory', active: true },
      { id: 'archived', type: 'ASSET', code: '1302', name: 'Legacy inventory', active: false },
      { id: 'cash', type: 'ASSET', code: '1000', name: 'Protected cash', active: true, eligible: false },
    ],
    selections: { salesAccountId: null, cogsAccountId: null, inventoryAccountId: 'archived' },
  };
  const { ProductPostingAccounts } = load('ProfilePanels.tsx', {
    react,
    './shared': shared,
    './api': {
      ...api,
      usePhase3Data(...args) {
        requests.push(args);
        return {
          data: settings,
          run: async (...args) => { writes.push(args); return true; },
        };
      },
    },
  });
  const slots = () => ProductPostingAccounts({ api: 'http://test', company: 'Wilcare', productId: 17, canWrite, children: (fields) => fields });
  const tree = () => createElement(Fragment, null, ...Object.values(slots()));
  const select = (field) => slots()[field].props.children;
  const submit = () => {
    const button = slots().save;
    if (button && !button.props.disabled) button.props.onClick();
  };
  return { tree, slots, select, submit, writes, requests, path };
}

test('product posting accounts offer company defaults and only the matching active account types', () => {
  const ui = productPostingForm(true);
  const revenue = ui.select('salesAccount');
  const expense = ui.select('cogsAccount');
  const asset = ui.select('inventoryAccount');
  assert.deepEqual(ui.requests.at(-1), ['http://test', 'Wilcare', ui.path]);
  assert.match(renderToStaticMarkup(revenue), /Use company default/);
  assert.match(renderToStaticMarkup(revenue), /4001 · Custom sales income/);
  assert.doesNotMatch(renderToStaticMarkup(revenue), /Custom cost of goods sold|Custom inventory/);
  assert.match(renderToStaticMarkup(expense), /5101 · Custom cost of goods sold/);
  assert.match(renderToStaticMarkup(asset), /disabled="" selected="">1302 · Legacy inventory \(archived\)/);
  assert.doesNotMatch(renderToStaticMarkup(asset), /Protected cash/);
  revenue.props.onChange({ target: { value: 'revenue' } });
  ui.submit();
  assert.equal(ui.writes.length, 0);
  ui.select('inventoryAccount').props.onChange({ target: { value: '' } });
  assert.equal(ui.slots().save.props.type, 'button');
  ui.submit();
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.writes[0][0], ui.path);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.writes[0][1])), {
    salesAccountId: 'revenue', cogsAccountId: null, inventoryAccountId: null,
  });
});

test('read-only Books access displays the product accounts without a save action', () => {
  const ui = productPostingForm(false);
  const html = renderToStaticMarkup(ui.tree());
  assert.match(html, /Sales income account/);
  assert.equal(ui.select('salesAccount').props.disabled, true);
  assert.doesNotMatch(html, /Save posting accounts/);
  ui.submit();
  assert.equal(ui.writes.length, 0);
});
