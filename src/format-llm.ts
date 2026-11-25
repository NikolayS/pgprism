import { analyzePlan } from './diagnostics';
import { parsedToText } from './json-to-text';
import type { Diagnostic, FormatForLLMOptions, ParsedExplain, PlanNode } from './types';
import {
  formatBlocks,
  formatBytes,
  formatCount,
  formatFactor,
  formatKbAsIec,
  formatMs,
  sumBufferBlocks,
} from './units';

function findNodePath(root: PlanNode, targetId: string, trail: PlanNode[] = []): PlanNode[] | null {
  const next = [...trail, root];
  if (root.id === targetId) return next;
  for (const c of root.plans) {
    const found = findNodePath(c, targetId, next);
    if (found) return found;
  }
  return null;
}

function sumPlanWal(root: PlanNode): { records: number; fpi: number; bytes: number } {
  const acc = { records: 0, fpi: 0, bytes: 0 };
  const walk = (n: PlanNode) => {
    if (n.wal) {
      acc.records += n.wal.records;
      acc.fpi += n.wal.fpi;
      acc.bytes += n.wal.bytes;
    }
    for (const c of n.plans) walk(c);
  };
  walk(root);
  return acc;
}

function hitPct(hit: number, read: number): string | undefined {
  const tot = hit + read;
  return tot > 0 ? `${((hit / tot) * 100).toFixed(1)}%` : undefined;
}

function fmtBufLine(b: PlanNode['buffers']): string {
  const parts: string[] = [];
  if (b.shared.hit) parts.push(`hit ${formatBlocks(b.shared.hit)}`);
  if (b.shared.read) parts.push(`read ${formatBlocks(b.shared.read)}`);
  if (b.shared.dirtied) parts.push(`dirtied ${formatBlocks(b.shared.dirtied)}`);
  if (b.shared.written) parts.push(`written ${formatBlocks(b.shared.written)}`);
  if (b.local.hit + b.local.read) parts.push(`local ${formatBlocks(b.local.hit + b.local.read)}`);
  if (b.temp.read) parts.push(`temp read ${formatBlocks(b.temp.read)}`);
  if (b.temp.written) parts.push(`temp written ${formatBlocks(b.temp.written)}`);
  return parts.length > 0 ? parts.join(', ') : '0 B';
}

