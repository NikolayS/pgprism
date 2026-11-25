import { build, transformSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('dist', { recursive: true });

// Minify embedded CSS cleanly at bundle time
const stylesSrc = readFileSync('src/styles.ts', 'utf8');
const rawCssMatch = /export const PGSCOPE_CSS = `([\s\S]*)`;/.exec(stylesSrc);
const minCss = rawCssMatch
  ? transformSync(rawCssMatch[1], { loader: 'css', minify: true }).code.trim()
  : '';

const minCssPlugin = {
  name: 'minify-pgscope-css',
  setup(b) {
    b.onLoad({ filter: /src\/styles\.ts$/ }, () => ({
      contents: `export const PGSCOPE_CSS = ${JSON.stringify(minCss)};`,
      loader: 'ts',
    }));
  },
};

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  target: ['es2020'],
  sourcemap: false,
  legalComments: 'none',
  plugins: [minCssPlugin],
};

await build({ ...shared, format: 'esm', outfile: 'dist/pgscope.js' });
await build({ ...shared, format: 'cjs', outfile: 'dist/pgscope.cjs' });
await build({ ...shared, format: 'iife', globalName: 'pgscope', outfile: 'dist/pgscope.iife.js' });

const cjsRaw = await build({ ...shared, format: 'cjs', write: false });
const cjsCode = cjsRaw.outputFiles[0].text;
const umdCode = `(function(r,f){if(typeof define==="function"&&define.amd){define([],f)}else if(typeof module==="object"&&module.exports){module.exports=f()}else{r.pgscope=f()}})(typeof globalThis!=="undefined"?globalThis:this,function(){var exports={};var module={exports:exports};${cjsCode};return module.exports});\n`;
writeFileSync('dist/pgscope.umd.js', umdCode, 'utf8');
writeFileSync('dist/pgscope.css', minCss + '\n', 'utf8');

execFileSync('npx', ['tsc', '--emitDeclarationOnly'], { stdio: 'inherit' });

const artifacts = [
  'dist/pgscope.js',
  'dist/pgscope.iife.js',
  'dist/pgscope.umd.js',
  'dist/pgscope.cjs',
  'dist/pgscope.css',
];
console.log('\nBundle sizes:');
for (const file of artifacts) {
  const buf = readFileSync(file);
  const gz = gzipSync(buf, { level: 9 });
  console.log(
    `  ${file.padEnd(22)} ${String(buf.length).padStart(7)} B raw  |  ${(gz.length / 1024).toFixed(2)} KiB (${gz.length} B) gzip`
  );
}
