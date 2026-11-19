import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = (name) => readFileSync(new URL(`../src/modules/phase3/${name}`, import.meta.url), 'utf8');

function load(name, dependencies = {}, globals = {}) {
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
    ...globals,
  });
  return exports;
}

const staticReact = { useState: (value) => [typeof value === 'function' ? value() : value, () => {}] };
const api = load('api.ts', { react: staticReact, '../../lib/apiSession': {} });
const shared = load('shared.tsx', { react: staticReact, './api': api });
const accountHierarchy = load('accountHierarchy.ts');
const reports = load('FinancialReports.tsx', { react: staticReact, './shared': shared, './api': api, './accountHierarchy': accountHierarchy });

const accounts = [
  { id: 'expense', code: '5000', name: 'Operating expenses', type: 'EXPENSE', active: true },
  { id: 'bank', code: '1000', name: 'Cash', type: 'ASSET', active: true },
  { id: 'capital', code: '3000', name: 'Equity', type: 'EQUITY', active: true },
];
const sampleLines = () => [
  { code: '5000', debit: '250.00', credit: '', memo: 'Snacks <and> tea' },
  { code: '5000', debit: '152.00', credit: '', memo: 'Delivery' },
  { code: '1000', debit: '', credit: '402.00', memo: 'Petty cash reimbursement' },
];

function workspace({ lines = sampleLines(), journals = [], chart = accounts, canWrite = true, canManageAccounts = false, busy = false, savedLayout, postResults = [] } = {}) {
  const values = [];
  const calls = [];
  const storage = { getItem: () => savedLayout, setItem: (key, value) => { savedLayout = value; storage.key = key; } };
  let cursor = 0;
  const react = {
    useRef(initial) {
      const slot = cursor++;
      return values[slot] ??= { current: initial };
    },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in values)) {
        const value = typeof initial === 'function' ? initial() : initial;
        const isJournalLines = Array.isArray(value) && value[0]?.code !== undefined && value[0]?.debit !== undefined;
        values[slot] = isJournalLines ? structuredClone(lines) : value;
      }
      return [values[slot], (next) => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }];
    },
  };
  const data = { accounts: chart, journals, mappings: [], reconciliations: [], trialBalance: [] };
  const component = load('BooksWorkspace.tsx', {
    react,
    './shared': shared,
    './FinancialReports': reports,
    './CashFlowWorkspace': {},
    './InventoryReconciliation': {},
    './AuditLog': {},
    './journalExport': {},
    './accountHierarchy': accountHierarchy,
    './api': {
      ...api,
      formValue: (form, key) => String(form[key] ?? '').trim(),
      usePhase3Data: () => ({
        data, loading: false, busy, refresh: () => {},
        run: async (...args) => {
          calls.push(args);
          const result = postResults.shift();
          if (result === false) return false;
          if (result) args[4]?.(result);
          return true;
        },
      }),
    },
  }, { crypto, localStorage: storage });
  const tree = () => {
    cursor = 0;
    return component.default({ api: 'http://test', company: 'Test', canWrite, canManageAccounts });
  };
  return { tree, html: () => renderToStaticMarkup(tree()), calls, storage };
}

