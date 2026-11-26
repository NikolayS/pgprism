import { diagnosePlan } from '../diagnostics';
import { formatForLLM } from '../format-llm';
import { parsePlan } from '../parser';
import { PGPRISM_CSS } from '../styles';
import type {
  MetricMode,
  ParsedExplain,
  PlanNode,
  PlanState,
  RenderOptions,
  ThemeMode,
  ViewMode,
} from '../types';
import {
  formatBlocks,
  formatCompactCount,
  formatKbAsIec,
  formatMs,
  sumBufferBlocks,
} from '../units';
import { clearNode, h, makeCopyButton } from './dom';
import { renderInspector } from './inspector';
import { renderBreakdownPanel } from './view-breakdown';
import { renderDiagnosticsStrip } from './view-diagnostics';
import { renderFlameView } from './view-flame';
import { renderTableView } from './view-table';
import { renderCodeView } from './view-text';
import { renderTreeView } from './view-tree';

export interface PlanHandle {
  update: (nextPlan: string | unknown, nextOptions?: RenderOptions) => void;
  selectNode: (nodeId: string | null) => void;
  setView: (view: ViewMode) => void;
  setMetric: (metric: MetricMode | 'auto') => void;
  setTheme: (theme: 'dark' | 'light') => void;
  getState: () => PlanState;
  destroy: () => void;
  readonly parsed: ParsedExplain;
}

const SHEET_CACHE = new WeakMap<Document | ShadowRoot, boolean>();
let sharedSheet: CSSStyleSheet | null = null;

function mountStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (SHEET_CACHE.has(target)) return;
  SHEET_CACHE.set(target, true);

  if (
    typeof CSSStyleSheet !== 'undefined' &&
    'replaceSync' in CSSStyleSheet.prototype &&
    'adoptedStyleSheets' in target
  ) {
    try {
      if (!sharedSheet) {
        sharedSheet = new CSSStyleSheet();
        sharedSheet.replaceSync(PGPRISM_CSS);
      }
      const existing = target.adoptedStyleSheets ?? [];
      if (!existing.includes(sharedSheet)) {
        target.adoptedStyleSheets = [...existing, sharedSheet];
      }
      return;
    } catch {
      // Fallback to <style> below if adoptedStyleSheets is restricted
    }
  }

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-pgprism', '1');
  if (nonce) styleEl.setAttribute('nonce', nonce);
  styleEl.textContent = PGPRISM_CSS;
  if (target instanceof Document) {
    target.head.appendChild(styleEl);
  } else {
    target.appendChild(styleEl);
  }
}

