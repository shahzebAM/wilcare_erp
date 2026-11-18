import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);

function load(name, dependencies) {
  const source = readFileSync(new URL(`../src/modules/phase3/${name}`, import.meta.url), 'utf8');
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports,
    require: (module) => Object.hasOwn(dependencies, module) ? dependencies[module] : require(module),
  });
  return exports;
}

const base = {
  id: 'audit-1',
  createdAt: '2026-11-17T17:02:03.000Z',
  actor: 'finance-user',
  action: 'POST',
  entityType: 'AccountingJournal',
  entityId: 'journal-1',
  details: {
    number: 'JRN-01-11/18/2026',
    description: 'Supplies <Warehouse>',
    sourceType: 'MANUAL',
    total: '152.00',
    updatesManualPrice: false,
    allocations: [{ documentId: 'invoice-1', amount: '152.00' }],
  },
};
const older = {
  ...base,
  id: 'audit-old',
  action: 'LEGACY_SYNC',
  details: 'Imported from the previous workspace.',
};

function setup(pages) {
  let cursors = [];
  let refreshes = 0;
  const requests = [];
  const react = { useState: () => [cursors, (value) => { cursors = value; }] };
  const api = load('api.ts', { react, '../../lib/apiSession': {} });
  const shared = load('shared.tsx', { react: { useState: () => ['', () => {}] }, './api': api });
  const { default: AuditLog } = load('AuditLog.tsx', {
    react,
    './shared': shared,
    './api': {
      ...api,
      usePhase3Data(origin, company, path) {
        requests.push([origin, company, path]);
        return { ...pages[path], refresh: () => { refreshes += 1; } };
      },
    },
  });
  const tree = () => AuditLog({ api: 'http://test', company: 'Wilcare' });
  const button = (label) => {
    const search = (node) => {
      if (Array.isArray(node)) return node.map(search).find(Boolean);
      if (node?.type === 'button' && node.props.children === label) return node;
      return node?.props && (search(node.props.children) ?? search(node.props.actions));
    };
    return search(tree()).props;
  };
  return { render: () => renderToStaticMarkup(tree()), button, requests, refreshes: () => refreshes };
}

test('audit details, actions, and record types use English while preserving the stored values', () => {
  const before = structuredClone(base);
  const ui = setup({ '/audit?limit=50': { data: { records: [base], nextCursor: null } } });
  const html = ui.render();
  assert.match(html, /Date and time \(Manila\)/);
  assert.match(html, /Nov 18, 2026,.{0,5}1:02:03/);
  assert.match(html, /finance-user/);
  assert.match(html, /Posted/);
  assert.match(html, /Accounting journal/);
  assert.match(html, /Reference JRN-01-11\/18\/2026/);
  assert.match(html, /Description Supplies &lt;Warehouse&gt;/);
  assert.match(html, /Source type Manual · Total 152\.00 · Updates manual price No/);
  assert.match(html, /Allocations \(Document ID invoice-1 · Amount 152\.00\)/);
  assert.deepEqual(base, before);
});

test('audit pagination follows the existing cursor, visits older events, and returns to page 1', () => {
  const ui = setup({
    '/audit?limit=50': { data: { records: [base], nextCursor: 'older+cursor' } },
    '/audit?limit=50&cursor=older%2Bcursor': { data: { records: [older], nextCursor: null } },
  });
  assert.match(ui.render(), /Page 1/);
  assert.equal(ui.button('Previous page').disabled, true);
  ui.button('Next page').onClick();
  const history = ui.render();
  assert.match(history, /Page 2/);
  assert.match(history, /Legacy sync/);
  assert.match(history, /Imported from the previous workspace/);
  assert.doesNotMatch(history, /Supplies/);
  assert.deepEqual(ui.requests.at(-1), ['http://test', 'Wilcare', '/audit?limit=50&cursor=older%2Bcursor']);
  assert.equal(ui.button('Next page').disabled, true);
  ui.button('Previous page').onClick();
  assert.match(ui.render(), /Page 1/);
  assert.match(ui.render(), /Supplies/);
});

test('a failed audit page can be retried or left using previous page', () => {
  const first = { data: { records: [base], nextCursor: 'old' } };
  const second = { data: first.data, loading: true };
  const ui = setup({ '/audit?limit=50': first, '/audit?limit=50&cursor=old': second });
  ui.button('Next page').onClick();
  assert.match(ui.render(), /Loading saved records/);
  assert.equal(ui.button('Previous page').disabled, true);
  assert.equal(ui.button('Next page').disabled, true);
  assert.doesNotMatch(ui.render(), /Supplies/);
  second.loading = false;
  second.error = 'Could not load this page.';
  assert.match(ui.render(), /Could not load this page/);
  assert.equal(ui.button('Next page').disabled, true);
  ui.button('Refresh audit log').onClick();
  assert.equal(ui.refreshes(), 1);
  ui.button('Previous page').onClick();
  assert.match(ui.render(), /Page 1/);
});

test('empty workspaces and legacy audit arrays still render', () => {
  const empty = setup({ '/audit?limit=50': { data: { records: [], nextCursor: null } } });
  assert.match(empty.render(), /No records in this workspace/);
  const legacy = setup({ '/audit?limit=50': { data: [older] } });
  assert.match(legacy.render(), /Imported from the previous workspace/);
  assert.equal(legacy.button('Next page').disabled, true);
});