function find(tree, predicate) {
  if (Array.isArray(tree)) {
    for (const child of tree) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}
const control = (ui, label) => {
  const element = find(ui.tree(), (node) => node.props?.['aria-label'] === label);
  assert.ok(element, `Missing control: ${label}`);
  return element;
};

test('chart groups subaccounts and keeps their individual code and ID in posting selections', () => {
  const parent = { ...accounts[0], deleteAction: 'BLOCKED' };
  const child = { id: 'power', code: '5030', name: 'Power', type: 'EXPENSE', active: true, parentAccountId: parent.id };
  const nested = { id: 'meter', code: '5015', name: 'Meter rental', type: 'EXPENSE', active: true, parentAccountId: child.id };
  const chart = [nested, child, accounts[1], parent];
  const ui = workspace({ chart, canManageAccounts: true });
  const table = find(ui.tree(), (node) => node.type === shared.DataTable && node.props.searchLabel === 'Search accounts');
  assert.deepEqual(Array.from(table.props.rows, ({ id }) => id), ['bank', 'expense', 'power', 'meter']);
  const nestedRow = table.props.rows[3];
  assert.equal(nestedRow.name, 'Operating expenses › Power › Meter rental');
  assert.match(renderToStaticMarkup(table.props.renderCell(nestedRow, 'name')), /padding-inline-start:32px/);
  const removeParent = find(table.props.actions(table.props.rows[1]), (node) => node.props?.['aria-label'] === 'Delete account 5000 Operating expenses');
  assert.equal(removeParent.props.disabled, true);
  const journalOption = find(control(ui, 'Account · line 1'), (node) => node.type === 'option' && node.props.value === '5015');
  assert.match(renderToStaticMarkup(journalOption), /Operating expenses › Power › Meter rental/);

  find(ui.tree(), (node) => node.type === 'button' && node.props.children === 'Account mappings').props.onClick();
  const mappingSelect = find(ui.tree(), (node) => node.type === 'select' && node.props.name === 'accountId');
  const mappingOption = find(mappingSelect, (node) => node.type === 'option' && node.props.value === 'meter');
  assert.match(renderToStaticMarkup(mappingOption), /5015 · Operating expenses › Power › Meter rental/);
});

test('journal totals keep exact cents, empty sides and one-cent differences', () => {
  const { journalTotals } = api;
  const total = journalTotals([
    { debit: '0.10', credit: '' },
    { debit: '0.20', credit: '0.30' },
  ]);
  assert.equal(total.debit, '0.30');
  assert.equal(total.credit, '0.30');
  assert.equal(total.difference, '0.00');
  assert.equal(total.balanced, true);
  const difference = journalTotals([{ debit: '0.29', credit: '0.30' }]);
  assert.equal(difference.difference, '-0.01');
  assert.equal(difference.balanced, false);
});

test('journal totals and table footer preserve money beyond Number precision', () => {
  const lines = [
    { code: '5000', debit: '9999999999999999.98', credit: '', memo: 'Large entry' },
    { code: '5000', debit: '0.01', credit: '', memo: 'One cent' },
    { code: '1000', debit: '', credit: '9999999999999999.99', memo: 'Cash' },
  ];
  const ui = workspace({ lines });
  const total = api.journalTotals(lines);
  assert.equal(total.debit, '9999999999999999.99');
  assert.equal(total.credit, '9999999999999999.99');
  assert.equal(total.difference, '0.00');
  assert.match(ui.html(), /₱9,999,999,999,999,999\.99/);
});

test('journal totals reject malformed, negative and over-precision amounts', () => {
  const { journalTotals } = api;
  for (const value of ['-0.01', '1.005', '1e3', 'NaN', 'Infinity', ' 1.00 ', '1,000.00']) {
    assert.equal(journalTotals([{ debit: value, credit: '' }]), null, value);
    assert.equal(journalTotals([{ debit: '', credit: value }]), null, value);
  }
});

test('manual journal uses a semantic entry table with independent accessible memo fields and totals', () => {
  const ui = workspace();
  const tree = ui.tree();
  const table = find(tree, (node) => node.type === 'table' && node.props['aria-label'] === 'Journal entries');
  assert.ok(table);
  assert.ok(find(table, (node) => node.type === 'thead'));
  assert.ok(find(table, (node) => node.type === 'tfoot'));
  for (const heading of ['Account', 'Debit (PHP)', 'Credit (PHP)', 'Memo']) {
    assert.ok(find(table, (node) => node.type === 'th' && node.props.children === heading), heading);
  }
  const html = ui.html();
  assert.match(html, /aria-label="Memo · line 1"/);
  assert.match(html, /aria-label="Memo · line 2"/);
  assert.equal(control(ui, 'Memo · line 1').props.maxLength, 2000);
  assert.equal(control(ui, 'Memo · line 2').props.maxLength, 2000);
  assert.match(html, /Snacks &lt;and&gt; tea/);
  assert.match(html, /₱402\.00/);
  assert.match(html, /Difference <span>₱0\.00/);
});

test('editing, adding and removing lines keeps each memo attached to its entry', () => {
  const ui = workspace();
  control(ui, 'Memo · line 2').props.onChange({ target: { value: 'Courier delivery' } });
  control(ui, 'Debit (PHP) · line 2').props.onChange({ target: { value: '152.01' } });
  assert.equal(control(ui, 'Memo · line 2').props.value, 'Courier delivery');
  assert.match(ui.html(), /Difference <span>₱0\.01/);
  const add = find(ui.tree(), (node) => node.type === 'button' && node.props.children === 'Add journal line');
  assert.ok(add);
  add.props.onClick();
  assert.equal(control(ui, 'Memo · line 4').props.value, '');
  control(ui, 'Memo · line 4').props.onChange({ target: { value: 'New account entry' } });
  control(ui, 'Remove line 1').props.onClick();
  assert.equal(control(ui, 'Memo · line 1').props.value, 'Courier delivery');
  assert.equal(control(ui, 'Debit (PHP) · line 1').props.value, '152.01');
  assert.equal(control(ui, 'Memo · line 2').props.value, 'Petty cash reimbursement');
  assert.equal(control(ui, 'Memo · line 3').props.value, 'New account entry');
});

test('one journal submission carries distinct line memos even when account codes repeat', async () => {
  const ui = workspace();
  const form = find(ui.tree(), (node) => node.type === shared.Form && node.props.title === 'Post manual journal');
  assert.ok(form);
  let resets = 0;
  await form.props.onSubmit({ date: '2026-11-12', memo: 'Office expenses', reset: () => resets++ });
  assert.equal(ui.calls.length, 1);
  const [path, body] = ui.calls[0];
  assert.equal(path, '/books/journals');
  assert.equal(body.memo, 'Office expenses');
  assert.match(body.submissionKey, /^[0-9a-f-]{36}$/);
  assert.equal(body.reference, undefined);
  assert.equal(resets, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(body.lines)), [
    { code: '5000', debit: '250.00', credit: '0', memo: 'Snacks <and> tea' },
    { code: '5000', debit: '152.00', credit: '0', memo: 'Delivery' },
    { code: '1000', debit: '0', credit: '402.00', memo: 'Petty cash reimbursement' },
  ]);
});

