import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/documentExpiryReview.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { reminderDatePreview } = exports;

test('shows the calendar date for a reminder set in days', () => {
  assert.equal(reminderDatePreview('2027-01-08', '14', 'days'), '2026-12-25');
  assert.equal(reminderDatePreview('2027-01-08', '0', 'days'), '2027-01-08');
});

test('clamps month-based reminders to the last day of shorter months', () => {
  assert.equal(reminderDatePreview('2027-03-31', '1', 'months'), '2027-02-28');
  assert.equal(reminderDatePreview('2028-03-31', '1', 'months'), '2028-02-29');
  assert.equal(reminderDatePreview('2027-01-31', '2', 'months'), '2026-11-30');
});

test('omits the preview for invalid expiry dates and lead times', () => {
  assert.equal(reminderDatePreview('2027-02-29', '1', 'days'), null);
  assert.equal(reminderDatePreview('', '1', 'days'), null);
  for (const value of ['', '1.5', '-1', '36501']) {
    assert.equal(reminderDatePreview('2027-03-31', value, 'days'), null);
  }
  assert.equal(reminderDatePreview('2027-03-31', '1201', 'months'), null);
});
