import type {
  BufferStats,
  IoTimingStats,
  JsonToTextOptions,
  JitStats,
  ParsedExplain,
  PlanNode,
  SortGroupStats,
} from './types';
import { parsePlan } from './parser';
import { formatActualRowsText } from './units';

function formatBufferSections(b: BufferStats): string {
  const parts: string[] = [];

  const pushGroup = (
    name: string,
    pairs: Array<[string, number]>
  ) => {
    const nonzero = pairs.filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`);
    if (nonzero.length > 0) {
      parts.push(`${name} ${nonzero.join(' ')}`);
    }
  };

  pushGroup('shared', [
    ['hit', b.shared.hit],
    ['read', b.shared.read],
    ['dirtied', b.shared.dirtied],
    ['written', b.shared.written],
  ]);
  pushGroup('local', [
    ['hit', b.local.hit],
    ['read', b.local.read],
    ['dirtied', b.local.dirtied],
    ['written', b.local.written],
  ]);
  pushGroup('temp', [
    ['read', b.temp.read],
    ['written', b.temp.written],
  ]);

  return parts.join(', ');
}

function formatIoSections(io: IoTimingStats): string {
  const hasSplit =
    io.sharedReadMs !== undefined ||
    io.sharedWriteMs !== undefined ||
    io.localReadMs !== undefined ||
    io.localWriteMs !== undefined ||
    io.tempReadMs !== undefined ||
    io.tempWriteMs !== undefined;

  if (!hasSplit) {
    const parts: string[] = [];
    if (io.readMs !== undefined && io.readMs > 0) parts.push(`read=${io.readMs.toFixed(3)}`);
    if (io.writeMs !== undefined && io.writeMs > 0) parts.push(`write=${io.writeMs.toFixed(3)}`);
    return parts.join(' ');
  }

  const sections: string[] = [];
  const pushScope = (name: string, r?: number, w?: number) => {
    const sub: string[] = [];
    if (r !== undefined && r > 0) sub.push(`read=${r.toFixed(3)}`);
    if (w !== undefined && w > 0) sub.push(`write=${w.toFixed(3)}`);
    if (sub.length > 0) sections.push(`${name} ${sub.join(' ')}`);
  };
  pushScope('shared', io.sharedReadMs, io.sharedWriteMs);
  pushScope('local', io.localReadMs, io.localWriteMs);
  pushScope('temp', io.tempReadMs, io.tempWriteMs);
  return sections.join(', ');
}

function formatSortGroupsLine(label: string, g: SortGroupStats): string {
  const plural = g.sortMethodsUsed.length > 1 ? 's' : '';
  let line = `${label} Groups: ${g.groupCount}  Sort Method${plural}: ${g.sortMethodsUsed.join(', ')}`;
  if (g.memoryPeakKb !== undefined && g.memoryPeakKb > 0) {
    line += `  Average Memory: ${g.memoryAvgKb ?? 0}kB  Peak Memory: ${g.memoryPeakKb}kB`;
  }
  if (g.diskPeakKb !== undefined && g.diskPeakKb > 0) {
    line += `  Average Disk: ${g.diskAvgKb ?? 0}kB  Peak Disk: ${g.diskPeakKb}kB`;
  }
  return line;
}

function formatJitLines(jit: JitStats, indent: string): string[] {
  const out: string[] = [];
  out.push(`${indent}JIT:`);
  const inner = indent + '  ';
  out.push(`${inner}Functions: ${jit.functions}`);
  const opts = jit.options;
  out.push(
    `${inner}Options: Inlining ${Boolean(opts.inlining)}, Optimization ${Boolean(opts.optimization)}, Expressions ${Boolean(opts.expressions)}, Deforming ${Boolean(opts.deforming)}`
  );
  if (jit.timing && jit.timing.totalMs !== undefined) {
    const t = jit.timing;
    const totalMs = jit.timing.totalMs;
    const deformStr = t.deformMs !== undefined ? ` (Deform ${t.deformMs.toFixed(3)} ms)` : '';
    out.push(
      `${inner}Timing: Generation ${(t.generationMs ?? 0).toFixed(3)} ms${deformStr}, Inlining ${(t.inliningMs ?? 0).toFixed(3)} ms, Optimization ${(t.optimizationMs ?? 0).toFixed(3)} ms, Emission ${(t.emissionMs ?? 0).toFixed(3)} ms, Total ${totalMs.toFixed(3)} ms`
    );
  }
  return out;
}

function formatHeaderSuffix(node: PlanNode): string {
  let suffix = '';
  if (node.startupCost !== undefined && node.totalCost !== undefined) {
    suffix += `  (cost=${node.startupCost.toFixed(2)}..${node.totalCost.toFixed(2)} rows=${Math.round(node.planRows ?? 0)} width=${Math.round(node.planWidth ?? 0)})`;
  }
  if (node.neverExecuted) {
    suffix += ' (never executed)';
  } else if (node.actualLoops !== undefined && node.actualLoops > 0) {
    const timePart =
      node.actualStartupTime !== undefined && node.actualTotalTime !== undefined
        ? `time=${node.actualStartupTime.toFixed(3)}..${node.actualTotalTime.toFixed(3)} `
        : '';
    const rowsStr = formatActualRowsText(node.actualRows ?? 0);
    suffix += ` (actual ${timePart}rows=${rowsStr} loops=${node.actualLoops})`;
  }
  return suffix;
}

function renderNodeLines(
  node: PlanNode,
  prefix: string,
  depth: number,
  opts: Required<JsonToTextOptions>,
  out: string[]
): void {
  let subplanPrefix = '';
  let effectiveDepth = depth;
  if (node.subplanName) {
    out.push(`${prefix}${node.subplanName}`);
    subplanPrefix = '  ';
    effectiveDepth++;
  }

  const headPrefix = effectiveDepth === 0 ? prefix : `${prefix}${subplanPrefix}->  `;
  out.push(`${headPrefix}${node.displayTitle}${formatHeaderSuffix(node)}`);

  const detailPrefix = effectiveDepth === 0 ? `${prefix}  ` : `${prefix}${subplanPrefix}      `;
  const pushDetail = (line: string) => out.push(`${detailPrefix}${line}`);

  if (node.disabled) {
    pushDetail('Disabled: true');
  }
  if (opts.verbose && node.output && node.output.length > 0) {
    pushDetail(`Output: ${node.output.join(', ')}`);
  }
  if (opts.verbose && node.innerUnique) {
    pushDetail('Inner Unique: true');
  }

  if (node.sortKey && node.sortKey.length > 0) {
    pushDetail(`Sort Key: ${node.sortKey.join(', ')}`);
  }
  if (node.presortedKey && node.presortedKey.length > 0) {
    pushDetail(`Presorted Key: ${node.presortedKey.join(', ')}`);
  }
  if (node.estimatedGroups !== undefined) {
    pushDetail(`Estimated Groups: ${node.estimatedGroups}`);
  }
  if (node.fullSortGroups) {
    pushDetail(formatSortGroupsLine('Full-sort', node.fullSortGroups));
  }
  if (node.presortedGroups) {
    pushDetail(formatSortGroupsLine('Pre-sorted', node.presortedGroups));
  }
  if (node.sortMethod || node.sortSpaceType) {
    const parts: string[] = [];
    if (node.sortMethod) parts.push(`Sort Method: ${node.sortMethod}`);
    if (node.sortSpaceType) parts.push(`${node.sortSpaceType}: ${node.sortSpaceUsedKb ?? 0}kB`);
    pushDetail(parts.join('  '));
  }

  if (node.groupKey && node.groupKey.length > 0) {
    pushDetail(`Group Key: ${node.groupKey.join(', ')}`);
  }
  if (node.hashBuckets !== undefined && node.hashBuckets > 0) {
    pushDetail(
      `Buckets: ${node.hashBuckets}  Batches: ${node.hashBatches ?? 1}  Memory Usage: ${node.peakMemoryUsageKb ?? 0}kB`
    );
  }

  if (node.nodeType === 'Memoize') {
    if (node.cacheKey) pushDetail(`Cache Key: ${node.cacheKey}`);
    if (node.cacheMode) pushDetail(`Cache Mode: ${node.cacheMode}`);
    if (node.estimatedCapacity !== undefined) {
      pushDetail(
        `Estimates: capacity=${node.estimatedCapacity} distinct keys=${Math.round(node.estimatedDistinctLookupKeys ?? 0)} lookups=${Math.round(node.estimatedLookups ?? 0)} hit percent=${(node.estimatedHitPercent ?? 0).toFixed(2)}%`
      );
    }
    if ((node.cacheHits ?? 0) > 0 || (node.cacheMisses ?? 0) > 0) {
      pushDetail(
        `Hits: ${node.cacheHits ?? 0}  Misses: ${node.cacheMisses ?? 0}  Evictions: ${node.cacheEvictions ?? 0}  Overflows: ${node.cacheOverflows ?? 0}  Memory Usage: ${node.peakMemoryUsageKb ?? 0}kB`
      );
    }
  }

  if (node.indexCond) pushDetail(`Index Cond: ${node.indexCond}`);
  if (node.orderBy) pushDetail(`Order By: ${node.orderBy}`);
  if (node.mergeCond) pushDetail(`Merge Cond: ${node.mergeCond}`);
  if (node.tidCond) pushDetail(`TID Cond: ${node.tidCond}`);
  if (node.nodeType === 'Index Only Scan' && node.heapFetches !== undefined) {
    pushDetail(`Heap Fetches: ${node.heapFetches}`);
  }
  if (node.indexSearches !== undefined && node.indexSearches > 0) {
    pushDetail(`Index Searches: ${node.indexSearches}`);
  }
  if (node.hashCond) pushDetail(`Hash Cond: ${node.hashCond}`);
  if (node.recheckCond) pushDetail(`Recheck Cond: ${node.recheckCond}`);
  if (node.rowsRemovedByIndexRecheck !== undefined && node.rowsRemovedByIndexRecheck > 0) {
    pushDetail(`Rows Removed by Index Recheck: ${node.rowsRemovedByIndexRecheck}`);
  }

  if (node.joinFilter) {
    pushDetail(`Join Filter: ${node.joinFilter}`);
    if (node.rowsRemovedByJoinFilter !== undefined && node.rowsRemovedByJoinFilter > 0) {
      pushDetail(`Rows Removed by Join Filter: ${node.rowsRemovedByJoinFilter}`);
    }
  }

  if (node.functionCall) pushDetail(`Function Call: ${node.functionCall}`);
  if (node.tableFunctionCall) pushDetail(`Table Function Call: ${node.tableFunctionCall}`);
  if (node.samplingMethod) {
    const rep = node.repeatableSeed ? ` REPEATABLE (${node.repeatableSeed})` : '';
    pushDetail(`Sampling: ${node.samplingMethod} (${(node.samplingParameters ?? []).join(', ')})${rep}`);
  }
  if (node.windowDef) pushDetail(`Window: ${node.windowDef}`);
  if (node.runCondition) pushDetail(`Run Condition: ${node.runCondition}`);
  if (node.replaces) pushDetail(`Replaces: ${node.replaces}`);
  if (node.oneTimeFilter) pushDetail(`One-Time Filter: ${node.oneTimeFilter}`);

  const pushHashAggInfo = () => {
    if (node.hashAggBatches !== undefined && node.hashAggBatches > 0) {
      const parts: string[] = [];
      if (node.plannedPartitions !== undefined && node.plannedPartitions > 0) {
        parts.push(`Planned Partitions: ${node.plannedPartitions}`);
      }
      parts.push(`Batches: ${node.hashAggBatches}`);
      parts.push(`Memory Usage: ${node.peakMemoryUsageKb ?? 0}kB`);
      if (node.diskUsageKb !== undefined && node.diskUsageKb > 0) {
        parts.push(`Disk Usage: ${node.diskUsageKb}kB`);
      }
      pushDetail(parts.join('  '));
    }
  };

  if (node.filter) {
    pushDetail(`Filter: ${node.filter}`);
    pushHashAggInfo();
    if (node.rowsRemovedByFilter !== undefined && node.rowsRemovedByFilter > 0) {
      pushDetail(`Rows Removed by Filter: ${node.rowsRemovedByFilter}`);
    }
  } else {
    pushHashAggInfo();
  }

  if ((node.exactHeapBlocks ?? 0) > 0 || (node.lossyHeapBlocks ?? 0) > 0) {
    let line = 'Heap Blocks:';
    if ((node.exactHeapBlocks ?? 0) > 0) line += ` exact=${node.exactHeapBlocks}`;
    if ((node.lossyHeapBlocks ?? 0) > 0) line += ` lossy=${node.lossyHeapBlocks}`;
    pushDetail(line);
  }

  if (node.conflictResolution) {
    pushDetail(`Conflict Resolution: ${node.conflictResolution}`);
    if (node.conflictArbiterIndexes && node.conflictArbiterIndexes.length > 0) {
      pushDetail(`Conflict Arbiter Indexes: ${node.conflictArbiterIndexes.join(', ')}`);
    }
    if (node.conflictFilter) {
      pushDetail(`Conflict Filter: ${node.conflictFilter}`);
      if ((node.rowsRemovedByConflictFilter ?? 0) > 0) {
        pushDetail(`Rows Removed by Conflict Filter: ${node.rowsRemovedByConflictFilter}`);
      }
    }
    if (node.tuplesInserted !== undefined) pushDetail(`Tuples Inserted: ${node.tuplesInserted}`);
    if (node.conflictingTuples !== undefined) pushDetail(`Conflicting Tuples: ${node.conflictingTuples}`);
  }

  if (node.workersPlanned !== undefined && node.workersPlanned > 0) {
    pushDetail(`Workers Planned: ${node.workersPlanned}`);
    if (node.workersLaunched !== undefined) pushDetail(`Workers Launched: ${node.workersLaunched}`);
    if (node.singleCopy) pushDetail('Single Copy: true');
  }

  if (node.storage) {
    pushDetail(`Storage: ${node.storage}  Maximum Storage: ${node.maximumStorageKb ?? 0}kB`);
  }

  if (node.ioPrefetch) {
    const p = node.ioPrefetch;
    if (p.avgPrefetchDistance !== undefined) {
      pushDetail(
        `Prefetch: avg=${p.avgPrefetchDistance.toFixed(2)} max=${p.maxPrefetchDistance ?? 0} capacity=${p.prefetchCapacity ?? 0}`
      );
    }
    if (p.ioCount !== undefined && p.ioCount > 0) {
      pushDetail(
        `I/O: count=${p.ioCount} waits=${p.ioWaits ?? 0} size=${(p.avgIoSize ?? 0).toFixed(2)} in-progress=${(p.avgIosInProgress ?? 0).toFixed(2)}`
      );
    }
  }

  const bufStr = formatBufferSections(node.buffers);
  if (bufStr) {
    pushDetail(`Buffers: ${bufStr}`);
  }

  if (node.wal) {
    const w = node.wal;
    if (w.records > 0 || w.fpi > 0 || w.bytes > 0 || (w.fpiBytes ?? 0) > 0 || (w.buffersFull ?? 0) > 0) {
      const wParts: string[] = [];
      if (w.records > 0) wParts.push(`records=${w.records}`);
      if (w.fpi > 0) wParts.push(`fpi=${w.fpi}`);
      if (w.bytes > 0) wParts.push(`bytes=${w.bytes}`);
      if (w.fpiBytes !== undefined && w.fpiBytes > 0) wParts.push(`fpi bytes=${w.fpiBytes}`);
      if (w.buffersFull !== undefined && w.buffersFull > 0) wParts.push(`buffers full=${w.buffersFull}`);
      pushDetail(`WAL: ${wParts.join(' ')}`);
    }
  }

  if (node.ioTimings) {
    const ioStr = formatIoSections(node.ioTimings);
    if (ioStr) pushDetail(`I/O Timings: ${ioStr}`);
  }

  if (opts.verbose && node.workers && node.workers.length > 0) {
    for (const w of node.workers) {
      if (w.actualTotalTime !== undefined || w.actualRows !== undefined) {
        const tm =
          w.actualStartupTime !== undefined && w.actualTotalTime !== undefined
            ? `time=${w.actualStartupTime.toFixed(3)}..${w.actualTotalTime.toFixed(3)} `
            : '';
        pushDetail(
          `Worker ${w.workerNumber}:  actual ${tm}rows=${formatActualRowsText(w.actualRows ?? 0)} loops=${w.actualLoops ?? 1}`
        );
      }
      if (w.sortMethod) {
        pushDetail(`Worker ${w.workerNumber}:  Sort Method: ${w.sortMethod}  ${w.sortSpaceType ?? 'Memory'}: ${w.sortSpaceUsedKb ?? 0}kB`);
      }
      if (w.buffers) {
        const wb = formatBufferSections(w.buffers);
        if (wb) pushDetail(`Worker ${w.workerNumber}:  Buffers: ${wb}`);
      }
      if (w.ioTimings) {
        const wio = formatIoSections(w.ioTimings);
        if (wio) pushDetail(`Worker ${w.workerNumber}:  I/O Timings: ${wio}`);
      }
      if (w.jit) {
        pushDetail(`Worker ${w.workerNumber}:  JIT:`);
        for (const jl of formatJitLines(w.jit, `${detailPrefix}  `).slice(1)) {
          out.push(jl);
        }
      }
    }
  }

  if (node.subplansRemoved !== undefined && node.subplansRemoved > 0) {
    pushDetail(`Subplans Removed: ${node.subplansRemoved}`);
  }

  for (const child of node.plans) {
    renderNodeLines(child, detailPrefix, effectiveDepth + 1, opts, out);
  }
}

export function parsedToText(parsed: ParsedExplain, options: JsonToTextOptions = {}): string {
  const opts: Required<JsonToTextOptions> = {
    verbose: options.verbose ?? true,
    includeFooter: options.includeFooter ?? true,
  };
  const lines: string[] = [];

  renderNodeLines(parsed.plan, '', 0, opts, lines);

  if (opts.includeFooter) {
    if (parsed.settings && Object.keys(parsed.settings).length > 0) {
      const pairs = Object.entries(parsed.settings).map(([k, v]) => `${k} = '${v}'`);
      lines.push(`Settings: ${pairs.join(', ')}`);
    }
    if (parsed.queryIdentifier) {
      lines.push(`Query Identifier: ${parsed.queryIdentifier}`);
    }
    if (parsed.planning) {
      const pBuf = parsed.planning.buffers ? formatBufferSections(parsed.planning.buffers) : '';
      const pIo = parsed.planning.ioTimings ? formatIoSections(parsed.planning.ioTimings) : '';
      const hasMem =
        parsed.planning.memoryUsedKb !== undefined && parsed.planning.memoryAllocatedKb !== undefined;
      if (pBuf || pIo || hasMem) {
        lines.push('Planning:');
        if (pBuf) lines.push(`  Buffers: ${pBuf}`);
        if (pIo) lines.push(`  I/O Timings: ${pIo}`);
        if (hasMem) {
          lines.push(
            `  Memory: used=${Math.round(parsed.planning.memoryUsedKb!)}kB  allocated=${Math.round(parsed.planning.memoryAllocatedKb!)}kB`
          );
        }
      }
    }
    if (parsed.planningTimeMs !== undefined) {
      lines.push(`Planning Time: ${parsed.planningTimeMs.toFixed(3)} ms`);
    }
    for (const trig of parsed.triggers) {
      const constraint = trig.constraintName ? ` for constraint ${trig.constraintName}` : '';
      const tm = trig.timeMs !== undefined ? `time=${trig.timeMs.toFixed(3)} ` : '';
      lines.push(`Trigger ${trig.name}${constraint}: ${tm}calls=${trig.calls}`);
    }
    if (parsed.jit) {
      lines.push(...formatJitLines(parsed.jit, ''));
    }
    if (parsed.serialization) {
      const s = parsed.serialization;
      const tm = s.timeMs !== undefined ? `time=${s.timeMs.toFixed(3)} ms  ` : '';
      lines.push(`Serialization: ${tm}output=${s.outputKb}kB  format=${s.format}`);
      if (s.buffers) {
        const sb = formatBufferSections(s.buffers);
        if (sb) lines.push(`  Buffers: ${sb}`);
      }
      if (s.ioTimings) {
        const sio = formatIoSections(s.ioTimings);
        if (sio) lines.push(`  I/O Timings: ${sio}`);
      }
    }
    if (parsed.executionTimeMs !== undefined) {
      lines.push(`Execution Time: ${parsed.executionTimeMs.toFixed(3)} ms`);
    }
  }

  return lines.join('\n');
}

export function jsonToText(planJson: string | unknown, options: JsonToTextOptions = {}): string {
  const parsed = parsePlan(planJson);
  return parsedToText(parsed, options);
}
