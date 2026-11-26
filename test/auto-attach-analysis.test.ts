import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePlan,
  formatForLLM,
  isLikelyExplainPlan,
  jsonToText,
} from '../src/index';
import { bootstrapDocument, resolveAutoAttachScriptConfig } from '../src/auto-attach';
import {
  parseCssColor,
  relativeLuminance,
  resolveInitialTheme,
  resolveThemeFromBackgroundLayers,
} from '../src/ui/render';
import { BITMAP_SUBPLANS_SAMPLE } from './bitmap-subplans-fixture';

test('isLikelyExplainPlan accepts JSON/TEXT plans and rejects arbitrary SQL, JSON, and prose', () => {
  assert.equal(isLikelyExplainPlan('SELECT id, name FROM users WHERE active = true;'), false);
  assert.equal(isLikelyExplainPlan('EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users;'), false);
  assert.equal(isLikelyExplainPlan('{"name": "pgprism", "version": "0.1.0"}'), false);
  assert.equal(isLikelyExplainPlan('{"Plan": "enterprise", "Node Type": 42}'), false);
  assert.equal(isLikelyExplainPlan('Total time: 12.3 ms\nRows: 100\nPlanning: done'), false);
  assert.equal(isLikelyExplainPlan('Seq Scan on users'), false);

  assert.equal(
    isLikelyExplainPlan('Seq Scan on users  (cost=0.00..15.50 rows=550 width=32) (actual time=0.012..0.089 rows=550 loops=1)'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('QUERY PLAN\n----------\nResult  (cost=0.00..0.01 rows=1 width=4)\n(1 row)'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('Seq Scan on users\n  Filter: (id > 10)\n  Buffers: shared hit=4'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('[{"Plan": {"Node Type": "Result", "Startup Cost": 0, "Total Cost": 0.01, "Plan Rows": 1, "Plan Width": 4}}]'),
    true
  );
});

test('analyzePlan aggregates byRelation, byNodeType, CPU* vs I/O split, buffer hit %, and SubPlan targets', () => {
  const samplePlan = BITMAP_SUBPLANS_SAMPLE;
  const analysis = analyzePlan(samplePlan);

  assert.ok(analysis.diagnostics.length > 0);
  assert.ok(analysis.bufferHitPercent !== null && analysis.bufferHitPercent > 90);
  assert.ok(analysis.byRelation.some((r) => r.name.includes('product_names')));
  assert.ok(analysis.byNodeType.some((t) => t.nodeType === 'Bitmap Heap Scan'));
  assert.ok(analysis.parsed.subplanTargets['SubPlan 2']);
  assert.ok(analysis.parsed.subplanTargets['SubPlan 3']);

  // I/O timing CPU* split check
  const ioPlan = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Parallel Aware': false,
        'Relation Name': 'items',
        Alias: 'items',
        'Startup Cost': 0,
        'Total Cost': 100,
        'Plan Rows': 1000,
        'Plan Width': 8,
        'Actual Startup Time': 0.1,
        'Actual Total Time': 80,
        'Actual Rows': 1000,
        'Actual Loops': 1,
        'Shared Hit Blocks': 800,
        'Shared Read Blocks': 200,
        'Shared I/O Read Time': 50,
      },
      'Execution Time': 82,
    },
  ];
  const ioAnalysis = analyzePlan(ioPlan);
  assert.equal(ioAnalysis.exclusiveIoMs, 50);
  assert.equal(ioAnalysis.exclusiveCpuMs, 32);
  assert.equal(Math.round(ioAnalysis.bufferHitPercent!), 80);
  assert.equal(typeof jsonToText(ioPlan), 'string');

  const md = formatForLLM(samplePlan);
  assert.match(md, /# PostgreSQL execution plan summary/);
  assert.match(md, /## Findings/);
  assert.match(md, /## Top relations \/ indexes/);
  assert.match(md, /```text/);

  const nodeMd = formatForLLM(analysis.parsed, { nodeId: analysis.parsed.plan.id });
  assert.match(nodeMd, /### Node:/);
  assert.match(nodeMd, /- Path:/);
});

interface FakeEl {
  tagName: string;
  children: FakeEl[];
  parentNode: FakeEl | null;
  parentElement: FakeEl | null;
  attributes: Map<string, string>;
  style: Record<string, string>;
  className: string;
  hidden: boolean;
  textContent: string;
  plan?: unknown;
  getAttribute(k: string): string | null;
  setAttribute(k: string, v: string): void;
  hasAttribute(k: string): boolean;
  removeAttribute(k: string): void;
  closest(sel: string): FakeEl | null;
  querySelector(sel: string): FakeEl | null;
  insertBefore(node: FakeEl, ref: FakeEl | null): FakeEl;
  appendChild(node: FakeEl): FakeEl;
  append(...nodes: FakeEl[]): void;
  remove(): void;
  addEventListener(): void;
  classList: { contains(c: string): boolean };
}

function makeFakeEl(tagName: string, attrs: Record<string, string> = {}, textContent = '', bgColor = 'rgba(0, 0, 0, 0)'): FakeEl {
  const attributes = new Map(Object.entries(attrs));
  const el: FakeEl = {
    tagName: tagName.toUpperCase(),
    children: [],
    parentNode: null,
    parentElement: null,
    attributes,
    style: bgColor ? { backgroundColor: bgColor } : {},
    className: attrs['class'] ?? '',
    hidden: false,
    textContent,
    getAttribute(k: string) {
      return this.attributes.get(k) ?? null;
    },
    setAttribute(k: string, v: string) {
      this.attributes.set(k, v);
      if (k === 'class') this.className = v;
    },
    hasAttribute(k: string) {
      return this.attributes.has(k);
    },
    removeAttribute(k: string) {
      this.attributes.delete(k);
    },
    closest(sel: string): FakeEl | null {
      let cur: FakeEl | null = this;
      while (cur) {
        if (sel === 'pg-plan' && cur.tagName === 'PG-PLAN') return cur;
        if (sel === '[data-theme]' && cur.hasAttribute('data-theme')) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector(sel: string): FakeEl | null {
      for (const ch of this.children) {
        if (sel === 'code' && ch.tagName === 'CODE') return ch;
        const sub = ch.querySelector(sel);
        if (sub) return sub;
      }
      return null;
    },
    insertBefore(node: FakeEl, ref: FakeEl | null) {
      node.remove();
      node.parentNode = this;
      node.parentElement = this;
      if (!ref) {
        this.children.push(node);
        return node;
      }
      const idx = this.children.indexOf(ref);
      if (idx >= 0) this.children.splice(idx, 0, node);
      else this.children.push(node);
      return node;
    },
    appendChild(node: FakeEl) {
      return this.insertBefore(node, null);
    },
    append(...nodes: FakeEl[]) {
      for (const n of nodes) this.appendChild(n);
    },
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
      }
      this.parentNode = null;
      this.parentElement = null;
    },
    addEventListener() {},
    classList: {
      contains(cls: string) {
        return el.className.split(/\s+/).includes(cls);
      },
    },
  };
  return el;
}

test('bootstrapDocument & data-auto-attach work when document.currentScript is null (async / module)', () => {
  const html = makeFakeEl('html');
  const body = makeFakeEl('body');
  const scriptEl = makeFakeEl('script', {
    src: 'https://cdn.jsdelivr.net/npm/pgprism@0.1.0-beta.1/dist/pgprism.iife.js',
    async: '',
    'data-auto-attach': '',
    'data-mode': 'below',
    'data-theme': 'light',
    'data-view': 'tree',
  });
  const planPre = makeFakeEl(
    'pre',
    {},
    'Seq Scan on users  (cost=0.00..15.50 rows=550 width=32) (actual time=0.012..0.089 rows=550 loops=1)\n  Buffers: shared hit=8'
  );
  const sqlPre = makeFakeEl('pre', {}, 'SELECT id, email FROM users WHERE active = true;');
  html.appendChild(body);
  body.append(scriptEl, planPre, sqlPre);

  const mockDoc = {
    currentScript: null,
    documentElement: html,
    body,
    createElement(tag: string) {
      return makeFakeEl(tag);
    },
    querySelector(sel: string) {
      if (sel === 'script[data-auto-attach]') {
        return scriptEl.hasAttribute('data-auto-attach') ? scriptEl : null;
      }
      return null;
    },
    querySelectorAll(sel: string) {
      const pres = [planPre, sqlPre];
      if (sel === 'pre[data-pgprism]') return pres.filter((p) => p.hasAttribute('data-pgprism'));
      if (sel.includes('pre')) return pres;
      return [];
    },
  } as unknown as Document;

  const prevDoc = (globalThis as { document?: Document }).document;
  (globalThis as { document?: Document }).document = mockDoc;
  try {
    const cfg = resolveAutoAttachScriptConfig(mockDoc);
    assert.deepEqual(cfg, { mode: 'below', theme: 'light', view: 'tree' });

    const res = bootstrapDocument(mockDoc);
    assert.ok(res);
    assert.equal(res.attached, 1);
    assert.equal(planPre.getAttribute('data-pgprism-attached'), '1');
    assert.equal(sqlPre.getAttribute('data-pgprism-attached'), null);

    const mountedWrap = res.elements[0] as unknown as FakeEl;
    assert.equal(mountedWrap.className, 'pgp-attach-below');
    const pgPlan = mountedWrap.children[0]!;
    assert.equal(pgPlan.tagName, 'PG-PLAN');
    assert.equal(pgPlan.getAttribute('theme'), 'light');
    assert.equal(pgPlan.getAttribute('view'), 'tree');

    res.destroy();
    assert.equal(planPre.getAttribute('data-pgprism-attached'), null);
  } finally {
    if (prevDoc === undefined) delete (globalThis as { document?: Document }).document;
    else (globalThis as { document?: Document }).document = prevDoc;
  }

  // Plain synchronous <script> without data-auto-attach returns null even if querySelector could see something
  const plainScript = makeFakeEl('script', { src: 'pgprism.iife.js' });
  const syncNoAttrDoc = {
    currentScript: plainScript,
    querySelector: () => scriptEl,
  } as unknown as Document;
  assert.equal(resolveAutoAttachScriptConfig(syncNoAttrDoc), null);
});

test('auto theme detection reads computed background luminance, prefers-color-scheme, and respects overrides', () => {
  assert.deepEqual(parseCssColor('rgba(0, 0, 0, 0)'), null);
  assert.deepEqual(parseCssColor('transparent'), null);
  assert.deepEqual(parseCssColor('rgb(255 255 255 / 0.9)'), { r: 255, g: 255, b: 255, a: 0.9 });
  assert.ok(relativeLuminance(255, 255, 255) > 0.99);
  assert.ok(relativeLuminance(11, 14, 20) < 0.01);

  // Light page without data-theme renders light even if OS prefers dark
  assert.equal(resolveThemeFromBackgroundLayers(['rgba(0, 0, 0, 0)', 'rgb(248, 250, 252)'], false), 'light');
  // Faint black tint card over white body stays light via Porter-Duff compositing
  assert.equal(resolveThemeFromBackgroundLayers(['rgba(0, 0, 0, 0.05)', 'rgb(255, 255, 255)'], false), 'light');
  // Dark page without data-theme stays dark even if OS prefers light
  assert.equal(resolveThemeFromBackgroundLayers(['rgba(0, 0, 0, 0)', 'rgb(15, 23, 42)'], true), 'dark');
  // Transparent everywhere follows prefers-color-scheme: light
  assert.equal(resolveThemeFromBackgroundLayers(['rgba(0, 0, 0, 0)', 'transparent'], true), 'light');
  assert.equal(resolveThemeFromBackgroundLayers(['rgba(0, 0, 0, 0)', 'transparent'], false), 'dark');

  // Full resolveInitialTheme integration with DOM + computed style + explicit data-theme / .dark / .light overrides
  const html = makeFakeEl('html', {}, '', 'rgba(0, 0, 0, 0)');
  const body = makeFakeEl('body', {}, '', 'rgb(255, 255, 255)');
  const container = makeFakeEl('pg-plan', {}, '', 'rgba(0, 0, 0, 0)');
  html.appendChild(body);
  body.appendChild(container);

  const prevDoc = (globalThis as { document?: Document }).document;
  const prevWin = (globalThis as { window?: Window }).window;
  (globalThis as { document?: Document }).document = { documentElement: html, body } as unknown as Document;
  (globalThis as { window?: Window }).window = {
    getComputedStyle(el: FakeEl) {
      return { backgroundColor: el.style['backgroundColor'] || 'rgba(0, 0, 0, 0)' };
    },
    matchMedia() {
      return { matches: false };
    },
  } as unknown as Window;

  try {
    // Light body, no data-theme, OS prefers dark -> light!
    assert.equal(resolveInitialTheme(container as unknown as HTMLElement, 'auto'), 'light');

    // Explicit <html data-theme="dark"> overrides light body
    html.setAttribute('data-theme', 'dark');
    assert.equal(resolveInitialTheme(container as unknown as HTMLElement, 'auto'), 'dark');
    html.removeAttribute('data-theme');

    // Explicit .dark class on body overrides light background
    body.setAttribute('class', 'dark');
    assert.equal(resolveInitialTheme(container as unknown as HTMLElement, 'auto'), 'dark');
    body.setAttribute('class', '');

    // Explicit pref="dark" always wins
    assert.equal(resolveInitialTheme(container as unknown as HTMLElement, 'dark'), 'dark');
  } finally {
    if (prevDoc === undefined) delete (globalThis as { document?: Document }).document;
    else (globalThis as { document?: Document }).document = prevDoc;
    if (prevWin === undefined) delete (globalThis as { window?: Window }).window;
    else (globalThis as { window?: Window }).window = prevWin;
  }
});
