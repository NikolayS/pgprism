# pgscope

Tiny, zero-dependency TypeScript library and `<pg-plan>` Web Component for Postgres `explain` plans (Postgres 15 through 19).

It parses both `explain (format json)` and text `explain` plans, converts buffers in 8 KiB blocks to IEC binary units (`KiB`, `MiB`, `GiB`), translates JSON plans back to `psql`-compatible text via `jsonToText`, and links automated diagnostics directly to plan nodes.

## Drop into any HTML page

Include the minified IIFE or UMD bundle and mount a `<pg-plan>` element:

```html
<pg-plan id="plan"></pg-plan>
<script src="dist/pgscope.iife.js"></script>
<script>document.getElementById('plan').plan = planJsonOrText;</script>
```

You can also call `renderPlan` from ESM or a plain script tag:

```ts
import { renderPlan, jsonToText } from 'pgscope';

renderPlan(document.getElementById('app')!, planInput, {
  theme: 'dark',
  view: 'table',
});

const textPlan = jsonToText(planJson);
```

`<pg-plan>` uses Shadow DOM (`adoptedStyleSheets` when available) and CSSOM properties instead of inline `style` attributes. For strict CSP headers (`style-src 'self'`), load `dist/pgscope.css` and pass `{ injectStyles: false, useShadow: false }`.

## Views and diagnostics

Every view shares the same parsed plan tree and selected node state:

- **Table view**: Scannable hierarchy with exclusive time, inclusive time, percentage bars starting at zero, actual versus estimated rows, loop counts, self buffers in `KiB`/`MiB`, and heat shading on hot nodes.
- **Tree view**: Collapsible node tree with orthogonal connectors, switchable metric bars (`exclusiveTime`, `inclusiveTime`, `buffers`, `ioTime`, `rows`, `cost`), and hot-path dimming.
- **Flame view**: Horizontal linear waterfall bars showing child subtree span versus self-time.
- **Text and JSON views**: Syntax-highlighted plan text (verbatim when given text, or converted via `jsonToText` when given JSON) and formatted JSON with one-click copy.
- **Diagnostics strip**: Flags row misestimates (`>= 10x`), filter discards (`>= 80%`), temporary disk spills, lossy bitmap pages, heap fetches on index-only scans, parallel worker shortfalls, `Memoize` cache misses, disabled nodes, and high JIT overhead. Click any finding to jump to that node and open the inspector.

## Supported Postgres 15–19 features

- **Execution and cost model**: Exclusive versus inclusive timing, parallel `Gather` / `Gather Merge` wall-clock adjustment, lazy `CTE` `InitPlan` handling, `(never executed)` nodes, `TIMING OFF`, and `COSTS OFF`.
- **Buffers and I/O timings**: `Shared`, `Local`, and `Temp` block counters in 8 KiB IEC binary units alongside raw block counts, plus both legacy `I/O Read/Write Time` and Postgres 17+ split `Shared` / `Local` / `Temp` I/O timings.
- **Postgres 17**: `Planning` `Memory` (`used` / `allocated`), `Serialization` (`time`, `output`, `format`, buffers), `Right Semi Join`, `WindowAgg` `Run Condition`, `Incremental Sort` group stats, `HashAggregate` partition/batch spills, and `Memoize` cache stats.
- **Postgres 18**: Fractional `Actual Rows`, `Disabled: true`, `Index Searches`, tuplestore `Storage` / `Maximum Storage`, `WAL Buffers Full`, `Window` definitions, and parallel worker stats.
- **Postgres 19**: `Replaces` on `Result` nodes, `WAL FPI Bytes`, `Memoize` planner estimates (`Estimated Capacity`, `Distinct Lookup Keys`, `Lookups`, `Hit Percent`), `explain (io)` prefetch and I/O metrics, `Incremental Sort` `Estimated Groups`, and `ModifyTable` `on conflict` stats.
- **64-bit Query Identifier preservation**: Extracts raw signed 64-bit `Query Identifier` values from JSON strings before `JSON.parse` so 19-digit negative identifiers keep exact precision.

## Build and test

```sh
npm install
npm run check
```

`npm run check` runs TypeScript type checking (`tsc --noEmit`), builds ESM, CJS, IIFE, UMD, `.d.ts`, and minified CSS bundles into `dist/`, and executes the Node test suite (`test/`). Open `demo/index.html` over any local static server or `file://` to explore Postgres 15–19 plans or paste your own plan.

## License

MIT
