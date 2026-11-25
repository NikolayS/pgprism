import { diagnosePlan } from '../diagnostics';
import { parsePlan } from '../parser';
import { PGSCOPE_CSS } from '../styles';
import type {
  MetricMode,
  ParsedExplain,
  PlanNode,
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
import { clearNode, h } from './dom';
import { renderInspector } from './inspector';
import { renderDiagnosticsStrip } from './view-diagnostics';
import { renderFlameView } from './view-flame';
import { renderTableView } from './view-table';
import { renderCodeView } from './view-text';
import { renderTreeView } from './view-tree';

export interface PlanHandle {
  update: (nextPlan: string | unknown, nextOptions?: RenderOptions) => void;
  selectNode: (nodeId: string | null) => void;
  setView: (view: ViewMode) => void;
  setTheme: (theme: 'dark' | 'light') => void;
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
        sharedSheet.replaceSync(PGSCOPE_CSS);
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
  styleEl.setAttribute('data-pgscope', '1');
  if (nonce) styleEl.setAttribute('nonce', nonce);
  styleEl.textContent = PGSCOPE_CSS;
  if (target instanceof Document) {
    target.head.appendChild(styleEl);
  } else {
    target.appendChild(styleEl);
  }
}

function resolveInitialTheme(container: HTMLElement, pref?: ThemeMode): 'dark' | 'light' {
  if (pref === 'dark' || pref === 'light') return pref;
  const closest = container.closest?.('[data-theme]')?.getAttribute('data-theme');
  if (closest === 'light' || closest === 'dark') return closest;
  const docTheme = document.documentElement?.getAttribute('data-theme');
  if (docTheme === 'light' || docTheme === 'dark') return docTheme;
  return 'dark';
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
  onToggleTheme: () => void
): HTMLElement {
  const stats = h('div', { className: 'pgs-stats' });
  const addStat = (label: string, val: string, sub?: string) => {
    stats.appendChild(
      h(
        'div',
        { className: 'pgs-stat' },
        h('span', { className: 'pgs-stat-lbl' }, label),
        h('span', { className: 'pgs-stat-val' }, val, sub ? h('span', { className: 'pgs-stat-sub' }, sub) : null)
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

  if (parsed.effectiveTotalIoMs > 0) {
    const r = parsed.plan.ioTimings?.totalReadMs ?? 0;
    const w = parsed.plan.ioTimings?.totalWriteMs ?? 0;
    addStat('I/O time', formatMs(parsed.effectiveTotalIoMs), `r ${formatMs(r)} / w ${formatMs(w)}`);
  }

  const rowVal = parsed.isAnalyze
    ? formatCompactCount(parsed.plan.totalActualRows)
    : formatCompactCount(parsed.plan.totalPlanRows);
  addStat(parsed.isAnalyze ? 'Rows' : 'Est. rows', rowVal, `${parsed.nodeCount} nodes`);

  const themeBtn = h(
    'button',
    { type: 'button', className: 'pgs-btn pgs-btn-sm' },
    theme === 'dark' ? 'Light mode' : 'Dark mode'
  );
  themeBtn.addEventListener('click', onToggleTheme);

  return h(
    'div',
    { className: 'pgs-summary' },
    stats,
    h('div', { className: 'pgs-summary-right' }, themeBtn)
  );
}

function renderMetaStrip(parsed: ParsedExplain): HTMLElement | null {
  const items: HTMLElement[] = [];

  if (parsed.queryIdentifier) {
    items.push(h('span', { className: 'pgs-meta-item' }, 'Query ID: ', h('code', null, parsed.queryIdentifier)));
  }
  if (parsed.jit) {
    const jt = parsed.jit.timing?.totalMs;
    items.push(
      h(
        'span',
        { className: 'pgs-meta-item' },
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
        { className: 'pgs-meta-item' },
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
        { className: 'pgs-meta-item' },
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
        { className: 'pgs-meta-item', title: entries.map(([k, v]) => `${k} = '${v}'`).join('\n') },
        'Settings: ',
        h('code', null, preview + more)
      )
    );
  }

  if (items.length === 0) return null;
  return h('div', { className: 'pgs-meta-strip' }, ...items);
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
  let metric: MetricMode = options.metric ?? (parsed.hasTiming ? 'exclusiveTime' : 'cost');
  let selectedId: string | null = null;
  let diagExpanded = false;
  let hotOnly = false;
  let search = '';
  let verboseOutput = true;
  const collapsed = new Set<string>();

  const rootEl = h('div', { className: 'pgs-root', 'data-theme': theme });
  clearNode(mountPoint);
  mountPoint.appendChild(rootEl);

  let themeObserver: MutationObserver | null = null;
  if (!explicitTheme && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      if (explicitTheme) return;
      const next = resolveInitialTheme(container, 'auto');
      if (next !== theme) {
        theme = next;
        rootEl.setAttribute('data-theme', theme);
        paint();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  const selectNode = (id: string | null) => {
    selectedId = id;
    currentOpts.onSelectNode?.(findNode(parsed.plan, id));
    paint();
  };

  const jumpToNode = (id: string) => {
    if (view === 'text' || view === 'json') view = 'table';
    // Ensure ancestors are expanded
    const expandPath = (n: PlanNode): boolean => {
      if (n.id === id) return true;
      for (const c of n.plans) {
        if (expandPath(c)) {
          collapsed.delete(n.id);
          return true;
        }
      }
      return false;
    };
    expandPath(parsed.plan);
    selectedId = id;
    currentOpts.onSelectNode?.(findNode(parsed.plan, id));
    paint();
    const target = rootEl.querySelector(`[data-node-id="${id}"]`);
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const paint = () => {
    rootEl.setAttribute('data-theme', theme);
    clearNode(rootEl);

    if (currentOpts.showHeader !== false) {
      rootEl.appendChild(
        renderSummary(parsed, theme, () => {
          explicitTheme = true;
          theme = theme === 'dark' ? 'light' : 'dark';
          paint();
        })
      );
      const meta = renderMetaStrip(parsed);
      if (meta) rootEl.appendChild(meta);
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
        { className: 'pgs-btn-group', role: 'tablist' },
        ...views.map(([mode, label]) => {
          const btn = h(
            'button',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(view === mode),
              className: `pgs-btn ${view === mode ? 'active' : ''}`,
            },
            label
          );
          btn.addEventListener('click', () => {
            view = mode;
            paint();
          });
          return btn;
        })
      );

      const rightTools = h('div', { className: 'pgs-btn-group' });

      if (view === 'tree' || view === 'flame') {
        const metricSel = h('select', { className: 'pgs-select', 'aria-label': 'Metric' });
        const metricOpts: Array<[MetricMode, string]> = [
          ['exclusiveTime', 'Exclusive time'],
          ['inclusiveTime', 'Inclusive time'],
          ['buffers', 'Buffers'],
          ['ioTime', 'I/O time'],
          ['rows', 'Rows'],
          ['cost', 'Cost'],
        ];
        for (const [mv, ml] of metricOpts) {
          const o = h('option', { value: mv }, ml);
          if (mv === metric) o.selected = true;
          metricSel.appendChild(o);
        }
        metricSel.addEventListener('change', () => {
          metric = metricSel.value as MetricMode;
          paint();
        });
        rightTools.appendChild(metricSel);
      }

      if (view === 'table' || view === 'tree' || view === 'flame') {
        const hotBtn = h(
          'button',
          { type: 'button', className: `pgs-btn ${hotOnly ? 'active' : ''}` },
          'Hot path'
        );
        hotBtn.addEventListener('click', () => {
          hotOnly = !hotOnly;
          paint();
        });
        rightTools.appendChild(hotBtn);

        if (view === 'table' || view === 'tree') {
          const foldAllBtn = h(
            'button',
            { type: 'button', className: 'pgs-btn' },
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
          className: 'pgs-input',
          placeholder: 'Filter nodes...',
          value: search,
          'aria-label': 'Filter nodes',
        });
        searchInput.addEventListener('input', () => {
          search = searchInput.value;
          const pos = searchInput.selectionStart ?? search.length;
          paint();
          const re = rootEl.querySelector('.pgs-input') as HTMLInputElement | null;
          if (re) {
            re.focus();
            re.setSelectionRange(pos, pos);
          }
        });
        rightTools.appendChild(searchInput);
      }

      rootEl.appendChild(h('div', { className: 'pgs-toolbar' }, viewBtns, rightTools));
    }

    const selectedNode = findNode(parsed.plan, selectedId);
    const showInsp = Boolean(selectedNode) && view !== 'text' && view !== 'json';
    const workspace = h('div', { className: `pgs-workspace ${showInsp ? 'with-insp' : ''}` });
    const main = h('div', {
      className: 'pgs-main',
      style: currentOpts.maxHeight ? { maxHeight: currentOpts.maxHeight } : undefined,
    });

    if (view === 'table') {
      main.appendChild(
        renderTableView(parsed, {
          selectedId,
          collapsed,
          search,
          hotOnly,
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
        renderInspector(parsed, selectedNode, () => selectNode(null), jumpToNode)
      );
    }
    rootEl.appendChild(workspace);
  };

  paint();

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
        if (nextOptions.metric) metric = nextOptions.metric;
        if (nextOptions.theme === 'dark' || nextOptions.theme === 'light') {
          explicitTheme = true;
          theme = nextOptions.theme;
        }
      }
      collapsed.clear();
      selectedId = null;
      diagExpanded = false;
      paint();
    },
    selectNode,
    setView(v: ViewMode) {
      view = v;
      paint();
    },
    setTheme(t: 'dark' | 'light') {
      explicitTheme = true;
      theme = t;
      paint();
    },
    destroy() {
      themeObserver?.disconnect();
      clearNode(mountPoint);
    },
  };
}
