import { build, transformSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('dist', { recursive: true });

// Minify embedded CSS cleanly at bundle time
const stylesSrc = readFileSync('src/styles.ts', 'utf8');
const rawCssMatch = /export const PGPRISM_CSS = `([\s\S]*)`;/.exec(stylesSrc);
const minCss = rawCssMatch
  ? transformSync(rawCssMatch[1], { loader: 'css', minify: true }).code.trim()
  : '';

const minCssPlugin = {
  name: 'minify-pgprism-css',
  setup(b) {
    b.onLoad({ filter: /src\/styles\.ts$/ }, () => ({
      contents: `export const PGPRISM_CSS = ${JSON.stringify(minCss)};`,
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

await build({ ...shared, format: 'esm', outfile: 'dist/pgprism.js' });
await build({ ...shared, format: 'cjs', outfile: 'dist/pgprism.cjs' });
await build({
  ...shared,
  format: 'iife',
  globalName: 'pgprism',
  footer: { js: 'if(typeof globalThis!=="undefined")globalThis.PGPrism=pgprism;' },
  outfile: 'dist/pgprism.iife.js',
});

// Standalone subpath bundle for jsonToText (no DOM / CSS)
await build({ ...shared, entryPoints: ['src/json-to-text.ts'], plugins: [], format: 'esm', outfile: 'dist/json-to-text.js' });
await build({ ...shared, entryPoints: ['src/json-to-text.ts'], plugins: [], format: 'cjs', outfile: 'dist/json-to-text.cjs' });

const cjsRaw = await build({ ...shared, format: 'cjs', write: false });
const cjsCode = cjsRaw.outputFiles[0].text;
const umdCode = `(function(r,f){if(typeof define==="function"&&define.amd){define([],f)}else if(typeof module==="object"&&module.exports){module.exports=f()}else{r.pgprism=r.PGPrism=f()}})(typeof globalThis!=="undefined"?globalThis:this,function(){var exports={};var module={exports:exports};${cjsCode};return module.exports});\n`;
writeFileSync('dist/pgprism.umd.js', umdCode, 'utf8');
writeFileSync('dist/pgprism.css', minCss + '\n', 'utf8');

// Inline IIFE bundle into demo/index.html so it runs self-contained anywhere (file://, Slack, GitHub Pages)
const demoPath = 'demo/index.html';
const demoSrc = readFileSync(demoPath, 'utf8');
const iifeRaw = readFileSync('dist/pgprism.iife.js', 'utf8').replace(/<\/script>/gi, '<\\/script>');
const startMarker = '<!-- pgprism:inline-bundle:start -->';
const endMarker = '<!-- pgprism:inline-bundle:end -->';
const sIdx = demoSrc.indexOf(startMarker);
const eIdx = demoSrc.indexOf(endMarker);
if (sIdx >= 0 && eIdx > sIdx) {
  const nextDemo =
    demoSrc.slice(0, sIdx + startMarker.length) +
    `\n<script>${iifeRaw}</script>\n` +
    demoSrc.slice(eIdx);
  writeFileSync(demoPath, nextDemo, 'utf8');
}

execFileSync('npx', ['tsc', '--emitDeclarationOnly'], { stdio: 'inherit' });

const artifacts = [
  'dist/pgprism.js',
  'dist/pgprism.iife.js',
  'dist/pgprism.umd.js',
  'dist/pgprism.cjs',
  'dist/json-to-text.js',
  'dist/pgprism.css',
];
console.log('\nBundle sizes:');
for (const file of artifacts) {
  const buf = readFileSync(file);
  const gz = gzipSync(buf, { level: 9 });
  console.log(
    `  ${file.padEnd(22)} ${String(buf.length).padStart(7)} B raw  |  ${(gz.length / 1024).toFixed(2)} KiB (${gz.length} B) gzip`
  );
}
