import type { MetricMode, ParsedExplain, PlanNode } from '../types';
import {
  formatBlocks,
  formatCompactCount,
  formatFactor,
  formatMs,
} from '../units';

export interface NodeFlag {
  label: string;
  tone: 'danger' | 'warn' | 'blue' | 'ok' | 'neutral';
}

export function getNodeFlags(node: PlanNode): NodeFlag[] {
  const flags: NodeFlag[] = [];
  if (node.disabled) flags.push({ label: 'Disabled', tone: 'danger' });
  if (node.neverExecuted) flags.push({ label: 'Never executed', tone: 'neutral' });
  if (
    node.sortSpaceType === 'Disk' ||
    (node.hashBatches ?? 1) > 1 ||
    (node.diskUsageKb ?? 0) > 0 ||
    node.storage === 'Disk' ||
    node.exclusiveBuffers.temp.read + node.exclusiveBuffers.temp.written > 0
  ) {
    flags.push({ label: 'Spill', tone: 'danger' });
  }
  if ((node.lossyHeapBlocks ?? 0) > 0) {
    flags.push({ label: 'Lossy', tone: 'warn' });
  }
  if (!node.neverExecuted && node.rowEstimateFactor >= 10 && (node.totalActualRows >= 100 || node.totalPlanRows >= 100)) {
    const arrow = node.rowEstimateDirection === 'under' ? '↑' : '↓';
    flags.push({
      label: `${arrow}${formatFactor(node.rowEstimateFactor)}`,
      tone: node.rowEstimateFactor >= 100 ? 'danger' : 'warn',
    });
  }
  if (node.exclusiveBuffers.shared.read >= 128) {
    flags.push({ label: `${formatBlocks(node.exclusiveBuffers.shared.read)} read`, tone: 'blue' });
  }
  if (node.nodeType === 'Index Only Scan' && (node.heapFetches ?? 0) > 0) {
    flags.push({ label: `${formatCompactCount(node.heapFetches!)} heap`, tone: 'warn' });
  }
  return flags;
}

export function nodeMatchesSearch(node: PlanNode, q: string): boolean {
  if (!q) return true;
  const hay = [
    node.displayTitle,
    node.nodeType,
    node.subplanName,
    node.relationName,
    node.indexName,
    node.filter,
    node.indexCond,
    node.hashCond,
    node.mergeCond,
    node.recheckCond,
    node.joinFilter,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function nodeQualPreview(node: PlanNode): string | undefined {
  if (node.indexCond) return `Index: ${node.indexCond}`;
  if (node.hashCond) return `Hash: ${node.hashCond}`;
  if (node.mergeCond) return `Merge: ${node.mergeCond}`;
  if (node.recheckCond) return `Recheck: ${node.recheckCond}`;
  if (node.joinFilter) return `Join filter: ${node.joinFilter}`;
  if (node.filter) return `Filter: ${node.filter}`;
  if (node.oneTimeFilter) return `One-time: ${node.oneTimeFilter}`;
  if (node.sortKey?.length) return `Sort: ${node.sortKey.join(', ')}`;
  if (node.groupKey?.length) return `Group: ${node.groupKey.join(', ')}`;
  return undefined;
}

export function getMetricSample(
  parsed: ParsedExplain,
  node: PlanNode,
  metric: MetricMode
): { pct: number; selfPct: number; label: string } {
  switch (metric) {
    case 'exclusiveTime': {
      const denom = parsed.effectiveTotalTimeMs || parsed.maxNodeExclusiveTimeMs || 1;
      const pct = Math.min(100, (node.exclusiveTimeMs / denom) * 100);
      return {
        pct,
        selfPct: pct,
        label: parsed.hasTiming ? `${formatMs(node.exclusiveTimeMs)} (${pct.toFixed(1)}%)` : '—',
      };
    }
    case 'inclusiveTime': {
      const denom = parsed.effectiveTotalTimeMs || parsed.maxNodeInclusiveTimeMs || 1;
      const pct = Math.min(100, (node.inclusiveTimeMs / denom) * 100);
      const selfPct = Math.min(pct, (node.exclusiveTimeMs / denom) * 100);
      return {
        pct,
        selfPct,
        label: parsed.hasTiming ? `${formatMs(node.inclusiveTimeMs)} (${pct.toFixed(1)}%)` : '—',
      };
    }
    case 'buffers': {
      const denom = parsed.effectiveTotalBufferBlocks || parsed.maxNodeBufferBlocks || 1;
      const pct = Math.min(100, (node.totalBufferBlocks / denom) * 100);
      const selfPct = Math.min(pct, (node.exclusiveBufferBlocks / denom) * 100);
      return {
        pct,
        selfPct,
        label: node.totalBufferBlocks > 0 ? formatBlocks(node.totalBufferBlocks) : '0 B',
      };
    }
    case 'diskReads': {
      const denom = parsed.effectiveTotalDiskBlocks || parsed.maxNodeDiskBlocks || 1;
      const pct = parsed.effectiveTotalDiskBlocks > 0 || parsed.maxNodeDiskBlocks > 0
        ? Math.min(100, (node.totalDiskBlocks / denom) * 100)
        : 0;
      const selfPct = parsed.effectiveTotalDiskBlocks > 0 || parsed.maxNodeDiskBlocks > 0
        ? Math.min(pct, (node.exclusiveDiskBlocks / denom) * 100)
        : 0;
      return {
        pct,
        selfPct,
        label: node.totalDiskBlocks > 0 ? formatBlocks(node.totalDiskBlocks) : '0 B',
      };
    }
    case 'ioTime': {
      const tot = (node.ioTimings?.totalReadMs ?? 0) + (node.ioTimings?.totalWriteMs ?? 0);
      const denom = parsed.effectiveTotalIoMs || parsed.maxNodeIoMs || 1;
      const pct = denom > 0 ? Math.min(100, (tot / denom) * 100) : 0;
      const selfPct = denom > 0 ? Math.min(pct, (node.exclusiveIoMs / denom) * 100) : 0;
      return { pct, selfPct, label: tot > 0 ? formatMs(tot) : '—' };
    }
    case 'rows': {
      const denom = parsed.maxNodeRows || 1;
      const pct = Math.min(100, (node.totalActualRows / denom) * 100);
      return {
        pct,
        selfPct: pct,
        label: parsed.isAnalyze ? `${formatCompactCount(node.totalActualRows)} rows` : `${formatCompactCount(node.totalPlanRows)} est`,
      };
    }
    case 'cost': {
      const denom = parsed.effectiveTotalCost || parsed.maxNodeCost || 1;
      const pct = Math.min(100, (node.inclusiveCost / denom) * 100);
      const selfPct = Math.min(pct, (node.exclusiveCost / denom) * 100);
      return {
        pct,
        selfPct,
        label: node.inclusiveCost > 0 ? `${node.inclusiveCost.toFixed(1)}` : '0',
      };
    }
  }
}

export function heatClass(pct: number): string {
  if (pct >= 45) return 'pgp-heat-3';
  if (pct >= 20) return 'pgp-heat-2';
  if (pct >= 8) return 'pgp-heat-1';
  return '';
}

export function countDescendants(node: PlanNode): number {
  let c = 0;
  for (const ch of node.plans) c += 1 + countDescendants(ch);
  return c;
}