export function parseCssColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const s = color.trim().toLowerCase();
  if (!s || s === 'transparent') return null;

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0]! + h[0]!, 16);
      const g = parseInt(h[1]! + h[1]!, 16);
      const b = parseInt(h[2]! + h[2]!, 16);
      const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1;
      return a <= 0.01 ? null : { r, g, b, a };
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return a <= 0.01 ? null : { r, g, b, a };
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (!fn) return null;
  const body = fn[1]!.trim();

  const parseChan = (tok: string): number | null => {
    if (tok.endsWith('%')) {
      const n = Number.parseFloat(tok.slice(0, -1));
      return Number.isFinite(n) ? (n / 100) * 255 : null;
    }
    const n = Number.parseFloat(tok);
    return Number.isFinite(n) ? n : null;
  };
  const parseAlpha = (tok: string | undefined): number | null => {
    if (tok === undefined) return 1;
    if (tok.endsWith('%')) {
      const n = Number.parseFloat(tok.slice(0, -1));
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null;
    }
    const n = Number.parseFloat(tok);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
  };

  let rgbParts: string[];
  let alphaPart: string | undefined;
  if (body.includes(',')) {
    const parts = body.split(',').map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) return null;
    rgbParts = parts.slice(0, 3);
    alphaPart = parts[3];
  } else {
    const [rgbSide, slashAlpha] = body.split('/').map((p) => p.trim());
    const parts = (rgbSide ?? '').split(/\s+/).filter(Boolean);
    if (parts.length !== 3) return null;
    rgbParts = parts;
    alphaPart = slashAlpha;
  }

  const r = parseChan(rgbParts[0]!);
  const g = parseChan(rgbParts[1]!);
  const b = parseChan(rgbParts[2]!);
  const a = parseAlpha(alphaPart);
  if (r === null || g === null || b === null || a === null || a <= 0.01) return null;
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a,
  };
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number): number => {
    const s = Math.max(0, Math.min(255, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function resolveThemeFromBackgroundLayers(layers: string[], prefersLight: boolean): 'dark' | 'light' {
  const stack: Array<{ r: number; g: number; b: number; a: number }> = [];
  let hitOpaque = false;
  for (const bg of layers) {
    const parsed = parseCssColor(bg);
    if (!parsed) continue;
    stack.push(parsed);
    if (parsed.a >= 0.99) {
      hitOpaque = true;
      break;
    }
  }

  if (stack.length === 0) {
    return prefersLight ? 'light' : 'dark';
  }

  let r = prefersLight ? 255 : 11;
  let g = prefersLight ? 255 : 14;
  let b = prefersLight ? 255 : 20;
  let start = stack.length - 1;
  if (hitOpaque) {
    const base = stack[start]!;
    r = base.r;
    g = base.g;
    b = base.b;
    start--;
  }
  for (let i = start; i >= 0; i--) {
    const top = stack[i]!;
    r = top.r * top.a + r * (1 - top.a);
    g = top.g * top.a + g * (1 - top.a);
    b = top.b * top.a + b * (1 - top.a);
  }
  return relativeLuminance(r, g, b) > 0.5 ? 'light' : 'dark';
}

function classThemeOf(el: Element | null | undefined): 'dark' | 'light' | null {
  if (!el?.classList) return null;
  if (el.classList.contains('dark')) return 'dark';
  if (el.classList.contains('light')) return 'light';
  return null;
}

export function resolveInitialTheme(container: HTMLElement, pref?: ThemeMode): 'dark' | 'light' {
  if (pref === 'dark' || pref === 'light') return pref;

  const closestTheme = container.closest?.('[data-theme]')?.getAttribute('data-theme');
  if (closestTheme === 'light' || closestTheme === 'dark') return closestTheme;
  if (typeof document !== 'undefined') {
    const bodyTheme = document.body?.getAttribute('data-theme');
    if (bodyTheme === 'light' || bodyTheme === 'dark') return bodyTheme;
    const docTheme = document.documentElement?.getAttribute('data-theme');
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
  }

  // Check explicit .dark / .light class on ancestors, body, or html
  let cur: Element | null = container;
  while (cur) {
    const ct = classThemeOf(cur);
    if (ct) return ct;
    cur = cur.parentElement;
  }
  if (typeof document !== 'undefined') {
    const bodyCls = classThemeOf(document.body);
    if (bodyCls) return bodyCls;
    const docCls = classThemeOf(document.documentElement);
    if (docCls) return docCls;
  }

  // Fall back to computed host background luminance, then prefers-color-scheme: light
  const prefersLight =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? Boolean(window.matchMedia('(prefers-color-scheme: light)')?.matches)
      : false;

  const bgLayers: string[] = [];
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const seen = new Set<Element>();
    let node: Element | null = container;
    while (node) {
      seen.add(node);
      bgLayers.push(window.getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    if (typeof document !== 'undefined') {
      if (document.body && !seen.has(document.body)) {
        bgLayers.push(window.getComputedStyle(document.body).backgroundColor);
      }
      if (document.documentElement && !seen.has(document.documentElement)) {
        bgLayers.push(window.getComputedStyle(document.documentElement).backgroundColor);
      }
    }
  }

  return resolveThemeFromBackgroundLayers(bgLayers, prefersLight);
}

function findNode(root: PlanNode, id: string | null): PlanNode | null {
  if (!id) return null;
  if (root.id === id) return root;
  for (const c of root.plans) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function collectParentIds(node: PlanNode, acc: Set<string>): void {
  if (node.plans.length > 0) {
    acc.add(node.id);
    for (const c of node.plans) collectParentIds(c, acc);
  }
}

function renderSummary(
  parsed: ParsedExplain,
  theme: 'dark' | 'light',
  breakdownExpanded: boolean,
  onToggleBreakdown: () => void,
  onToggleTheme: () => void
): HTMLElement {
  const stats = h('div', { className: 'pgp-stats' });
  const addStat = (label: string, val: string, sub?: string, tip?: string) => {
    stats.appendChild(
      h(
        'div',
        { className: 'pgp-stat', title: tip },
        h('span', { className: 'pgp-stat-lbl' }, label),
        h('span', { className: 'pgp-stat-val' }, val, sub ? h('span', { className: 'pgp-stat-sub' }, sub) : null)
      )
    );
  };

  if (parsed.executionTimeMs !== undefined) {
    addStat('Execution time', formatMs(parsed.executionTimeMs));
  } else if (parsed.hasTiming) {
    addStat('Total time', formatMs(parsed.effectiveTotalTimeMs));
  } else if (parsed.hasCosts) {
    addStat('Total cost', parsed.effectiveTotalCost.toFixed(2));
  }

  if (parsed.effectiveTotalIoMs > 0) {
    const r = parsed.plan.ioTimings?.totalReadMs ?? 0;
    const w = parsed.plan.ioTimings?.totalWriteMs ?? 0;
    if (parsed.hasTiming && parsed.effectiveTotalTimeMs > 0) {
      const ioPct = Math.min(100, (parsed.effectiveTotalIoMs / parsed.effectiveTotalTimeMs) * 100);
      const cpuPct = Math.max(0, 100 - ioPct);
      addStat(
        'CPU* / I/O split',
        `${cpuPct.toFixed(0)}% / ${ioPct.toFixed(0)}%`,
        `${formatMs(parsed.effectiveTotalCpuMs)} · ${formatMs(parsed.effectiveTotalIoMs)}`,
        `CPU* = execution minus tracked I/O time (read ${formatMs(r)}, write ${formatMs(w)})`
      );
    } else {
      addStat('I/O time', formatMs(parsed.effectiveTotalIoMs), `r ${formatMs(r)} / w ${formatMs(w)}`);
    }
  }

  if (parsed.planningTimeMs !== undefined) {
    const pMem =
      parsed.planning?.memoryUsedKb !== undefined
        ? `${formatKbAsIec(parsed.planning.memoryUsedKb)} mem`
        : undefined;
    addStat('Planning time', formatMs(parsed.planningTimeMs), pMem);
  }

  if (parsed.hasBuffers) {
    const b = parsed.plan.buffers;
    const sharedTotal = b.shared.hit + b.shared.read;
    const hitPct = sharedTotal > 0 ? `${((b.shared.hit / sharedTotal) * 100).toFixed(1)}% hit` : undefined;
    const totalIoBlks = sumBufferBlocks(b);
    const tempBlks = b.temp.read + b.temp.written;
    const subBits = [hitPct, tempBlks > 0 ? `${formatBlocks(tempBlks)} temp` : undefined].filter(Boolean).join(' · ');
    addStat('Buffers', formatBlocks(totalIoBlks), subBits || undefined);
  }

  const rowVal = parsed.isAnalyze
    ? formatCompactCount(parsed.plan.totalActualRows)
    : formatCompactCount(parsed.plan.totalPlanRows);
  const nodeSub =
    parsed.neverExecutedCount > 0
      ? `${parsed.nodeCount} nodes (${parsed.neverExecutedCount} unused)`
      : `${parsed.nodeCount} nodes`;
  addStat(parsed.isAnalyze ? 'Rows' : 'Est. rows', rowVal, nodeSub);

  const bdBtn = h(
    'button',
    {
      type: 'button',
      className: `pgp-btn pgp-btn-sm ${breakdownExpanded ? 'active' : ''}`,
      'aria-expanded': String(breakdownExpanded),
    },
    'Breakdown'
  );
  bdBtn.addEventListener('click', onToggleBreakdown);

  const themeBtn = h(
    'button',
    { type: 'button', className: 'pgp-btn pgp-btn-sm' },
    theme === 'dark' ? 'Light mode' : 'Dark mode'
  );
  themeBtn.addEventListener('click', onToggleTheme);

  return h(
    'div',
    { className: 'pgp-summary' },
    stats,
    h('div', { className: 'pgp-summary-right' }, bdBtn, themeBtn)
  );
}

function renderMetaStrip(parsed: ParsedExplain): HTMLElement | null {
  const items: HTMLElement[] = [];

  if (parsed.queryIdentifier) {
    items.push(h('span', { className: 'pgp-meta-item' }, 'Query ID: ', h('code', null, parsed.queryIdentifier)));
  }
  if (parsed.jit) {
    const jt = parsed.jit.timing?.totalMs;
    items.push(
      h(
        'span',
        { className: 'pgp-meta-item' },
        'JIT: ',
        h('code', null, `${parsed.jit.functions} fn${jt !== undefined ? ` (${formatMs(jt)})` : ''}`)
      )
    );
  }
  if (parsed.serialization) {
    const s = parsed.serialization;
    items.push(
      h(
        'span',
        { className: 'pgp-meta-item' },
        'Serialize: ',
        h('code', null, `${formatKbAsIec(s.outputKb)} ${s.format}${s.timeMs !== undefined ? ` (${formatMs(s.timeMs)})` : ''}`)
      )
    );
  }
  if (parsed.triggers.length > 0) {
    const totalTrigMs = parsed.triggers.reduce((acc, t) => acc + (t.timeMs ?? 0), 0);
    items.push(
      h(
        'span',
        { className: 'pgp-meta-item' },
        'Triggers: ',
        h('code', null, `${parsed.triggers.length} (${formatMs(totalTrigMs)})`)
      )
    );
  }
  if (parsed.settings && Object.keys(parsed.settings).length > 0) {
    const entries = Object.entries(parsed.settings);
    const preview = entries.slice(0, 4).map(([k, v]) => `${k}=${v}`).join(', ');
    const more = entries.length > 4 ? ` +${entries.length - 4}` : '';
    items.push(
      h(
        'span',
        { className: 'pgp-meta-item', title: entries.map(([k, v]) => `${k} = '${v}'`).join('\n') },
        'Settings: ',
        h('code', null, preview + more)
      )
    );
  }

  if (items.length === 0) return null;
  return h('div', { className: 'pgp-meta-strip' }, ...items);
}

function resolveMetric(parsed: ParsedExplain, pref?: MetricMode | 'auto'): MetricMode {
  if (pref && pref !== 'auto') return pref;
  if (parsed.hasBuffers) return 'buffers';
  if (parsed.hasTiming) return 'exclusiveTime';
  return 'cost';
}

export function renderPlan(
  container: HTMLElement,
  planInput: string | unknown,
  options: RenderOptions = {}
): PlanHandle {
  const useShadow = options.useShadow ?? true;
  let mountPoint: HTMLElement | ShadowRoot;

  if (useShadow && typeof container.attachShadow === 'function') {
    mountPoint = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  } else {
    mountPoint = container;
  }

  if (options.injectStyles !== false) {
    mountStyles(mountPoint instanceof ShadowRoot ? mountPoint : document, options.styleNonce);
  }

  let parsed = parsePlan(planInput);
  let diagnostics = diagnosePlan(parsed);
  let currentOpts: RenderOptions = { ...options };

  let theme: 'dark' | 'light' = resolveInitialTheme(container, options.theme);
  let explicitTheme = options.theme === 'dark' || options.theme === 'light';
  let view: ViewMode = options.view ?? 'table';
  let metric: MetricMode = resolveMetric(parsed, options.metric);
  let selectedId: string | null =
    options.selectedNode && findNode(parsed.plan, options.selectedNode) ? options.selectedNode : null;
  let diagExpanded = false;
  let breakdownExpanded = false;
  let hotOnly = false;
  let hideUnused = false;
  let search = '';
  let verboseOutput = true;
  const collapsed = new Set<string>();

  const rootEl = h('div', { className: 'pgp-root', 'data-theme': theme });
  clearNode(mountPoint);
  mountPoint.appendChild(rootEl);

  let themeObserver: MutationObserver | null = null;
  let schemeMedia: MediaQueryList | null = null;
  const syncAutoTheme = () => {
    if (explicitTheme) return;
    const next = resolveInitialTheme(container, 'auto');
    if (next !== theme) {
      theme = next;
      rootEl.setAttribute('data-theme', theme);
      paint();
    }
  };
  if (!explicitTheme && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(syncAutoTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-theme', 'class'],
      });
    }
  }
  if (!explicitTheme && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    schemeMedia = window.matchMedia('(prefers-color-scheme: light)');
    schemeMedia.addEventListener?.('change', syncAutoTheme);
  }

  const emitState = () => {
    const state: PlanState = { view, metric, selectedNodeId: selectedId };
    currentOpts.onStateChange?.(state);
    if (typeof CustomEvent !== 'undefined' && typeof container.dispatchEvent === 'function') {
      container.dispatchEvent(
        new CustomEvent<PlanState>('pgprism:state', {
          detail: state,
          bubbles: true,
          composed: true,
        })
      );
    }
  };

  const expandAncestors = (n: PlanNode, targetId: string): boolean => {
    if (n.id === targetId) return true;
    for (const c of n.plans) {
      if (expandAncestors(c, targetId)) {
        collapsed.delete(n.id);
        return true;
      }
    }
    return false;
  };

  const selectNode = (id: string | null) => {
    const targetNode = id ? findNode(parsed.plan, id) : null;
    selectedId = targetNode ? targetNode.id : null;
    if (targetNode) {
      if (targetNode.neverExecuted) hideUnused = false;
      expandAncestors(parsed.plan, targetNode.id);
    }
    currentOpts.onSelectNode?.(targetNode);
    emitState();
    paint();
  };

  const jumpToNode = (id: string) => {
    if (view === 'text' || view === 'json') view = 'table';
    const targetNode = findNode(parsed.plan, id);
    if (targetNode?.neverExecuted) hideUnused = false;
    expandAncestors(parsed.plan, id);
    selectedId = targetNode ? targetNode.id : null;
    currentOpts.onSelectNode?.(targetNode);
    emitState();
    paint();
    if (selectedId) {
      const target = rootEl.querySelector(`[data-node-id="${selectedId}"]`);
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const paint = () => {
    rootEl.setAttribute('data-theme', theme);
    clearNode(rootEl);

    if (currentOpts.showHeader !== false) {
      rootEl.appendChild(
        renderSummary(
          parsed,
          theme,
          breakdownExpanded,
          () => {
            breakdownExpanded = !breakdownExpanded;
            paint();
          },
          () => {
            explicitTheme = true;
            theme = theme === 'dark' ? 'light' : 'dark';
            paint();
          }
        )
      );
      const meta = renderMetaStrip(parsed);
      if (meta) rootEl.appendChild(meta);
    }

    if (breakdownExpanded) {
      rootEl.appendChild(renderBreakdownPanel(parsed, jumpToNode));
    }

    if (currentOpts.showDiagnostics !== false) {
      rootEl.appendChild(
        renderDiagnosticsStrip(
          diagnostics,
          diagExpanded,
          () => {
            diagExpanded = !diagExpanded;
            paint();
          },
          jumpToNode
        )
      );
    }

    if (currentOpts.showToolbar !== false) {
      const views: Array<[ViewMode, string]> = [
        ['table', 'Table'],
        ['tree', 'Tree'],
        ['flame', 'Flame'],
        ['text', 'Text'],
        ['json', 'JSON'],
      ];
      const viewBtns = h(
        'div',
        { className: 'pgp-btn-group', role: 'tablist' },
        ...views.map(([mode, label]) => {
          const btn = h(
            'button',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(view === mode),
              className: `pgp-btn ${view === mode ? 'active' : ''}`,
            },
            label
          );
          btn.addEventListener('click', () => {
            view = mode;
            emitState();
            paint();
          });
          return btn;
        })
      );

      const rightTools = h('div', { className: 'pgp-btn-group' });

      if (view === 'table' || view === 'tree' || view === 'flame') {
        const metricOpts: Array<[MetricMode, string]> = [
          ['exclusiveTime', view === 'flame' ? 'Time' : 'Exclusive time'],
          ['inclusiveTime', 'Inclusive time'],
          ['buffers', 'Buffers (all)'],
          ['diskReads', 'Disk reads'],
          ['ioTime', 'I/O time'],
          ['rows', 'Rows'],
          ['cost', 'Cost'],
        ];
        if (view === 'flame') {
          const flameQuick: Array<[MetricMode, string]> = [
            ['exclusiveTime', 'Time'],
            ['buffers', 'Buffers'],
            ['diskReads', 'Disk reads'],
            ['ioTime', 'I/O time'],
            ['rows', 'Rows'],
            ['cost', 'Cost'],
          ];
          const grp = h('div', { className: 'pgp-btn-group', role: 'group', 'aria-label': 'Flame metric' });
          for (const [mv, ml] of flameQuick) {
            const active = mv === metric || (mv === 'exclusiveTime' && metric === 'inclusiveTime');
            const b = h('button', { type: 'button', className: `pgp-btn pgp-btn-sm ${active ? 'active' : ''}` }, ml);
            b.addEventListener('click', () => {
              metric = mv;
              emitState();
              paint();
            });
            grp.appendChild(b);
          }
          rightTools.appendChild(grp);
        } else {
          const metricSel = h('select', { className: 'pgp-select', 'aria-label': 'Metric' });
          for (const [mv, ml] of metricOpts) {
            const o = h('option', { value: mv }, ml);
            if (mv === metric) o.selected = true;
            metricSel.appendChild(o);
          }
          metricSel.addEventListener('change', () => {
            metric = metricSel.value as MetricMode;
            emitState();
            paint();
          });
          rightTools.appendChild(metricSel);
        }

        const hotBtn = h(
          'button',
          { type: 'button', className: `pgp-btn ${hotOnly ? 'active' : ''}` },
          'Hot path'
        );
        hotBtn.addEventListener('click', () => {
          hotOnly = !hotOnly;
          paint();
        });
        rightTools.appendChild(hotBtn);

        if (parsed.neverExecutedCount > 0) {
          const unusedBtn = h(
            'button',
            { type: 'button', className: `pgp-btn ${hideUnused ? 'active' : ''}` },
            hideUnused
              ? `Show unused (${parsed.neverExecutedCount})`
              : `Hide unused (${parsed.neverExecutedCount})`
          );
          unusedBtn.addEventListener('click', () => {
            hideUnused = !hideUnused;
            paint();
          });
          rightTools.appendChild(unusedBtn);
        }

        if (view === 'table' || view === 'tree') {
          const foldAllBtn = h(
            'button',
            { type: 'button', className: 'pgp-btn' },
            collapsed.size > 0 ? 'Expand all' : 'Collapse all'
          );
          foldAllBtn.addEventListener('click', () => {
            if (collapsed.size > 0) {
              collapsed.clear();
            } else {
              collectParentIds(parsed.plan, collapsed);
              collapsed.delete(parsed.plan.id);
            }
            paint();
          });
          rightTools.appendChild(foldAllBtn);
        }

        const searchInput = h('input', {
          type: 'search',
          className: 'pgp-input',
          placeholder: 'Filter nodes...',
          value: search,
          'aria-label': 'Filter nodes',
        });
        searchInput.addEventListener('input', () => {
          search = searchInput.value;
          const pos = searchInput.selectionStart ?? search.length;
          paint();
          const re = rootEl.querySelector('.pgp-input') as HTMLInputElement | null;
          if (re) {
            re.focus();
            re.setSelectionRange(pos, pos);
          }
        });
        rightTools.appendChild(searchInput);
      }

      if (view === 'table' || view === 'tree' || view === 'flame') {
        rightTools.appendChild(h('span', { className: 'pgp-sep', 'aria-hidden': 'true' }));
      }
      rightTools.appendChild(
        makeCopyButton('Copy for LLM', () => formatForLLM(parsed), 'Copy Markdown summary for coding agents')
      );

      rootEl.appendChild(h('div', { className: 'pgp-toolbar' }, viewBtns, rightTools));
    }

    const selectedNode = findNode(parsed.plan, selectedId);
    const showInsp = Boolean(selectedNode) && view !== 'text' && view !== 'json';
    const workspace = h('div', { className: `pgp-workspace ${showInsp ? 'with-insp' : ''}` });
    const main = h('div', {
      className: 'pgp-main',
      style: currentOpts.maxHeight ? { maxHeight: currentOpts.maxHeight } : undefined,
    });

    if (view === 'table') {
      main.appendChild(
        renderTableView(parsed, {
          selectedId,
          collapsed,
          metric,
          search,
          hotOnly,
          hideUnused,
          onSelect: (id) => selectNode(id === selectedId ? null : id),
          onToggleCollapse: (id) => {
            if (collapsed.has(id)) collapsed.delete(id);
            else collapsed.add(id);
            paint();
          },
        })
      );
    } else if (view === 'tree') {
      main.appendChild(
        renderTreeView(parsed, {
          selectedId,
          collapsed,
          metric,
          search,
          hotOnly,
          hideUnused,
          onSelect: (id) => selectNode(id === selectedId ? null : id),
          onToggleCollapse: (id) => {
            if (collapsed.has(id)) collapsed.delete(id);
            else collapsed.add(id);
            paint();
          },
        })
      );
    } else if (view === 'flame') {
      main.appendChild(
        renderFlameView(parsed, {
          selectedId,
          metric,
          search,
          hotOnly,
          hideUnused,
          onSelect: (id) => selectNode(id === selectedId ? null : id),
        })
      );
    } else {
      main.appendChild(
        renderCodeView(parsed, view, verboseOutput, () => {
          verboseOutput = !verboseOutput;
          paint();
        })
      );
    }

    workspace.appendChild(main);
    if (showInsp && selectedNode) {
      workspace.appendChild(
        renderInspector(parsed, selectedNode, () => selectNode(null), jumpToNode, diagnostics)
      );
    }
    rootEl.appendChild(workspace);
  };

  paint();
  if (selectedId) {
    const initialTarget = rootEl.querySelector(`[data-node-id="${selectedId}"]`);
    initialTarget?.scrollIntoView?.({ block: 'nearest' });
  }

  return {
    get parsed() {
      return parsed;
    },
    update(nextPlan: string | unknown, nextOptions?: RenderOptions) {
      parsed = parsePlan(nextPlan);
      diagnostics = diagnosePlan(parsed);
      if (nextOptions) {
        currentOpts = { ...currentOpts, ...nextOptions };
        if (nextOptions.view) view = nextOptions.view;
        if (nextOptions.theme === 'dark' || nextOptions.theme === 'light') {
          explicitTheme = true;
          theme = nextOptions.theme;
        }
      }
      metric = resolveMetric(parsed, nextOptions?.metric ?? currentOpts.metric);
      collapsed.clear();
      const nextSel = nextOptions?.selectedNode ?? null;
      selectedId = nextSel && findNode(parsed.plan, nextSel) ? nextSel : null;
      diagExpanded = false;
      breakdownExpanded = false;
      hideUnused = false;
      paint();
      if (selectedId) {
        const target = rootEl.querySelector(`[data-node-id="${selectedId}"]`);
        target?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    selectNode,
    setView(v: ViewMode) {
      view = v;
      emitState();
      paint();
    },
    setMetric(m: MetricMode | 'auto') {
      metric = resolveMetric(parsed, m);
      emitState();
      paint();
    },
    setTheme(t: 'dark' | 'light') {
      explicitTheme = true;
      theme = t;
      paint();
    },
    getState() {
      return { view, metric, selectedNodeId: selectedId };
    },
    destroy() {
      themeObserver?.disconnect();
      schemeMedia?.removeEventListener?.('change', syncAutoTheme);
      clearNode(mountPoint);
    },
  };
}
