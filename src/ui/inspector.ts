import { formatNodeForLLM } from '../format-llm';
import type { BufferStats, Diagnostic, ParsedExplain, PlanNode } from '../types';
import {
  formatBlocks,
  formatBytes,
  formatCount,
  formatFactor,
  formatKbAsIec,
  formatMs,
  sumBufferBlocks,
} from '../units';
import { attachCopyAction, h } from './dom';

function kvSection(title: string, rows: Array<[string, string | undefined | null]>): HTMLElement | null {
  const valid = rows.filter((r): r is [string, string] => r[1] !== undefined && r[1] !== null && r[1] !== '');
  if (valid.length === 0) return null;
  const grid = h('div', { className: 'pgp-kv' });
  for (const [k, v] of valid) {
    grid.appendChild(h('span', { className: 'pgp-k' }, k));
    grid.appendChild(h('span', { className: 'pgp-v' }, v));
  }
  return h('div', { className: 'pgp-insp-sec' }, h('div', { className: 'pgp-insp-sec-title' }, title), grid);
}

function formatBufPair(blocks: number): string | undefined {
  if (blocks <= 0) return undefined;
  return `${formatBlocks(blocks)} (${blocks.toLocaleString('en-US')} blks)`;
}

function bufferRows(label: string, b: BufferStats): Array<[string, string | undefined]> {
  const rows: Array<[string, string | undefined]> = [
    [`${label} shared hit`, formatBufPair(b.shared.hit)],
    [`${label} shared read`, formatBufPair(b.shared.read)],
    [`${label} shared dirtied`, formatBufPair(b.shared.dirtied)],
    [`${label} shared written`, formatBufPair(b.shared.written)],
    [`${label} local hit`, formatBufPair(b.local.hit)],
    [`${label} local read`, formatBufPair(b.local.read)],
    [`${label} local dirtied`, formatBufPair(b.local.dirtied)],
    [`${label} local written`, formatBufPair(b.local.written)],
    [`${label} temp read`, formatBufPair(b.temp.read)],
    [`${label} temp written`, formatBufPair(b.temp.written)],
  ];
  return rows;
}

function findParent(root: PlanNode, targetId: string): PlanNode | null {
  for (const c of root.plans) {
    if (c.id === targetId) return root;
    const nested = findParent(c, targetId);
    if (nested) return nested;
  }
  return null;
}

function findReferencedSubplans(parsed: ParsedExplain, node: PlanNode): Array<{ label: string; nodeId: string }> {
  const out: Array<{ label: string; nodeId: string }> = [];
  const seen = new Set<string>();
  const addRef = (label: string) => {
    const id = parsed.subplanTargets[label];
    if (id && id !== node.id && !seen.has(id)) {
      seen.add(id);
      out.push({ label, nodeId: id });
    }
  };
  if (node.cteName && node.nodeType === 'CTE Scan') {
    addRef(`CTE ${node.cteName}`);
  }
  const fields = [
    node.filter,
    node.indexCond,
    node.hashCond,
    node.mergeCond,
    node.recheckCond,
    node.joinFilter,
    node.oneTimeFilter,
    node.runCondition,
    node.output?.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
  const re = /\b((?:InitPlan|SubPlan)\s+\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fields)) !== null) {
    addRef(m[1]!);
  }
  return out;
}

