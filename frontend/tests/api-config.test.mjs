import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiConfig } from '../src/lib/apiConfig.ts';

const productionApi = 'https://wilcareerp-production.up.railway.app';

test('production defaults to Wilcare while development retains the local API', () => {
  for (const value of [undefined, '', '  ']) {
    assert.deepEqual(resolveApiConfig(value, false), { baseUrl: productionApi, error: '' });
    assert.deepEqual(resolveApiConfig(value, true), { baseUrl: 'http://localhost:3000', error: '' });
  }
});

test('explicit deployment API configuration takes precedence and drops trailing slashes', () => {
  assert.deepEqual(resolveApiConfig(' https://custom-wilcare-api.example/api/// ', false), { baseUrl: 'https://custom-wilcare-api.example/api', error: '' });
  assert.deepEqual(resolveApiConfig('http://127.0.0.1:3300/', true), { baseUrl: 'http://127.0.0.1:3300', error: '' });
});

test('invalid production API URLs fall back to Wilcare with a visible configuration error', () => {
  for (const value of ['not-a-url', 'http://public.example', 'http://localhost:3000', 'https://localhost:3000', 'https://user:password@api.example', 'https://api.example?token=x', 'https://api.example/#fragment']) {
    const result = resolveApiConfig(value, false);
    assert.equal(result.baseUrl, productionApi, value);
    assert.match(result.error, /VITE_API_BASE_URL/, value);
    assert.ok(!result.baseUrl.includes('olten'));
  }
});
