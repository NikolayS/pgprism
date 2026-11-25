import type { MetricMode, ParsedExplain, PlanNode } from '../types';
import { formatBlocks, formatCompactCount, formatMs } from '../units';
import { h } from './dom';
import { nodeMatchesSearch } from './metrics';

export interface FlameViewOpts {
  selectedId: string | null;
  metric: MetricMode;
  search: string;
  hotOnly: boolean;
  hideUnused: boolean;
  onSelect: (id: string) => void;
}

interface FlameSpan {
  node: PlanNode;
  startPct: number;
  widthPct: number;
  selfStartPct: number;
  selfWidthPct: number;
  label: string;
  tip: string;
}

export function renderFlameView(parsed: ParsedExplain, opts: FlameViewOpts): HTMLElement {
  const wrap = h('div', { className: 'pgp-flame-wrap' });
  const q = opts.search.trim().toLowerCase();

  const useTime = opts.metric === 'exclusiveTime' || opts.metric === 'inclusiveTime';
  const denom = useTime
    ? parsed.effectiveTotalTimeMs || 1
    : opts.metric === 'buffers'
      ? parsed.effectiveTotalBufferBlocks || parsed.maxNodeBufferBlocks || 1
      : opts.metric === 'diskReads'
        ? parsed.effectiveTotalDiskBlocks || parsed.maxNodeDiskBlocks || 1
        : opts.metric === 'ioTime'
          ? parsed.effectiveTotalIoMs || parsed.maxNodeIoMs || 1
          : opts.metric === 'rows'
            ? parsed.maxNodeRows || 1
            : parsed.effectiveTotalCost || parsed.maxNodeCost || 1;

  const spans: FlameSpan[] = [];

  const valFor = (n: PlanNode): { incl: number; excl: number; txt: string; tip: string } => {
    if (useTime) {
      const pct = Math.min(100, (n.inclusiveTimeMs / denom) * 100);
      return {
        incl: n.inclusiveTimeMs,
        excl: n.exclusiveTimeMs,
        txt: parsed.hasTiming ? `${formatMs(n.exclusiveTimeMs)} (${pct.toFixed(0)}%)` : '—',
        tip: parsed.hasTiming ? `Self: ${formatMs(n.exclusiveTimeMs)} · Total: ${formatMs(n.inclusiveTimeMs)} (${pct.toFixed(1)}%)` : '',
      };
    }
    if (opts.metric === 'buffers') {
      const pct = parsed.effectiveTotalBufferBlocks > 0 ? (n.totalBufferBlocks / denom) * 100 : 0;
      return {
        incl: n.totalBufferBlocks,
        excl: n.exclusiveBufferBlocks,
        txt: parsed.hasBuffers ? `${formatBlocks(n.exclusiveBufferBlocks)} (${pct.toFixed(0)}%)` : '—',
        tip: `Self: ${formatBlocks(n.exclusiveBufferBlocks)} · Subtree: ${formatBlocks(n.totalBufferBlocks)} (${pct.toFixed(1)}%)`,
      };
    }
    if (opts.metric === 'diskReads') {
      const hasDisk = parsed.effectiveTotalDiskBlocks > 0 || parsed.maxNodeDiskBlocks > 0;
      const pct = hasDisk ? (n.totalDiskBlocks / denom) * 100 : 0;
      return {
        incl: n.totalDiskBlocks,
        excl: n.exclusiveDiskBlocks,
        txt: n.totalDiskBlocks > 0 ? `${formatBlocks(n.exclusiveDiskBlocks)} (${pct.toFixed(0)}%)` : '0 B',
        tip: `Self disk+temp: ${formatBlocks(n.exclusiveDiskBlocks)} · Subtree: ${formatBlocks(n.totalDiskBlocks)} (${pct.toFixed(1)}%)`,
      };
    }
    if (opts.metric === 'ioTime') {
      const tot = (n.ioTimings?.totalReadMs ?? 0) + (n.ioTimings?.totalWriteMs ?? 0);
      const pct = parsed.effectiveTotalIoMs > 0 ? (tot / denom) * 100 : 0;
      return {
        incl: tot,
        excl: n.exclusiveIoMs,
        txt: tot > 0 ? `${formatMs(n.exclusiveIoMs)} (${pct.toFixed(0)}%)` : '—',
        tip: tot > 0 ? `Self I/O: ${formatMs(n.exclusiveIoMs)} · Subtree: ${formatMs(tot)} (${pct.toFixed(1)}%)` : '',
      };
    }
    if (opts.metric === 'rows') {
      return {
        incl: n.totalActualRows,
        excl: n.totalActualRows,
        txt: formatCompactCount(n.totalActualRows),
        tip: `${formatCompactCount(n.totalActualRows)} actual rows`,
      };
    }
    return {
      incl: n.inclusiveCost,
      excl: n.exclusiveCost,
      txt: `${n.exclusiveCost.toFixed(0)} / ${n.inclusiveCost.toFixed(0)}`,
      tip: `Self cost: ${n.exclusiveCost.toFixed(2)} · Total cost: ${n.inclusiveCost.toFixed(2)}`,
    };
  };

  const walk = (node: PlanNode, offsetPct: number) => {
    if (opts.hideUnused && node.neverExecuted) return;
    const v = valFor(node);
    const widthPct = Math.max(0, Math.min(100 - offsetPct, (v.incl / denom) * 100));
    const selfWidthPct = Math.max(0, Math.min(widthPct, (v.excl / denom) * 100));

    // Place self-work at the end of this node's span when it has children (bottom-up pipeline completion)
    let cursor = offsetPct;
    const childSpans: Array<{ child: PlanNode; start: number }> = [];
    for (const ch of node.plans) {
      const chVal = valFor(ch);
      const chPct = Math.max(0, Math.min(widthPct - (cursor - offsetPct), (chVal.incl / denom) * 100));
      childSpans.push({ child: ch, start: cursor });
      if (opts.metric !== 'rows') cursor += chPct;
    }

    const selfStartPct =
      opts.metric === 'rows'
        ? 0
        : Math.max(offsetPct, Math.min(offsetPct + widthPct - selfWidthPct, cursor));

    spans.push({
      node,
      startPct: opts.metric === 'rows' ? 0 : offsetPct,
      widthPct,
      selfStartPct,
      selfWidthPct,
      label: v.txt,
      tip: v.tip,
    });

    for (const cs of childSpans) {
      walk(cs.child, cs.start);
    }
  };

  walk(parsed.plan, 0);

  const hasAxis =
    useTime
      ? parsed.effectiveTotalTimeMs > 0
      : opts.metric === 'buffers'
        ? parsed.effectiveTotalBufferBlocks > 0
        : opts.metric === 'diskReads'
          ? parsed.effectiveTotalDiskBlocks > 0
          : opts.metric === 'ioTime'
            ? parsed.effectiveTotalIoMs > 0
            : true;

  const axisEnd = !hasAxis
    ? '0'
    : useTime
      ? formatMs(parsed.effectiveTotalTimeMs)
      : opts.metric === 'buffers' || opts.metric === 'diskReads'
        ? formatBlocks(denom)
        : opts.metric === 'ioTime'
          ? formatMs(denom)
          : opts.metric === 'rows'
            ? `${formatCompactCount(denom)} rows`
            : denom.toFixed(0);

  const metricNoun =
    useTime
      ? 'time'
      : opts.metric === 'buffers'
        ? 'buffers'
        : opts.metric === 'diskReads'
          ? 'disk reads'
          : opts.metric === 'ioTime'
            ? 'I/O time'
            : opts.metric === 'rows'
              ? 'rows'
              : 'cost';

  wrap.appendChild(
    h(
      'div',
      { className: 'pgp-flame-axis' },
      h('span', null, `Plan node (orange = self ${metricNoun}, grey = subtree)`),
      h(
        'div',
        { className: 'pgp-flame-ticks' },
        h('span', null, '0'),
        h('span', null, '50%'),
        h('span', null, axisEnd)
      ),
      h('span', { style: { textAlign: 'right' } }, 'Self (subtree %)')
    )
  );

  for (const sp of spans) {
    const { node } = sp;
    const match = nodeMatchesSearch(node, q);
    const dimHot = opts.hotOnly && !parsed.hotPathIds.has(node.id);
    const dimmed = (q !== '' && !match) || dimHot;

    const track = h(
      'div',
      { className: 'pgp-flame-track' },
      sp.widthPct > 0
        ? h('div', {
            className: 'pgp-flame-incl',
            style: { left: `${sp.startPct.toFixed(2)}%`, width: `${Math.max(0.4, sp.widthPct).toFixed(2)}%` },
          })
        : null,
      sp.selfWidthPct > 0
        ? h('div', {
            className: 'pgp-flame-excl',
            style: { left: `${sp.selfStartPct.toFixed(2)}%`, width: `${Math.max(0.4, sp.selfWidthPct).toFixed(2)}%` },
          })
        : null
    );

    const lbl = h(
      'div',
      {
        className: 'pgp-flame-lbl',
        style: node.depth > 0 ? { paddingLeft: `${node.depth * 12}px` } : undefined,
        title: node.displayTitle,
      },
      node.depth > 0 ? h('span', { style: { color: 'var(--pgp-ink-faint)' } }, '->') : null,
      node.subplanName ? h('span', { className: 'pgp-pill pgp-pill-blue' }, node.subplanName) : null,
      h('span', { className: 'pgp-node-title' }, node.displayTitle)
    );

    const row = h(
      'div',
      {
        'data-node-id': node.id,
        className: [
          'pgp-flame-row',
          opts.selectedId === node.id ? 'selected' : '',
          dimmed ? 'dimmed' : '',
          node.neverExecuted ? 'never-exec' : '',
        ]
          .filter(Boolean)
          .join(' '),
      },
      lbl,
      track,
      h('div', { className: 'pgp-flame-val', title: sp.tip }, sp.label)
    );
    row.addEventListener('click', () => opts.onSelect(node.id));
    wrap.appendChild(row);
  }

  return wrap;
}