export function formatNodeForLLM(
  parsed: ParsedExplain,
  node: PlanNode,
  diagnostics: Diagnostic[] = []
): string {
  const path = findNodePath(parsed.plan, node.id) ?? [node];
  const out: string[] = [];
  out.push(`### Node: ${node.displayTitle}`);
  out.push(`- Path: ${path.map((n) => n.displayTitle).join(' -> ')}`);

  const meta = [node.nodeType, node.parentRelationship, node.subplanName, node.disabled ? 'Disabled: true' : '']
    .filter(Boolean)
    .join(' | ');
  if (meta) out.push(`- Role: ${meta}`);

  if (parsed.hasTiming) {
    const split =
      parsed.effectiveTotalIoMs > 0
        ? ` (CPU* ${formatMs(node.exclusiveCpuMs)}, I/O ${formatMs(node.exclusiveIoMs)})`
        : '';
    out.push(
      `- Time: self ${formatMs(node.exclusiveTimeMs)} (${node.pctExclusiveTime.toFixed(1)}%)${split}; subtree ${formatMs(node.inclusiveTimeMs)} (${node.pctExecutionTime.toFixed(1)}%); loops ${formatCount(node.actualLoops ?? 0)}${(node.actualLoops ?? 0) > 1 && node.actualTotalTime !== undefined ? ` × ${formatMs(node.actualTotalTime)} avg` : ''}`
    );
  }
  if (parsed.hasCosts && node.totalCost !== undefined) {
    out.push(`- Cost: ${(node.startupCost ?? 0).toFixed(2)}..${node.totalCost.toFixed(2)} (self ${node.exclusiveCost.toFixed(2)})`);
  }
  if (parsed.isAnalyze && !node.neverExecuted) {
    const dir =
      node.rowEstimateDirection === 'exact'
        ? 'exact'
        : `${node.rowEstimateDirection === 'under' ? 'under' : 'over'}estimated ${formatFactor(node.rowEstimateFactor)}`;
    out.push(`- Rows: actual ${formatCount(node.totalActualRows)} vs est ${formatCount(node.totalPlanRows)} (${dir})`);
  } else if (node.neverExecuted) {
    out.push(`- Execution: never executed (est ${formatCount(node.totalPlanRows)} rows)`);
  }

  if (parsed.hasBuffers || sumBufferBlocks(node.buffers) > 0) {
    const sh = hitPct(node.exclusiveBuffers.shared.hit, node.exclusiveBuffers.shared.read);
    out.push(`- Buffers (self): ${fmtBufLine(node.exclusiveBuffers)}${sh ? ` (${sh} hit)` : ''}`);
    if (node.plans.length > 0 && node.totalBufferBlocks !== node.exclusiveBufferBlocks) {
      out.push(`- Buffers (subtree): ${fmtBufLine(node.buffers)}`);
    }
  }

  const extraStats: string[] = [];
  if (node.heapFetches !== undefined) extraStats.push(`heap fetches ${formatCount(node.heapFetches)}`);
  if (node.indexSearches !== undefined) extraStats.push(`index searches ${formatCount(node.indexSearches)}`);
  if (node.exactHeapBlocks !== undefined || node.lossyHeapBlocks !== undefined) {
    extraStats.push(`heap blocks exact=${node.exactHeapBlocks ?? 0} lossy=${node.lossyHeapBlocks ?? 0}`);
  }
  if (node.sortMethod) extraStats.push(`sort ${node.sortMethod} (${node.sortSpaceType ?? 'Memory'} ${formatKbAsIec(node.sortSpaceUsedKb ?? 0)})`);
  if (node.hashBatches) extraStats.push(`hash buckets=${node.hashBuckets ?? 0} batches=${node.hashBatches} mem=${formatKbAsIec(node.peakMemoryUsageKb ?? 0)}`);
  if (node.diskUsageKb) extraStats.push(`disk=${formatKbAsIec(node.diskUsageKb)}`);
  if (node.cacheHits !== undefined || node.cacheMisses !== undefined) {
    extraStats.push(`memoize hits=${node.cacheHits ?? 0} misses=${node.cacheMisses ?? 0}`);
  }
  if (node.wal && node.wal.bytes > 0) extraStats.push(`WAL ${formatCount(node.wal.records)} recs (${formatBytes(node.wal.bytes)})`);
  if (extraStats.length > 0) out.push(`- Stats: ${extraStats.join('; ')}`);

  const preds: Array<[string, string | undefined]> = [
    ['Index Cond', node.indexCond],
    ['Hash Cond', node.hashCond],
    ['Merge Cond', node.mergeCond],
    ['Recheck Cond', node.recheckCond],
    ['Join Filter', node.joinFilter],
    ['Filter', node.filter],
    ['One-Time Filter', node.oneTimeFilter],
    ['Sort Key', node.sortKey?.join(', ')],
    ['Group Key', node.groupKey?.join(', ')],
  ].filter((x): x is [string, string] => Boolean(x[1]));

  if (node.rowsRemovedByFilter) preds.push(['Rows Removed by Filter', `${formatCount(node.rowsRemovedByFilter)} / loop`]);
  if (node.rowsRemovedByJoinFilter) preds.push(['Rows Removed by Join Filter', `${formatCount(node.rowsRemovedByJoinFilter)} / loop`]);
  if (node.rowsRemovedByIndexRecheck) preds.push(['Rows Removed by Index Recheck', `${formatCount(node.rowsRemovedByIndexRecheck)} / loop`]);

  if (preds.length > 0) {
    out.push('- Predicates:');
    for (const [k, v] of preds) out.push(`  - ${k}: \`${v}\``);
  }

  const nodeDiags = diagnostics.filter((d) => d.nodeId === node.id);
  if (nodeDiags.length > 0) {
    out.push('- Diagnostics:');
    for (const d of nodeDiags) out.push(`  - [${d.severity.toUpperCase()}] ${d.title} — ${d.detail}`);
  }

  return out.join('\n');
}