export function renderInspector(
  parsed: ParsedExplain,
  node: PlanNode,
  onClose: () => void,
  onSelectNode: (id: string) => void,
  diagnostics: Diagnostic[] = []
): HTMLElement {
  const wrap = h('aside', { className: 'pgp-inspector', 'aria-label': 'Node inspector' });

  const copyNodeBtn = h(
    'button',
    { type: 'button', className: 'pgp-btn pgp-btn-sm', title: 'Copy node Markdown summary for coding agents' },
    'Copy node'
  );
  attachCopyAction(copyNodeBtn, () => formatNodeForLLM(parsed, node, diagnostics), 'Copy node');
  const closeBtn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm', title: 'Close inspector' }, 'Close');
  closeBtn.addEventListener('click', onClose);

  const subBits: string[] = [node.nodeType];
  if (node.parentRelationship) subBits.push(node.parentRelationship);
  if (node.subplanName) subBits.push(node.subplanName);
  if (node.disabled) subBits.push('Disabled');

  wrap.appendChild(
    h(
      'div',
      { className: 'pgp-insp-head' },
      h(
        'div',
        null,
        h('div', { className: 'pgp-insp-title' }, node.displayTitle),
        h('div', { className: 'pgp-insp-sub' }, subBits.join(' / '))
      ),
      h('div', { className: 'pgp-btn-group' }, copyNodeBtn, closeBtn)
    )
  );

  // Timing & Cost
  const hasIoSplit = parsed.hasTiming && parsed.effectiveTotalIoMs > 0;
  const timingSec = kvSection('Timing and cost', [
    ['Exclusive time', parsed.hasTiming ? `${formatMs(node.exclusiveTimeMs)} (${node.pctExclusiveTime.toFixed(1)}%)` : undefined],
    ['CPU* (self, est.)', hasIoSplit ? formatMs(node.exclusiveCpuMs) : undefined],
    ['I/O (self)', hasIoSplit ? formatMs(node.exclusiveIoMs) : undefined],
    ['Inclusive time', parsed.hasTiming ? `${formatMs(node.inclusiveTimeMs)} (${node.pctExecutionTime.toFixed(1)}%)` : undefined],
    ['Per loop', node.actualTotalTime !== undefined ? `${formatMs(node.actualStartupTime)} .. ${formatMs(node.actualTotalTime)}` : undefined],
    [
      'Loops × avg',
      node.actualLoops !== undefined && node.actualLoops > 1 && node.actualTotalTime !== undefined
        ? `${formatCount(node.actualLoops)} × ${formatMs(node.actualTotalTime)}`
        : undefined,
    ],
    ['Loops', node.actualLoops !== undefined && (node.actualLoops <= 1 || node.actualTotalTime === undefined) ? formatCount(node.actualLoops) : undefined],
    ['Cost (startup..total)', node.totalCost !== undefined ? `${(node.startupCost ?? 0).toFixed(2)} .. ${node.totalCost.toFixed(2)}` : undefined],
    ['Exclusive cost', parsed.hasCosts ? node.exclusiveCost.toFixed(2) : undefined],
    ['Row width', node.planWidth !== undefined ? `${node.planWidth} B` : undefined],
  ]);
  if (timingSec) wrap.appendChild(timingSec);

  // Rows & Misestimation
  const estDir =
    node.rowEstimateDirection === 'exact'
      ? 'Exact'
      : `${node.rowEstimateDirection === 'under' ? 'Underestimated' : 'Overestimated'} ${formatFactor(node.rowEstimateFactor)}`;
  const rowsSec = kvSection('Rows and filtering', [
    ['Actual rows / loop', node.actualRows !== undefined ? formatCount(node.actualRows) : undefined],
    ['Total actual rows', parsed.isAnalyze ? formatCount(node.totalActualRows) : undefined],
    ['Planned rows / loop', node.planRows !== undefined ? formatCount(node.planRows) : undefined],
    ['Total planned rows', node.planRows !== undefined ? formatCount(node.totalPlanRows) : undefined],
    ['Estimate accuracy', parsed.isAnalyze && !node.neverExecuted ? estDir : undefined],
    ['Rows removed (filter)', node.rowsRemovedByFilter ? `${formatCount(node.rowsRemovedByFilter)} / loop` : undefined],
    ['Rows removed (join)', node.rowsRemovedByJoinFilter ? `${formatCount(node.rowsRemovedByJoinFilter)} / loop` : undefined],
    ['Rows removed (recheck)', node.rowsRemovedByIndexRecheck ? `${formatCount(node.rowsRemovedByIndexRecheck)} / loop` : undefined],
    ['Rows removed (conflict)', node.rowsRemovedByConflictFilter ? `${formatCount(node.rowsRemovedByConflictFilter)} / loop` : undefined],
  ]);
  if (rowsSec) wrap.appendChild(rowsSec);

  // Buffers & I/O
  const exShared = node.exclusiveBuffers.shared.hit + node.exclusiveBuffers.shared.read;
  const selfHitPct = exShared > 0 ? `${((node.exclusiveBuffers.shared.hit / exShared) * 100).toFixed(1)}%` : undefined;
  const totalShared = node.buffers.shared.hit + node.buffers.shared.read;
  const hitPct = totalShared > 0 ? `${((node.buffers.shared.hit / totalShared) * 100).toFixed(1)}%` : undefined;
  const bufRows: Array<[string, string | undefined]> = [
    ['Self hit ratio', selfHitPct],
    ['Subtree hit ratio', node.plans.length > 0 && totalShared !== exShared ? hitPct : undefined],
    ...bufferRows('Self', node.exclusiveBuffers),
  ];
  if (node.plans.length > 0 && sumBufferBlocks(node.buffers) !== sumBufferBlocks(node.exclusiveBuffers)) {
    bufRows.push(...bufferRows('Total', node.buffers));
  }
  if (node.ioTimings) {
    const io = node.ioTimings;
    if (io.sharedReadMs) bufRows.push(['Shared I/O read', formatMs(io.sharedReadMs)]);
    if (io.sharedWriteMs) bufRows.push(['Shared I/O write', formatMs(io.sharedWriteMs)]);
    if (io.localReadMs) bufRows.push(['Local I/O read', formatMs(io.localReadMs)]);
    if (io.localWriteMs) bufRows.push(['Local I/O write', formatMs(io.localWriteMs)]);
    if (io.tempReadMs) bufRows.push(['Temp I/O read', formatMs(io.tempReadMs)]);
    if (io.tempWriteMs) bufRows.push(['Temp I/O write', formatMs(io.tempWriteMs)]);
    if (io.readMs) bufRows.push(['I/O read', formatMs(io.readMs)]);
    if (io.writeMs) bufRows.push(['I/O write', formatMs(io.writeMs)]);
  }
  const bufSec = kvSection('Buffers and I/O (8 KiB blocks)', bufRows);
  if (bufSec) wrap.appendChild(bufSec);

  // Operator-specific details
  const opRows: Array<[string, string | undefined]> = [
    ['Disabled (PG 18+)', node.disabled ? 'true' : undefined],
    ['Replaces (PG 19+)', node.replaces],
    ['Heap fetches', node.heapFetches !== undefined ? formatCount(node.heapFetches) : undefined],
    ['Index searches', node.indexSearches !== undefined ? formatCount(node.indexSearches) : undefined],
    ['Exact heap blocks', node.exactHeapBlocks !== undefined ? `${formatCount(node.exactHeapBlocks)} (${formatBlocks(node.exactHeapBlocks)})` : undefined],
    ['Lossy heap blocks', node.lossyHeapBlocks !== undefined ? `${formatCount(node.lossyHeapBlocks)} (${formatBlocks(node.lossyHeapBlocks)})` : undefined],
    ['Sort method', node.sortMethod],
    ['Sort space', node.sortSpaceType ? `${node.sortSpaceType} (${formatKbAsIec(node.sortSpaceUsedKb ?? 0)})` : undefined],
    ['Estimated groups', node.estimatedGroups !== undefined ? formatCount(node.estimatedGroups) : undefined],
    ['Hash buckets', node.hashBuckets ? `${formatCount(node.hashBuckets)}${node.originalHashBuckets && node.originalHashBuckets !== node.hashBuckets ? ` (orig ${formatCount(node.originalHashBuckets)})` : ''}` : undefined],
    ['Hash batches', node.hashBatches ? `${formatCount(node.hashBatches)}${node.originalHashBatches && node.originalHashBatches !== node.hashBatches ? ` (orig ${formatCount(node.originalHashBatches)})` : ''}` : undefined],
    ['HashAgg batches', node.hashAggBatches ? formatCount(node.hashAggBatches) : undefined],
    ['Planned partitions', node.plannedPartitions ? formatCount(node.plannedPartitions) : undefined],
    ['Peak memory', node.peakMemoryUsageKb ? formatKbAsIec(node.peakMemoryUsageKb) : undefined],
    ['Disk usage', node.diskUsageKb ? formatKbAsIec(node.diskUsageKb) : undefined],
    ['Storage (PG 18+)', node.storage ? `${node.storage} (max ${formatKbAsIec(node.maximumStorageKb ?? 0)})` : undefined],
    ['Cache mode', node.cacheMode],
    ['Cache hits / misses', node.cacheHits !== undefined || node.cacheMisses !== undefined ? `${formatCount(node.cacheHits ?? 0)} / ${formatCount(node.cacheMisses ?? 0)}` : undefined],
    ['Cache evictions / overflows', (node.cacheEvictions ?? 0) > 0 || (node.cacheOverflows ?? 0) > 0 ? `${formatCount(node.cacheEvictions ?? 0)} / ${formatCount(node.cacheOverflows ?? 0)}` : undefined],
    ['Memoize est. capacity', node.estimatedCapacity !== undefined ? formatCount(node.estimatedCapacity) : undefined],
    ['Memoize est. hit %', node.estimatedHitPercent !== undefined ? `${node.estimatedHitPercent.toFixed(2)}%` : undefined],
    ['Workers planned / launched', node.workersPlanned !== undefined ? `${node.workersPlanned} / ${node.workersLaunched ?? 0}` : undefined],
    ['Subplans removed', node.subplansRemoved ? formatCount(node.subplansRemoved) : undefined],
    ['Conflict resolution', node.conflictResolution],
    ['Tuples inserted / conflicting', node.tuplesInserted !== undefined ? `${formatCount(node.tuplesInserted)} / ${formatCount(node.conflictingTuples ?? 0)}` : undefined],
  ];
  if (node.fullSortGroups) {
    const g = node.fullSortGroups;
    const sp = g.diskPeakKb ? `Disk peak ${formatKbAsIec(g.diskPeakKb)}` : g.memoryPeakKb ? `Mem peak ${formatKbAsIec(g.memoryPeakKb)}` : '';
    opRows.push(['Full-sort groups', `${formatCount(g.groupCount)} (${g.sortMethodsUsed.join(', ')}) ${sp}`.trim()]);
  }
  if (node.presortedGroups) {
    const g = node.presortedGroups;
    const sp = g.diskPeakKb ? `Disk peak ${formatKbAsIec(g.diskPeakKb)}` : g.memoryPeakKb ? `Mem peak ${formatKbAsIec(g.memoryPeakKb)}` : '';
    opRows.push(['Pre-sorted groups', `${formatCount(g.groupCount)} (${g.sortMethodsUsed.join(', ')}) ${sp}`.trim()]);
  }
  if (node.wal && (node.wal.records > 0 || node.wal.bytes > 0 || (node.wal.buffersFull ?? 0) > 0)) {
    const w = node.wal;
    opRows.push([
      'WAL',
      `${formatCount(w.records)} recs, ${formatCount(w.fpi)} FPI, ${formatBytes(w.bytes)} (${w.bytes.toLocaleString('en-US')} B)${w.fpiBytes ? `, FPI ${formatBytes(w.fpiBytes)}` : ''}${w.buffersFull ? `, buffers full ${w.buffersFull}` : ''}`,
    ]);
  }
  if (node.ioPrefetch) {
    const p = node.ioPrefetch;
    if (p.avgPrefetchDistance !== undefined) {
      opRows.push(['Prefetch distance', `avg ${p.avgPrefetchDistance.toFixed(2)} / max ${p.maxPrefetchDistance ?? 0} (cap ${p.prefetchCapacity ?? 0})`]);
    }
    if (p.ioCount !== undefined && p.ioCount > 0) {
      opRows.push(['Prefetch I/O', `${formatCount(p.ioCount)} I/Os, ${formatCount(p.ioWaits ?? 0)} waits, avg ${(p.avgIoSize ?? 0).toFixed(2)} blks`]);
    }
  }
  const opSec = kvSection('Operator details', opRows);
  if (opSec) wrap.appendChild(opSec);

  // Workers table
  if (node.workers && node.workers.length > 0) {
    const tbl = h(
      'table',
      { className: 'pgp-worker-tbl' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'Worker'),
          h('th', null, 'Time'),
          h('th', null, 'Rows'),
          h('th', null, 'Buffers')
        )
      ),
      h(
        'tbody',
        null,
        ...node.workers.map((w) => {
          const wb = w.buffers ? formatBlocks(sumBufferBlocks(w.buffers)) : '—';
          return h(
            'tr',
            null,
            h('td', null, `#${w.workerNumber}`),
            h('td', null, formatMs(w.actualTotalTime)),
            h('td', null, w.actualRows !== undefined ? formatCount(w.actualRows) : '—'),
            h('td', null, wb)
          );
        })
      )
    );
    wrap.appendChild(
      h('div', { className: 'pgp-insp-sec' }, h('div', { className: 'pgp-insp-sec-title' }, 'Parallel workers'), tbl)
    );
  }

  // Expressions & keys
  const exprPairs: Array<[string, string | undefined]> = [
    ['Index Cond', node.indexCond],
    ['Hash Cond', node.hashCond],
    ['Merge Cond', node.mergeCond],
    ['Recheck Cond', node.recheckCond],
    ['TID Cond', node.tidCond],
    ['Join Filter', node.joinFilter],
    ['Filter', node.filter],
    ['One-Time Filter', node.oneTimeFilter],
    ['Window', node.windowDef],
    ['Run Condition', node.runCondition],
    ['Cache Key', node.cacheKey],
    ['Sort Key', node.sortKey?.join(', ')],
    ['Presorted Key', node.presortedKey?.join(', ')],
    ['Group Key', node.groupKey?.join(', ')],
    ['Function Call', node.functionCall ?? node.tableFunctionCall],
    ['Output', node.output?.join(', ')],
  ].filter((x): x is [string, string] => Boolean(x[1]));

  if (exprPairs.length > 0) {
    const sec = h('div', { className: 'pgp-insp-sec' }, h('div', { className: 'pgp-insp-sec-title' }, 'Keys and conditions'));
    for (const [k, v] of exprPairs) {
      sec.appendChild(h('div', { className: 'pgp-k', style: { marginTop: '5px' } }, k));
      sec.appendChild(h('div', { className: 'pgp-expr' }, v));
    }
    wrap.appendChild(sec);
  }

  // Parent / SubPlan / CTE navigation & Children quick links
  const parent = findParent(parsed.plan, node.id);
  const refs = findReferencedSubplans(parsed, node);
  if (parent || refs.length > 0 || node.plans.length > 0) {
    const sec = h('div', { className: 'pgp-insp-sec' }, h('div', { className: 'pgp-insp-sec-title' }, 'Plan links'));
    const list = h('div', { className: 'pgp-btn-group' });
    if (parent) {
      const pBtn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm' }, `↑ ${parent.displayTitle}`);
      pBtn.addEventListener('click', () => onSelectNode(parent.id));
      list.appendChild(pBtn);
    }
    for (const r of refs) {
      const rBtn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm' }, `-> ${r.label}`);
      rBtn.addEventListener('click', () => onSelectNode(r.nodeId));
      list.appendChild(rBtn);
    }
    for (const ch of node.plans) {
      const btn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm' }, ch.displayTitle);
      btn.addEventListener('click', () => onSelectNode(ch.id));
      list.appendChild(btn);
    }
    sec.appendChild(list);
    wrap.appendChild(sec);
  }

  return wrap;
}
