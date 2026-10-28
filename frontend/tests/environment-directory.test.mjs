import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

test('frontend root and environment directory remain Wilcare when launched elsewhere', async () => {
  const frontendDirectory = dirname(fileURLToPath(new URL('../vite.config.ts', import.meta.url)));
  const configFile = join(frontendDirectory, 'vite.config.ts');
  const temporaryRoot = realpathSync(tmpdir());
  const foreignDirectory = mkdtempSync(join(temporaryRoot, 'wilcare-env-directory-'));
  const originalDirectory = process.cwd();

  try {
    writeFileSync(join(foreignDirectory, '.env'), 'VITE_TEST_FOREIGN_ENV=foreign-only\n');
    process.chdir(foreignDirectory);
    for (const mode of ['development', 'production']) {
      const loaded = await loadConfigFromFile({ command: 'serve', mode }, configFile, undefined, 'silent');
      assert.ok(loaded);
      assert.equal(resolve(loaded.config.root), frontendDirectory);
      assert.equal(resolve(loaded.config.envDir), frontendDirectory);
      assert.notEqual(resolve(loaded.config.envDir), foreignDirectory);
    }
  } finally {
    process.chdir(originalDirectory);
    assert.ok(resolve(foreignDirectory).startsWith(resolve(temporaryRoot) + sep));
    rmSync(foreignDirectory, { recursive: true, force: true });
  }
});
