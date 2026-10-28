import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

describe('backend environment isolation', () => {
  const temporaryRoot = realpathSync(tmpdir());
  let directory: string;
  let backend: string;
  let foreignBackend: string;
  let compiledLoader: string;

  beforeEach(() => {
    directory = mkdtempSync(join(temporaryRoot, 'wilcare-env-'));
    backend = join(directory, 'wilcare', 'backend');
    foreignBackend = join(directory, 'olten', 'backend');
    mkdirSync(foreignBackend, { recursive: true });
    writeFileSync(
      join(foreignBackend, '.env'),
      'WILCARE_ENV_TEST_SOURCE=olten\n',
    );
    compiledLoader = transpileModule(
      readFileSync(join(__dirname, 'environment.ts'), 'utf8'),
      {
        compilerOptions: {
          module: ModuleKind.CommonJS,
          target: ScriptTarget.ES2023,
        },
      },
    ).outputText;
  });

  afterEach(() => {
    if (!resolve(directory).startsWith(resolve(temporaryRoot) + sep)) {
      throw new Error('Test cleanup must stay inside its temporary directory.');
    }
    rmSync(directory, { recursive: true, force: true });
  });

  function runLoader(folder: string) {
    const entry = join(backend, folder, 'environment.js');
    mkdirSync(join(backend, folder), { recursive: true });
    writeFileSync(entry, compiledLoader);
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_PATH: resolve(__dirname, '..', 'node_modules'),
      WILCARE_ENV_TEST_ENTRY: entry,
      WILCARE_ENV_TEST_PLATFORM: 'host-value',
    };
    delete environment.WILCARE_ENV_TEST_SOURCE;
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `
      require(process.env.WILCARE_ENV_TEST_ENTRY);
      process.stdout.write(JSON.stringify({
        source: process.env.WILCARE_ENV_TEST_SOURCE ?? null,
        platform: process.env.WILCARE_ENV_TEST_PLATFORM,
      }));
    `,
      ],
      {
        cwd: foreignBackend,
        env: environment,
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    return JSON.parse(child.stdout) as Record<string, string | null>;
  }

  test.each(['src', 'dist'])(
    'loads its own file from %s when launched in Olten',
    (folder) => {
      mkdirSync(backend, { recursive: true });
      writeFileSync(
        join(backend, '.env'),
        'WILCARE_ENV_TEST_SOURCE=wilcare\nWILCARE_ENV_TEST_PLATFORM=file-value\n',
      );
      expect(runLoader(folder)).toEqual({
        source: 'wilcare',
        platform: 'host-value',
      });
    },
  );

  it('preserves hosted variables without falling back to a different project file', () => {
    expect(runLoader('dist')).toEqual({ source: null, platform: 'host-value' });
  });
});
