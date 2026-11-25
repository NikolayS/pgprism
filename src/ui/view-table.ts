import type { ParsedExplain, PlanNode } from '../types';
import {
  formatBlocks,
  formatCompactCount,
  formatFactor,
  formatMs,
} from '../units';
import { h } from './dom';
import {
  countDescendants,
  getNodeFlags,
  heatClass,
  nodeMatchesSearch,
  nodeQualPreview,
} from './metrics';

export interface TableViewOpts {
  selectedId: string | null;
  collapsed: Set<string>;
  search: string;
  hotOnly: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export function renderTableView(parsed: ParsedExplain, opts: TableViewOpts): HTMLElement {
  const rows: Array<{ node: PlanNode; seq: number }> = [];
  let seqCounter = 1;

  const walk = (n: PlanNode) => {
    const seq = seqCounter++;
    rows.push({ node: n, seq });
    if (!opts.collapsed.has(n.id)) {
      for (const c of n.plans) walk(c);
    }
  };
  walk(parsed.plan);

  const thead = h(
    'thead',
    null,
    h(
      'tr',
      null,
      h('th', { className: 'num' }, '#'),
      h('th', null, 'Node'),
      h('th', { className: 'num' }, parsed.hasTiming ? 'Excl. time' : 'Excl. cost'),
      h('th', { className: 'num' }, parsed.hasTiming ? 'Incl. time' : 'Incl. cost'),
      h('th', { className: 'num' }, parsed.isAnalyze ? 'Rows (act / est)' : 'Est. rows'),
      h('th', { className: 'num' }, 'Loops'),
      h('th', { className: 'num' }, 'Buffers (self)'),
      h('th', null, 'Flags')
    )
  );

  const tbody = h('tbody');
  const q = opts.search.trim().toLowerCase();

  for (const { node, seq } of rows) {
    const isCollapsed = opts.collapsed.has(node.id);
    const hasChildren = node.plans.length > 0;
    const match = nodeMatchesSearch(node, q);
    const dimHot = opts.hotOnly && !parsed.hotPathIds.has(node.id);
    const dimmed = (q !== '' && !match) || dimHot;

    const foldBtn = hasChildren
      ? h(
          'button',
          {
            type: 'button',
            className: 'pgs-fold-btn',
            title: isCollapsed ? 'Expand subtree' : 'Collapse subtree',
            'aria-label': isCollapsed ? 'Expand subtree' : 'Collapse subtree',
          },
          isCollapsed ? '▸' : '▾'
        )
      : h('span', { className: 'pgs-fold-spacer' });

    if (hasChildren) {
      foldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onToggleCollapse(node.id);
      });
    }

    const indentPx = node.depth * 16;
    const preview = nodeQualPreview(node);
    const titleBits: Array<Node | string> = [];
    if (node.subplanName) {
      titleBits.push(h('span', { className: 'pgs-pill pgs-pill-blue' }, node.subplanName));
    }
    titleBits.push(h('span', { className: 'pgs-node-title', title: node.displayTitle }, node.displayTitle));
    if (isCollapsed && hasChildren) {
      titleBits.push(h('span', { className: 'pgs-pill' }, `+${countDescendants(node)}`));
    }
    if (preview) {
      titleBits.push(h('span', { className: 'pgs-node-sub', title: preview }, preview));
    }

    const nodeCell = h(
      'td',
      null,
      h('div', { className: 'pgs-node-cell', style: indentPx ? { paddingLeft: `${indentPx}px` } : undefined }, foldBtn, ...titleBits)
    );

    // Exclusive time / cost
    const exclPct = parsed.hasTiming
      ? node.pctExclusiveTime
      : parsed.effectiveTotalCost > 0
        ? (node.exclusiveCost / parsed.effectiveTotalCost) * 100
        : 0;
    const exclText = parsed.hasTiming
      ? formatMs(node.exclusiveTimeMs)
      : node.exclusiveCost.toFixed(1);
    const exclCell = h(
      'td',
      { className: `num ${heatClass(exclPct)}` },
      h(
        'div',
        { className: 'pgs-bar-wrap' },
        h('span', null, `${exclText}${parsed.hasTiming ? ` · ${exclPct.toFixed(0)}%` : ''}`),
        h(
          'div',
          { className: 'pgs-bar-track' },
          h('div', { className: 'pgs-bar-fill', style: { width: `${Math.min(100, exclPct).toFixed(1)}%` } })
        )
      )
    );