test('a failed post can be replayed and an older returned journal is immediately available', async () => {
  const posted = { id: 'backdated', number: 'JRN-01-01/02/2020', date: '2020-01-02', memo: 'Office expenses', entries: [] };
  const ui = workspace({ postResults: [false, posted] });
  const form = () => find(ui.tree(), (node) => node.type === shared.Form && node.props.title === 'Post manual journal');
  let resets = 0;
  const details = { date: '2020-01-02', memo: 'Office expenses', reset: () => resets++ };
  await form().props.onSubmit(details);
  assert.equal(resets, 0);
  assert.match(ui.html(), /Snacks &lt;and&gt; tea/);
  await form().props.onSubmit(details);
  assert.equal(resets, 1);
  assert.equal(ui.calls[0][1].submissionKey, ui.calls[1][1].submissionKey);
  assert.match(ui.html(), /JRN-01-01\/02\/2020 · Office expenses/);
  assert.match(ui.html(), /Download Excel/);
  assert.match(ui.html(), /Print journal/);
});

test('accounting sections move in either direction and survive reopening with a saved order', () => {
  const ui = workspace({ savedLayout: '["history", "history", "obsolete"]' });
  const sections = ['Chart of accounts', 'Balanced journal entries', 'General ledger · journal history', 'Trial balance'];
  const sectionOrder = () => {
    const html = ui.html();
    return [...sections].sort((a, b) => html.indexOf(`>${a}</h2>`) - html.indexOf(`>${b}</h2>`));
  };
  assert.deepEqual(sectionOrder(), [sections[2], sections[0], sections[1], sections[3]]);
  find(ui.tree(), (node) => node.type === 'button' && node.props.children === 'Edit layout').props.onClick();
  assert.equal(control(ui, `Move ${sections[2]} up`).props.disabled, true);
  control(ui, `Move ${sections[1]} up`).props.onClick();
  control(ui, `Move ${sections[2]} down`).props.onClick();
  assert.deepEqual(sectionOrder(), [sections[1], sections[2], sections[0], sections[3]]);
  assert.match(ui.storage.key, /books-layout:v1/);
  const reopened = workspace({ savedLayout: ui.storage.getItem() });
  assert.ok(reopened.html().indexOf(`>${sections[1]}</h2>`) < reopened.html().indexOf(`>${sections[2]}</h2>`));
  assert.match(ui.html(), /Snacks &lt;and&gt; tea/);
});