export function formatForLLM(
  planInput: string | unknown,
  options: FormatForLLMOptions = {}
): string {
  const analysis = analyzePlan(planInput);
  const { parsed, diagnostics } = analysis;

  if (options.nodeId) {
    const find = (n: PlanNode): PlanNode | null => {
      if (n.id === options.nodeId) return n;
      for (const c of n.plans) {
        const f = find(c);
        if (f) return f;
      }
      return null;
    };
    const target = find(parsed.plan);
    if (!target) throw new Error(`Unknown plan node id: ${options.nodeId}`);
    return formatNodeForLLM(parsed, target, diagnostics);
  }

  const out: string[] = ['# PostgreSQL execution plan summary'];

  if (parsed.executionTimeMs !== undefined) out.push(`- Execution time: ${formatMs(parsed.executionTimeMs)}`);
  else if (parsed.hasTiming) out.push(`- Total time: ${formatMs(parsed.effectiveTotalTimeMs)}`);
  if (parsed.planningTimeMs !== undefined) {
    const pm = parsed.planning?.memoryUsedKb ? ` (mem ${formatKbAsIec(parsed.planning.memoryUsedKb)})` : '';
    out.push(`- Planning time: ${formatMs(parsed.planningTimeMs)}${pm}`);
  }
  if (parsed.hasTiming && parsed.effectiveTotalIoMs > 0 && parsed.effectiveTotalTimeMs > 0) {
    const ioPct = Math.min(100, (parsed.effectiveTotalIoMs / parsed.effectiveTotalTimeMs) * 100);
    out.push(`- CPU* / I/O split: ${(100 - ioPct).toFixed(0)}% CPU* (${formatMs(parsed.effectiveTotalCpuMs)}) / ${ioPct.toFixed(0)}% I/O (${formatMs(parsed.effectiveTotalIoMs)})`);
  }
  if (parsed.hasBuffers) {
    const hit = analysis.bufferHitPercent !== null ? ` (${analysis.bufferHitPercent.toFixed(1)}% hit)` : '';
    out.push(`- Buffers (total): ${fmtBufLine(parsed.plan.buffers)}${hit}`);
  }
  const wal = sumPlanWal(parsed.plan);
  if (wal.bytes > 0) out.push(`- WAL: ${formatCount(wal.records)} recs, ${formatCount(wal.fpi)} FPI, ${formatBytes(wal.bytes)}`);
  if (parsed.jit) out.push(`- JIT: ${parsed.jit.functions} functions (${formatMs(parsed.jit.timing?.totalMs)})`);
  if (parsed.settings && Object.keys(parsed.settings).length > 0) {
    out.push(`- Settings: ${Object.entries(parsed.settings).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  if (diagnostics.length > 0) {
    out.push('', `## Findings (${diagnostics.length})`);
    for (const d of diagnostics) {
      out.push(`- [${d.severity.toUpperCase()}] ${d.title} (\`${d.nodeTitle}\`) — ${d.detail}`);
    }
  }

  if (analysis.byRelation.length > 0) {
    out.push('', '## Top relations / indexes');
    for (const r of analysis.byRelation.slice(0, 6)) {
      const hit = hitPct(r.sharedHit, r.sharedRead);
      const buf = r.exclusiveBufferBlocks > 0 ? `, ${formatBlocks(r.exclusiveBufferBlocks)}${hit ? ` (${hit} hit)` : ''}` : '';
      out.push(`- \`${r.name}\`: ${formatMs(r.exclusiveTimeMs)} (${r.pctTime.toFixed(1)}%)${buf}`);
    }
  }

  if (options.includePlan !== false) {
    const text =
      parsed.sourceFormat === 'text' && parsed.rawText
        ? parsed.rawText
        : parsedToText(parsed, { verbose: options.verbose ?? true });
    out.push('', '## Execution plan', '```text', text, '```');
  }

  return out.join('\n');
}
