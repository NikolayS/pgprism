import type { MetricMode, ParsedExplain, PlanNode } from '../types';
import {
  formatBlocks,
  formatCompactCount,
  formatCount,
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
  metric: MetricMode;
  search: string;
  hotOnly: boolean;
  hideUnused: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export function renderTableView(parsed: ParsedExplain, opts: TableViewOpts): HTMLElement {
  const rows: Array<{ node: PlanNode; seq: number }> = [];
  let seqCounter = 1;

  const walk = (n: PlanNode) => {
    if (opts.hideUnused && n.neverExecuted) return;
    const seq = seqCounter++;
    rows.push({ node: n, seq });
    if (!opts.collapsed.has(n.id)) {
      for (const c of n.plans) walk(c);
    }
  };
  walk(parsed.plan);

  const isBufMetric = opts.metric === 'buffers' || opts.metric === 'diskReads';
  const isRowMetric = opts.metric === 'rows';
  const isInclMetric = opts.metric === 'inclusiveTime';
  const isTimeMetric = opts.metric === 'exclusiveTime' || opts.metric === 'ioTime' || opts.metric === 'cost';

  const thead = h(
    'thead',
    null,
    h(
      'tr',
      null,
      h('th', { className: 'num' }, '#'),
      h('th', null, 'Node'),
      h('th', { className: `num ${isBufMetric ? 'active-col' : ''}` }, opts.metric === 'diskReads' ? 'Disk reads' : 'Buffers (self / total)'),
      h('th', { className: `num ${isTimeMetric ? 'active-col' : ''}` }, parsed.hasTiming ? 'Excl. time' : 'Excl. cost'),
      h('th', { className: `num ${isInclMetric ? 'active-col' : ''}` }, parsed.hasTiming ? 'Incl. time' : 'Incl. cost'),
      h('th', { className: `num ${isRowMetric ? 'active-col' : ''}` }, parsed.isAnalyze ? 'Rows (act / est)' : 'Est. rows'),
      h('th', { className: 'num' }, 'Loops'),
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
            className: 'pgp-fold-btn',
            title: isCollapsed ? 'Expand subtree' : 'Collapse subtree',
            'aria-label': isCollapsed ? 'Expand subtree' : 'Collapse subtree',
          },
          isCollapsed ? '▸' : '▾'
        )
      : h('span', { className: 'pgp-fold-spacer' });

    if (hasChildren) {
      foldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onToggleCollapse(node.id);
      });
    }

    const indentPx = node.depth * 14;
    const preview = nodeQualPreview(node);
    const titleBits: Array<Node | string> = [];
    if (node.depth > 0) {
      titleBits.push(h('span', { className: 'pgp-depth-arrow' }, '->'));
    }
    if (node.subplanName) {
      titleBits.push(h('span', { className: 'pgp-pill pgp-pill-blue' }, node.subplanName));
    }
    titleBits.push(h('span', { className: 'pgp-node-title', title: node.displayTitle }, node.displayTitle));
    if (isCollapsed && hasChildren) {
      titleBits.push(h('span', { className: 'pgp-pill' }, `+${countDescendants(node)}`));
    }
    if (preview) {
      titleBits.push(h('span', { className: 'pgp-node-sub', title: preview }, preview));
    }

    const nodeCell = h(
      'td',
      null,
      h('div', { className: 'pgp-node-cell', style: indentPx ? { paddingLeft: `${indentPx}px` } : undefined }, foldBtn, ...titleBits)
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
    const hasSplitIo = parsed.hasTiming && parsed.effectiveTotalIoMs > 0 && node.exclusiveTimeMs > 0;
    const denomTime = parsed.effectiveTotalTimeMs || 1;
    const cpuBarPct = hasSplitIo ? Math.min(100, (node.exclusiveCpuMs / denomTime) * 100) : Math.min(100, exclPct);
    const ioBarPct = hasSplitIo ? Math.min(100 - cpuBarPct, (node.exclusiveIoMs / denomTime) * 100) : 0;
    const exclTip = hasSplitIo
      ? `Self CPU*: ${formatMs(node.exclusiveCpuMs)} · Self I/O: ${formatMs(node.exclusiveIoMs)}`
      : undefined;
    const ioNodePct = parsed.effectiveTotalIoMs > 0 ? Math.min(100, (node.exclusiveIoMs / parsed.effectiveTotalIoMs) * 100) : 0;
    const timeHeat =
      opts.metric === 'ioTime'
        ? heatClass(ioNodePct)
        : opts.metric === 'exclusiveTime' || opts.metric === 'cost'
          ? heatClass(exclPct)
          : '';
    const exclCell = h(
      'td',
      { className: `num ${timeHeat}`, title: exclTip },
      h(
        'div',
        { className: 'pgp-bar-wrap' },
        h('span', null, `${exclText}${parsed.hasTiming ? ` · ${exclPct.toFixed(0)}%` : ''}`),
        h(
          'div',
          { className: 'pgp-bar-track' },
          h('div', { className: 'pgp-bar-fill', style: { width: `${cpuBarPct.toFixed(1)}%` } }),
          ioBarPct > 0
            ? h('div', { className: 'pgp-bar-fill blue', style: { width: `${ioBarPct.toFixed(1)}%` } })
            : null
        )
      )
    );

    const inclPct = parsed.hasTiming && parsed.effectiveTotalTimeMs > 0 ? Math.min(100, (node.inclusiveTimeMs / parsed.effectiveTotalTimeMs) * 100) : 0;
    const inclCell = h(
      'td',
      { className: `num ${isInclMetric ? heatClass(inclPct) : ''}` },
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
        if (isRowMetric) {
          rowHeat = heatClass((node.totalActualRows / (parsed.maxNodeRows || 1)) * 100);
        } else if (node.rowEstimateFactor >= 100 && (node.totalActualRows >= 100 || node.totalPlanRows >= 100)) {
          rowHeat = 'pgp-heat-2';
        } else if (node.rowEstimateFactor >= 10 && (node.totalActualRows >= 100 || node.totalPlanRows >= 100)) {
          rowHeat = 'pgp-heat-1';
        }
      }
    }
    const rowsCell = h('td', { className: `num ${rowHeat}` }, rowsStr);

    const loops = node.actualLoops;
    const loopsTip =
      loops !== undefined && loops > 1 && node.actualTotalTime !== undefined
        ? `${formatCount(loops)} loops × ${formatMs(node.actualTotalTime)} avg`
        : undefined;
    const loopsCell = h(
      'td',
      { className: 'num', title: loopsTip },
      loops !== undefined ? formatCompactCount(loops) : '—',
      loops !== undefined && loops > 1 && node.actualTotalTime !== undefined
        ? h('span', { className: 'pgp-subval' }, `${formatMs(node.actualTotalTime)}/lp`)
        : null
    );

    // Buffers (first-class deterministic page work: self + % of total + 0-based heatbar + inclusive)
    const exB = node.exclusiveBuffers;
    const exTemp = exB.temp.read + exB.temp.written;
    const bufDenom = parsed.effectiveTotalBufferBlocks || parsed.maxNodeBufferBlocks || 0;
    const bufSelfPct = bufDenom > 0 ? Math.min(100, (node.exclusiveBufferBlocks / bufDenom) * 100) : 0;
    const diskDenom = parsed.effectiveTotalDiskBlocks || parsed.maxNodeDiskBlocks || 0;
    const diskSelfPct = diskDenom > 0 ? Math.min(100, (node.exclusiveDiskBlocks / diskDenom) * 100) : 0;

    const exHitDenom = exB.shared.hit + exB.shared.read;
    const selfHitStr = exHitDenom > 0 ? ` | Self hit: ${((exB.shared.hit / exHitDenom) * 100).toFixed(1)}%` : '';
    const bufTip = `Self: hit=${exB.shared.hit} read=${exB.shared.read} dirtied=${exB.shared.dirtied} written=${exB.shared.written} local=${exB.local.hit + exB.local.read} temp=${exTemp} blks${selfHitStr} | Total subtree: ${formatBlocks(node.totalBufferBlocks)} (${node.totalBufferBlocks} blks)`;

    const activeBufPct = opts.metric === 'diskReads' ? diskSelfPct : bufSelfPct;
    const activeBufBlocks = opts.metric === 'diskReads' ? node.exclusiveDiskBlocks : node.exclusiveBufferBlocks;
    const activeTotBlocks = opts.metric === 'diskReads' ? node.totalDiskBlocks : node.totalBufferBlocks;
    const bufHeat = isBufMetric
      ? heatClass(activeBufPct)
      : exB.shared.read >= 128 || exTemp > 0
        ? 'pgp-heat-1'
        : '';

    const bufSubParts: string[] = [];
    if (node.plans.length > 0 && activeTotBlocks !== activeBufBlocks) {
      bufSubParts.push(`incl ${formatBlocks(activeTotBlocks)}`);
    }
    if (exB.shared.read > 0 && opts.metric !== 'diskReads') bufSubParts.push(`${formatBlocks(exB.shared.read)} rd`);
    if (exTemp > 0) bufSubParts.push(`${formatBlocks(exTemp)} tmp`);

    const bufCell = parsed.hasBuffers
      ? h(
          'td',
          { className: `num ${bufHeat}`, title: bufTip },
          h(
            'div',
            { className: 'pgp-bar-wrap' },
            h(
              'span',
              null,
              activeBufBlocks > 0
                ? `${formatBlocks(activeBufBlocks)} · ${activeBufPct.toFixed(0)}%`
                : '0 B'
            ),
            h(
              'div',
              { className: 'pgp-bar-track' },
              h('div', {
                className: `pgp-bar-fill ${opts.metric === 'diskReads' ? '' : 'blue'}`,
                style: { width: `${activeBufPct.toFixed(1)}%` },
              })
            ),
            bufSubParts.length > 0 ? h('span', { className: 'pgp-subval' }, bufSubParts.join(' · ')) : null
          )
        )
      : h('td', { className: 'num' }, '—');

    // Flags
    const flags = getNodeFlags(node);
    const flagsCell = h(
      'td',
      null,
      h(
        'div',
        { className: 'pgp-btn-group' },
        ...flags.map((f) =>
          h(
            'span',
            { className: `pgp-pill ${f.tone !== 'neutral' ? `pgp-pill-${f.tone}` : ''}` },
            f.label
          )
        )
      )
    );

    const tr = h(
      'tr',
      {
        'data-node-id': node.id,
        className: [
          opts.selectedId === node.id ? 'selected' : '',
          dimmed ? 'dimmed' : '',
          node.neverExecuted ? 'never-exec' : '',
        ]
          .filter(Boolean)
          .join(' '),
      },
      h('td', { className: 'num' }, String(seq)),
      nodeCell,
      bufCell,
      exclCell,
      inclCell,
      rowsCell,
      loopsCell,
      flagsCell
    );
    tr.addEventListener('click', () => opts.onSelect(node.id));
    tbody.appendChild(tr);
  }

  return h('table', { className: 'pgp-table' }, thead, tbody);
}