test('journal download and print preserve the reference, escaped text and exact totals', () => {
  const exports = [];
  const xlsx = { ...require('xlsx'), writeFile: (...args) => exports.push(args) };
  let html = '';
  let printed = false;
  const printWindow = {
    document: { open() {}, write: (markup) => { html = markup; }, close() {} },
    focus() {}, print: () => { printed = true; },
  };
  const output = load('journalExport.ts', { xlsx, './api': api }, { window: { open: () => printWindow } });
  const journal = {
    number: 'JRN-01-11/12/2026', date: '2026-11-12', memo: 'Office <expenses> & supplies',
    entries: [
      { account: '5000 Expense', debit: '9999999999999999.98', credit: '0', memo: '=1+1' },
      { account: '5000 Expense', debit: '0.01', credit: '0.00', memo: 'One cent' },
      { account: '1000 Cash', debit: '0', credit: '9999999999999999.99', memo: '<script>throw 1</script>' },
    ],
  };
  output.downloadJournal('Test', journal);
  const [{ Sheets }, filename] = exports[0];
  assert.equal(filename, 'JRN-01-11-12-2026.xlsx');
  assert.equal(Sheets.Journal.B2.v, journal.number);
  assert.equal(Sheets.Journal.D7.t, 's');
  assert.equal(Sheets.Journal.D7.v, '=1+1');
  assert.equal(Sheets.Journal.B10.v, '9999999999999999.99');
  assert.equal(Sheets.Journal.C10.v, '9999999999999999.99');
  output.printJournal('Test', journal);
  assert.equal(printed, true);
  assert.equal(printWindow.opener, null);
  assert.match(html, /Office &lt;expenses&gt; &amp; supplies/);
  assert.match(html, /<tfoot>.*9999999999999999\.99.*9999999999999999\.99/);
  assert.doesNotMatch(html, /<script>/);
  const blocked = load('journalExport.ts', { xlsx, './api': api }, { window: { open: () => null } });
  assert.throws(() => blocked.printJournal('Test', journal), /Allow pop-ups/);
});

test('saved journal and history show entry memo with legacy journal-description fallback', () => {
  const entries = [
    { id: 'entry-1', accountId: 'expense', account: accounts[0], debit: '250.00', credit: '0.00', memo: 'Snacks <and> tea' },
    { id: 'entry-2', accountId: 'bank', account: accounts[1], debit: '0.00', credit: '250.00', memo: null },
  ];
  const journals = [{ id: 'journal-1', number: 'JRN-TEST-1', date: '2026-11-12', memo: 'Legacy journal description', entries }];
  const before = structuredClone(journals);
  const ui = workspace({ journals });
  const tables = [];
  const visit = (tree) => {
    if (Array.isArray(tree)) return tree.forEach(visit);
    if (!tree || typeof tree !== 'object') return;
    if (tree.type === shared.DataTable) tables.push(tree);
    visit(tree.props?.children);
  };
  visit(ui.tree());
  const journal = tables.find((table) => table.props.columns.join(',') === 'account,debit,credit,memo');
  const history = tables.find((table) => table.props.searchLabel === 'Search journal entries');
  assert.ok(journal);
  assert.ok(history);
  for (const table of [journal, history]) {
    assert.equal(table.props.rows[0].memo, 'Snacks <and> tea');
    assert.equal(table.props.rows[1].memo, 'Legacy journal description');
  }
  assert.match(ui.html(), /Snacks &lt;and&gt; tea/);
  assert.deepEqual(journals, before);
});

test('read-only users see saved journal memos but no manual posting form', () => {
  const journals = [{
    id: 'journal-1', number: 'JRN-TEST-1', date: '2026-11-12', memo: 'Office expenses',
    entries: [{ id: 'entry-1', accountId: 'expense', account: accounts[0], debit: '250.00', credit: '0.00', memo: 'Snacks' }],
  }];
  const ui = workspace({ canWrite: false, journals });
  assert.equal(find(ui.tree(), (node) => node.type === shared.Form && node.props.title === 'Post manual journal'), null);
  assert.doesNotMatch(ui.html(), /aria-label="Journal entries"|Post balanced journal|Add journal line/);
  assert.match(ui.html(), /Snacks/);
  const twoRows = workspace({ lines: sampleLines().slice(0, 2) });
  assert.equal(control(twoRows, 'Remove line 1').props.disabled, true);
  assert.equal(control(twoRows, 'Remove line 2').props.disabled, true);
});
