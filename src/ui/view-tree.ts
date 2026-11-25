import type { MetricMode, ParsedExplain, PlanNode } from '../types';
import { formatBlocks, formatCompactCount, formatMs } from '../units';
import { h } from './dom';
import {
  countDescendants,
  getMetricSample,
  getNodeFlags,
  nodeMatchesSearch,
  nodeQualPreview,
} from './metrics';

export interface TreeViewOpts {
  selectedId: string | null;
  collapsed: Set<string>;
  metric: MetricMode;
  search: string;
  hotOnly: boolean;
  hideUnused: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export function renderTreeView(parsed: ParsedExplain, opts: TreeViewOpts): HTMLElement {
  const wrap = h('div', { className: 'pgp-tree-wrap' });
  const q = opts.search.trim().toLowerCase();

  const buildNode = (node: PlanNode): HTMLElement | null => {
    if (opts.hideUnused && node.neverExecuted) return null;
    const container = h('div', { className: 'pgp-tree-node' });
    const hasChildren = node.plans.length > 0;
    const isCollapsed = opts.collapsed.has(node.id);
    const match = nodeMatchesSearch(node, q);
    const dimHot = opts.hotOnly && !parsed.hotPathIds.has(node.id);
    const dimmed = (q !== '' && !match) || dimHot;

    const foldBtn = hasChildren
      ? h(
          'button',
          {
            type: 'button',
            className: 'pgp-fold-btn',
            title: isCollapsed ? 'Expand subtree' : 'Collapse subtree',
          },
          isCollapsed ? '▸' : '▾'
        )
      : null;
    if (foldBtn) {
      foldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onToggleCollapse(node.id);
      });
    }

    const left = h('div', { className: 'pgp-tree-left' });
    if (foldBtn) left.appendChild(foldBtn);
    if (node.subplanName) {
      left.appendChild(h('span', { className: 'pgp-pill pgp-pill-blue' }, node.subplanName));
    }
    left.appendChild(h('span', { className: 'pgp-node-title' }, node.displayTitle));
    if (isCollapsed && hasChildren) {
      left.appendChild(h('span', { className: 'pgp-pill' }, `+${countDescendants(node)} nodes`));
    }
    for (const f of getNodeFlags(node)) {
      left.appendChild(
        h('span', { className: `pgp-pill ${f.tone !== 'neutral' ? `pgp-pill-${f.tone}` : ''}` }, f.label)
      );
    }

    const sample = getMetricSample(parsed, node, opts.metric);
    const metrics = h('div', { className: 'pgp-tree-metrics' });
    metrics.appendChild(h('span', null, sample.label));
    if (parsed.isAnalyze && opts.metric !== 'rows') {
      metrics.appendChild(h('span', null, `${formatCompactCount(node.totalActualRows)} rows`));
    }
    if (parsed.hasBuffers && opts.metric !== 'buffers' && node.exclusiveBufferBlocks > 0) {
      metrics.appendChild(h('span', null, `${formatBlocks(node.exclusiveBufferBlocks)} self`));
    }
    if ((node.actualLoops ?? 1) > 1) {
      metrics.appendChild(h('span', null, `${formatCompactCount(node.actualLoops!)} loops`));
    }

    const preview = nodeQualPreview(node);
    const childBarPct = Math.max(0, sample.pct - sample.selfPct);
    const bar = h(
      'div',
      { className: 'pgp-tree-bar', title: `Self ${sample.selfPct.toFixed(1)}% · Subtree ${sample.pct.toFixed(1)}%` },
      h('div', { className: 'pgp-tree-bar-self', style: { width: `${sample.selfPct.toFixed(1)}%` } }),
      childBarPct > 0
        ? h('div', { className: 'pgp-tree-bar-child', style: { width: `${childBarPct.toFixed(1)}%` } })
        : null
    );

    const hotTint =
      opts.selectedId !== node.id && !dimmed && parsed.hasTiming && node.pctExclusiveTime >= 20
        ? node.pctExclusiveTime >= 45
          ? 'pgp-heat-2'
          : 'pgp-heat-1'
        : '';

    const card = h(
      'div',
      {
        'data-node-id': node.id,
        className: [
          'pgp-tree-card',
          opts.selectedId === node.id ? 'selected' : '',
          hotTint,
          dimmed ? 'dimmed' : '',
          node.neverExecuted ? 'never-exec' : '',
        ]
          .filter(Boolean)
          .join(' '),
      },
      h('div', { className: 'pgp-tree-top' }, left, metrics),
      preview ? h('div', { className: 'pgp-tree-qual', title: preview }, preview) : null,
      bar
    );
    card.addEventListener('click', () => opts.onSelect(node.id));
    container.appendChild(card);

    if (hasChildren && !isCollapsed) {
      const chWrap = h('div', { className: 'pgp-tree-children' });
      for (const c of node.plans) {
        const chEl = buildNode(c);
        if (chEl) chWrap.appendChild(chEl);
      }
      if (chWrap.childNodes.length > 0) container.appendChild(chWrap);
    }

    return container;
  };

  const rootTree = buildNode(parsed.plan);
  if (rootTree) wrap.appendChild(rootTree);
  return wrap;
}
