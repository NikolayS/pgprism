import { build } from 'esbuild';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tmpDir = '.tmp-tests';
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const testFiles = readdirSync('test')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join('test', f));

await build({
  entryPoints: testFiles,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  outdir: tmpDir,
  outExtension: { '.js': '.mjs' },
});

const built = readdirSync(tmpDir)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => join(tmpDir, f));

const res = spawnSync(process.execPath, ['--test', ...built], {
  stdio: 'inherit',
});

rmSync(tmpDir, { recursive: true, force: true });
process.exit(res.status ?? 1);
