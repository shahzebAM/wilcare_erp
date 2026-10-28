import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { BUILT_IN_COMPANY, isBuiltInCompany, isLegacyCompany, visibleCompanies } from '../src/lib/companies.ts';

test('Wilcare is the only built-in workspace, including an empty server snapshot', () => {
  assert.equal(BUILT_IN_COMPANY, 'Wilcare');
  assert.deepEqual(visibleCompanies([]), ['Wilcare']);
  assert.deepEqual(visibleCompanies(['Wilcare', 'WILCARE', ' wilcare ']), ['Wilcare']);
});

test('legacy defaults are hidden case insensitively while custom workspaces remain available', () => {
  assert.deepEqual(visibleCompanies(['Olten', 'SURGICOM', ' ordent ', 'Company A', 'Company B']), ['Wilcare', 'Company A', 'Company B']);
  for (const name of ['Olten', 'OLTEN', ' surgicom ', 'ORDENT']) assert.equal(isLegacyCompany(name), true);
  for (const name of ['Wilcare', 'Company A', 'Olten East']) assert.equal(isLegacyCompany(name), false);
});

test('company snapshots preserve custom names without duplicates or malformed entries', () => {
  const source = [' Company A ', 'company a', null, {}, 42, '', ' ', 'Company B'];
  assert.deepEqual(visibleCompanies(source), ['Wilcare', 'Company A', 'Company B']);
  assert.equal(source[0], ' Company A ', 'normalization must not mutate the server snapshot');
  for (const name of ['Wilcare', 'WILCARE', ' wilcare ']) assert.equal(isBuiltInCompany(name), true);
  assert.equal(isBuiltInCompany('Company A'), false);
});

test('the application rejects built-in workspace deletion before sending a backend request', async () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleRemoveCompany') handler = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  const exports = {};
  let requests = 0;
  runInNewContext(ts.transpileModule(`exports.handler = ${handler.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, isBuiltInCompany, fetch: () => { requests++; },
  });
  await assert.rejects(exports.handler('WILCARE'), /built-in Wilcare workspace cannot be deleted/);
  assert.equal(requests, 0);
});
