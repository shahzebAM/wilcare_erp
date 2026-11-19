import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const file = readFileSync(new URL('../src/modules/phase3/FinancialReports.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function loadReports(dependencies = {}) {
  const exports = {};
  runInNewContext(compiled, {
    exports, URLSearchParams,
    require: name => dependencies[name] ?? (['./shared', './api', './accountHierarchy'].includes(name) ? {} : require(name)),
  });
  return exports;
}

test('financial report presentation preserves exact cents beyond Number precision', () => {
  const { ReportMoney } = loadReports();
  for (const [value, expected] of [['9999999999999999.99','₱9,999,999,999,999,999.99'],['0.01','₱0.01'],['-1000.01','-₱1,000.01']]) {
    assert.equal(renderToStaticMarkup(React.createElement(ReportMoney, {value})), `<span>${expected}</span>`);
  }
  for (const value of ['', 'NaN', '1.005', '1e3']) assert.equal(renderToStaticMarkup(React.createElement(ReportMoney,{value})), '<span>Unavailable</span>');
});

test('financial statements render and export account subtotals separately from direct balances', async () => {
  const rows = [
    { accountId: 'parent', code: '5000', name: 'Operations', depth: 0, amount: '0.01' },
    { accountId: 'child', code: '5100', name: 'Power', depth: 1, amount: '0.02', accountPath: 'Operations › Power' },
  ];
  const accountSubtotals = [{ ...rows[0], amount: '0.03' }];
  const report = {
    company: 'Wilcare', from: '2026-11-01', to: '2026-11-30', basis: 'Posted entries',
    rows, accountSubtotals, totals: { expenses: '0.03' },
  };
  const tables = [], sheets = [];
  let exported;
  let exportAction;
  const { default: FinancialReports } = loadReports({
    react: { useState: value => [value, () => {}] },
    xlsx: {
      utils: {
        book_new: () => ({}),
        json_to_sheet: values => values,
        book_append_sheet: (_book, values, name) => sheets.push({ name, values }),
      },
      writeFile: (_book, filename) => { exported = filename; },
    },
    './api': {
      today: () => '2026-11-30',
      usePhase3Data: (_api, _company, route) => ({ data: route.includes('financial-overview') ? null : report }),
      phase3Request: async () => report,
    },
    './shared': {
      Panel: ({ children, actions }) => { if (actions) exportAction = actions.props.onClick; return children; },
      Form: () => null,
      Field: ({ children }) => children,
      Notice: () => null,
      DataTable: props => { tables.push(props); return null; },
    },
  });
  const html = renderToStaticMarkup(FinancialReports({ api: 'http://test', company: 'Wilcare' }));
  assert.match(html, /Account balances/);
  assert.match(html, /Parent account subtotals/);
  assert.equal(tables[0].rows, rows);
  assert.equal(tables[1].rows, accountSubtotals);
  assert.match(renderToStaticMarkup(tables[0].renderCell(rows[1], 'name')), /padding-inline-start:16px.*Operations › Power/);
  exportAction();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(exported, 'profit-loss_2026-11-01_2026-11-30.xlsx');
  assert.deepEqual(sheets.slice(0, 2), [
    { name: 'Report', values: rows },
    { name: 'Parent account subtotals', values: accountSubtotals },
  ]);
});

test('memo form retains the same key for an unchanged failed submission and uses new keys for new intent', async () => {
  const source = readFileSync(new URL('../src/modules/phase3/FinanceWorkspace.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('FinanceWorkspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(p => p.name?.getText(ast)==='title' && p.initializer?.getText(ast)==='"Authorize credit or debit memo"')) callback=node.attributes.properties.find(p=>p.name?.getText(ast)==='onSubmit').initializer.expression;
    ts.forEachChild(node,visit);
  }
  visit(ast); assert.ok(callback);
  const state={current:null}, calls=[], result={ok:false}, compiled={};let keys=0;
  runInNewContext(ts.transpileModule(`exports.submit=${callback.getText(ast)}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:compiled,memoSubmission:state,crypto:{randomUUID:()=>`key-${++keys}`},formValue:(form,name)=>form[name],run:async(path,body)=>{calls.push({path,body});return result.ok}});
  const body={documentId:'invoice-1',kind:'CREDIT_MEMO',amount:'11.20',reason:'  Approved  '};
  await compiled.submit(body);await compiled.submit(body);
  assert.equal(calls[0].body.submissionKey,calls[1].body.submissionKey);assert.equal(calls[0].body.reason,'Approved');
  await compiled.submit({...body,amount:'12.00'});assert.notEqual(calls[1].body.submissionKey,calls[2].body.submissionKey);
  result.ok=true;await compiled.submit(body);const savedKey=calls.at(-1).body.submissionKey;
  await compiled.submit(body);assert.notEqual(calls.at(-1).body.submissionKey,savedKey);
});
