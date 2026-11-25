import { parsePlan } from './parser';
import type { Diagnostic, ParsedExplain, PlanAnalysis, PlanNode } from './types';
import { formatBlocks, formatCompactCount, formatFactor, formatKbAsIec, formatMs, sumBufferBlocks } from './units';

const SEV_WEIGHT = { high: 0, med: 1, low: 2 };

export function diagnosePlan(parsed: ParsedExplain): Diagnostic[] {
  const out: Diagnostic[] = [];
  let seq = 0;
  const add = (d: Omit<Diagnostic, 'id'>) => out.push({ id: `diag-${seq++}`, ...d });

  const walk = (node: PlanNode) => {
    const share = node.pctExclusiveTime;

    // 1. Disabled planner node (PG 18+)
    if (node.disabled) {
      add({
        severity: 'high',
        code: 'disabled-node',
        title: 'Planner disabled node executed',
        detail: `${node.nodeType} has Disabled = true (likely enable_* = off or no legal alternative).`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: 'Disabled',
      });
    }

    // 2. Row estimation mismatch (>= 10x on meaningful nodes)
    if (
      parsed.isAnalyze &&
      !node.neverExecuted &&
      node.rowEstimateFactor >= 10 &&
      (node.totalActualRows >= 100 || node.totalPlanRows >= 100 || share >= 2)
    ) {
      const dir = node.rowEstimateDirection === 'under' ? 'underestimated' : 'overestimated';
      const isZero = !Number.isFinite(node.rowEstimateFactor);
      const metricLbl = isZero
        ? `${formatCompactCount(node.totalPlanRows)} vs 0`
        : formatFactor(node.rowEstimateFactor);
      add({
        severity: node.rowEstimateFactor >= 100 && (share >= 5 || node.totalActualRows >= 1000) ? 'high' : 'med',
        code: 'row-misestimate',
        title: isZero
          ? `Estimated ${formatCompactCount(node.totalPlanRows)} rows, returned ${formatCompactCount(node.totalActualRows)}`
          : `Row estimate ${dir} by ${formatFactor(node.rowEstimateFactor)}`,
        detail: `Expected ${formatCompactCount(node.totalPlanRows)} rows total, got ${formatCompactCount(node.totalActualRows)}.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: metricLbl,
      });
    }

    // 3. Disk spill (Sort, Hash, HashAggregate, Tuplestore Storage, Temp buffers)
    const isSortDisk = node.sortSpaceType === 'Disk';
    const isGroupDisk = Boolean(node.fullSortGroups?.diskPeakKb || node.presortedGroups?.diskPeakKb);
    const isHashSpill = (node.hashBatches ?? 1) > 1 || (node.diskUsageKb ?? 0) > 0;
    const isTuplestoreDisk = node.storage === 'Disk';
    const exTemp = node.exclusiveBuffers.temp.read + node.exclusiveBuffers.temp.written;

    if (isSortDisk || isGroupDisk || isHashSpill || isTuplestoreDisk || exTemp > 0) {
      const bits: string[] = [];
      if (isSortDisk && node.sortSpaceUsedKb) bits.push(`sort disk ${formatKbAsIec(node.sortSpaceUsedKb)}`);
      if (node.diskUsageKb) bits.push(`hash disk ${formatKbAsIec(node.diskUsageKb)}`);
      if ((node.hashBatches ?? 1) > 1) bits.push(`${node.hashBatches} hash batches`);
      if ((node.hashAggBatches ?? 1) > 1) bits.push(`${node.hashAggBatches} agg batches`);
      if (isTuplestoreDisk && node.maximumStorageKb) bits.push(`tuplestore disk ${formatKbAsIec(node.maximumStorageKb)}`);
      if (exTemp > 0) bits.push(`temp I/O ${formatBlocks(exTemp)}`);
      add({
        severity: 'high',
        code: 'disk-spill',
        title: 'Spilled to temporary disk',
        detail: `${bits.join(', ')}. Consider raising work_mem or reducing input rows.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: exTemp > 0 ? formatBlocks(exTemp) : node.diskUsageKb ? formatKbAsIec(node.diskUsageKb) : 'Disk',
      });
    }

    // 4. Lossy Bitmap Heap Scan
    if ((node.lossyHeapBlocks ?? 0) > 0) {
      const exact = node.exactHeapBlocks ?? 0;
      const lossy = node.lossyHeapBlocks ?? 0;
      add({
        severity: lossy > exact ? 'high' : 'med',
        code: 'lossy-bitmap',
        title: `Lossy bitmap pages (${formatCompactCount(lossy)})`,
        detail: `${formatCompactCount(lossy)} lossy vs ${formatCompactCount(exact)} exact pages; bitmap exceeded work_mem and forced rechecks.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: `${formatCompactCount(lossy)} lossy`,
      });
    }

    // 5. High filter / join-filter / recheck discard ratio
    const removed =
      (node.rowsRemovedByFilter ?? 0) +
      (node.rowsRemovedByJoinFilter ?? 0) +
      (node.rowsRemovedByIndexRecheck ?? 0);
    const loops = Math.max(node.actualLoops ?? 1, 1);
    const totalRemoved = removed * loops;
    const totalSeen = node.totalActualRows + totalRemoved;
    if (totalRemoved >= 1000 && totalSeen > 0 && totalRemoved / totalSeen >= 0.8) {
      const discardPct = ((totalRemoved / totalSeen) * 100).toFixed(1);
      add({
        severity: share >= 15 || totalRemoved >= 50000 ? 'high' : 'med',
        code: 'filter-discard',
        title: `${discardPct}% rows discarded by filter`,
        detail: `Removed ${formatCompactCount(totalRemoved)} of ${formatCompactCount(totalSeen)} rows after reading them.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: `${discardPct}% dropped`,
      });
    }

    // 6. Heap fetches on Index Only Scan
    if (node.nodeType === 'Index Only Scan' && (node.heapFetches ?? 0) > 0) {
      const ratio = node.totalActualRows > 0 ? node.heapFetches! / node.totalActualRows : 1;
      if (node.heapFetches! >= 100 || ratio >= 0.25) {
        add({
          severity: ratio >= 0.5 && node.heapFetches! >= 1000 ? 'med' : 'low',
          code: 'heap-fetches',
          title: `Index Only Scan fetched ${formatCompactCount(node.heapFetches!)} heap tuples`,
          detail: 'Visibility map bits are unset on touched pages; VACUUM can restore index-only efficiency.',
          nodeId: node.id,
          nodeTitle: node.displayTitle,
          metric: `${formatCompactCount(node.heapFetches!)} fetches`,
        });
      }
    }

    // 7. Physical shared buffer reads (OS cache / storage I/O)
    const exRead = node.exclusiveBuffers.shared.read;
    if (exRead >= 128 || node.exclusiveIoMs >= 5) {
      const readBytes = formatBlocks(exRead);
      const ioDetail = node.exclusiveIoMs > 0 ? ` (${formatMs(node.exclusiveIoMs)} I/O)` : '';
      add({
        severity: node.exclusiveIoMs >= 50 || exRead >= 4096 ? 'high' : 'med',
        code: 'shared-reads',
        title: `Shared reads: ${readBytes}${ioDetail}`,
        detail: `${formatCompactCount(exRead)} blocks missed shared_buffers.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: readBytes,
      });
    }

    // 8. Parallel worker shortfall
    if (
      node.workersPlanned !== undefined &&
      node.workersLaunched !== undefined &&
      node.workersLaunched < node.workersPlanned
    ) {
      add({
        severity: node.workersLaunched === 0 ? 'med' : 'low',
        code: 'worker-shortfall',
        title: `Only ${node.workersLaunched}/${node.workersPlanned} parallel workers launched`,
        detail: 'Parallel worker pool was saturated (check max_parallel_workers / max_worker_processes).',
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: `${node.workersLaunched}/${node.workersPlanned}`,
      });
    }

    // 9. Memoize cache pressure
    if (node.nodeType === 'Memoize' && (node.cacheHits !== undefined || node.cacheMisses !== undefined)) {
      const total = (node.cacheHits ?? 0) + (node.cacheMisses ?? 0);
      if (total >= 100) {
        const hitPct = ((node.cacheHits ?? 0) / total) * 100;
        if (hitPct < 50 || (node.cacheEvictions ?? 0) > 0 || (node.cacheOverflows ?? 0) > 0) {
          add({
            severity: hitPct < 25 ? 'med' : 'low',
            code: 'memoize-pressure',
            title: `Memoize hit rate ${hitPct.toFixed(1)}%`,
            detail: `${formatCompactCount(node.cacheHits ?? 0)} hits, ${formatCompactCount(node.cacheMisses ?? 0)} misses, ${formatCompactCount(node.cacheEvictions ?? 0)} evictions.`,
            nodeId: node.id,
            nodeTitle: node.displayTitle,
            metric: `${hitPct.toFixed(0)}% hit`,
          });
        }
      }
    }

    // 10. High loop multiplier
    if (loops >= 1000 && share >= 15) {
      add({
        severity: 'med',
        code: 'high-loops',
        title: `Executed ${formatCompactCount(loops)} loops (${share.toFixed(1)}% self time)`,
        detail: `Node ran ${formatCompactCount(loops)} times at ${formatMs(node.actualTotalTime)}/loop.`,
        nodeId: node.id,
        nodeTitle: node.displayTitle,
        metric: `${formatCompactCount(loops)} loops`,
      });
    }

    for (const c of node.plans) walk(c);
  };

  walk(parsed.plan);

  // Plan-level missing BUFFERS tip on ANALYZE plans
  if (parsed.isAnalyze && !parsed.hasBuffers) {
    add({
      severity: 'low',
      code: 'no-buffers',
      title: 'No BUFFERS data recorded',
      detail: 'Run explain (analyze, buffers) to measure actual page work independent of cache warmth.',
      nodeId: parsed.plan.id,
      nodeTitle: parsed.plan.displayTitle,
      metric: 'Missing BUFFERS',
    });
  }

  // Plan-level JIT overhead check
  const jitTotal = parsed.jit?.timing?.totalMs ?? 0;
  if (jitTotal > 0 && parsed.effectiveTotalTimeMs > 0) {
    const jitPct = (jitTotal / parsed.effectiveTotalTimeMs) * 100;
    if (jitPct >= 20 && jitTotal >= 5) {
      add({
        severity: jitPct >= 40 ? 'high' : 'med',
        code: 'jit-overhead',
        title: `JIT took ${formatMs(jitTotal)} (${jitPct.toFixed(0)}% of execution)`,
        detail: `${parsed.jit!.functions} compiled functions; consider raising jit_above_cost or disabling JIT for short queries.`,
        nodeId: parsed.plan.id,
        nodeTitle: parsed.plan.displayTitle,
        metric: `${jitPct.toFixed(0)}% JIT`,
      });
    }
  }

  out.sort((a, b) => SEV_WEIGHT[a.severity] - SEV_WEIGHT[b.severity]);
  return out;
}

function isParsedExplain(v: unknown): v is ParsedExplain {
  return (
    v !== null &&
    typeof v === 'object' &&
    'plan' in v &&
    'hotPathIds' in v &&
    'nodeCount' in v
  );
}

export function analyzePlan(planInput: string | unknown): PlanAnalysis {
  const parsed = isParsedExplain(planInput) ? planInput : parsePlan(planInput);
  const diagnostics = diagnosePlan(parsed);
  const b = parsed.plan.buffers;
  const sharedDenom = b.shared.hit + b.shared.read;
  const bufferHitPercent = sharedDenom > 0 ? (b.shared.hit / sharedDenom) * 100 : null;
  return {
    parsed,
    diagnostics,
    exclusiveTimeMs: parsed.effectiveTotalTimeMs,
    exclusiveIoMs: parsed.effectiveTotalIoMs,
    exclusiveCpuMs: parsed.effectiveTotalCpuMs,
    totalBufferBlocks: sumBufferBlocks(b),
    bufferHitPercent,
    byRelation: parsed.byRelation,
    byNodeType: parsed.byNodeType,
  };
}