    const inclCell = h(
      'td',
      { className: 'num' },
      parsed.hasTiming ? formatMs(node.inclusiveTimeMs) : node.inclusiveCost.toFixed(1)
    );

    // Rows cell
    let rowsStr = formatCompactCount(node.totalPlanRows);
    let rowHeat = '';
    if (parsed.isAnalyze) {
      if (node.neverExecuted) {
        rowsStr = '0 / ' + formatCompactCount(node.totalPlanRows);
      } else {
        rowsStr = `${formatCompactCount(node.totalActualRows)} / ${formatCompactCount(node.totalPlanRows)}`;
        if (node.rowEstimateFactor >= 100 && (node.totalActualRows >= 100 || node.totalPlanRows >= 100)) {
          rowHeat = 'pgs-heat-2';
        } else if (node.rowEstimateFactor >= 10 && (node.totalActualRows >= 100 || node.totalPlanRows >= 100)) {
          rowHeat = 'pgs-heat-1';
        }
      }
    }
    const rowsCell = h('td', { className: `num ${rowHeat}` }, rowsStr);

    const loopsCell = h(
      'td',
      { className: 'num' },
      node.actualLoops !== undefined ? formatCompactCount(node.actualLoops) : '—'
    );

    // Buffers (self exclusive in IEC units, tooltip shows raw blocks)
    const exB = node.exclusiveBuffers;
    const exHitRead = exB.shared.hit + exB.shared.read + exB.local.hit + exB.local.read;
    const exTemp = exB.temp.read + exB.temp.written;
    const bufParts: string[] = [];
    if (exB.shared.hit > 0) bufParts.push(`${formatBlocks(exB.shared.hit)} hit`);
    if (exB.shared.read > 0) bufParts.push(`${formatBlocks(exB.shared.read)} read`);
    if (exTemp > 0) bufParts.push(`${formatBlocks(exTemp)} tmp`);
    if (exB.local.hit + exB.local.read > 0) bufParts.push(`${formatBlocks(exB.local.hit + exB.local.read)} loc`);
    const bufStr = bufParts.length > 0 ? bufParts.join(', ') : parsed.hasBuffers ? '0 B' : '—';
    const bufTip = `Self: hit=${exB.shared.hit} read=${exB.shared.read} dirtied=${exB.shared.dirtied} written=${exB.shared.written} temp_r=${exB.temp.read} temp_w=${exB.temp.written} blks | Total node: ${node.totalBufferBlocks} blks`;
    const bufCell = h(
      'td',
      { className: `num ${exB.shared.read >= 128 || exTemp > 0 ? 'pgs-heat-1' : ''}`, title: bufTip },
      exHitRead + exTemp > 0 ? bufStr : bufStr
    );

    // Flags
    const flags = getNodeFlags(node);
    const flagsCell = h(
      'td',
      null,
      h(
        'div',
        { className: 'pgs-btn-group' },
        ...flags.map((f) =>
          h(
            'span',
            { className: `pgs-pill ${f.tone !== 'neutral' ? `pgs-pill-${f.tone}` : ''}` },
            f.label
          )
        )
      )
    );

    const tr = h(
      'tr',
      {
        'data-node-id': node.id,
        className: [opts.selectedId === node.id ? 'selected' : '', dimmed ? 'dimmed' : '']
          .filter(Boolean)
          .join(' '),
      },
      h('td', { className: 'num' }, String(seq)),
      nodeCell,
      exclCell,
      inclCell,
      rowsCell,
      loopsCell,
      bufCell,
      flagsCell
    );
    tr.addEventListener('click', () => opts.onSelect(node.id));
    tbody.appendChild(tr);
  }

  return h('table', { className: 'pgs-table' }, thead, tbody);
}
