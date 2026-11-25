import type {
  BufferStats,
  IoTimingStats,
  JitStats,
  NodeTypeSummary,
  ParsedExplain,
  PlanNode,
  PlanningStats,
  RelationSummary,
  SerializationStats,
  SortGroupStats,
  TriggerInfo,
  WalStats,
  WorkerStats,
} from './types';
import {
  emptyBufferStats,
  formatScanTarget,
  quoteIdentifier,
  sumBufferBlocks,
} from './units';

type JsonObj = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

function parseBuffersFromObj(o: JsonObj): BufferStats {
  return {
    shared: {
      hit: num(o['Shared Hit Blocks']) ?? 0,
      read: num(o['Shared Read Blocks']) ?? 0,
      dirtied: num(o['Shared Dirtied Blocks']) ?? 0,
      written: num(o['Shared Written Blocks']) ?? 0,
    },
    local: {
      hit: num(o['Local Hit Blocks']) ?? 0,
      read: num(o['Local Read Blocks']) ?? 0,
      dirtied: num(o['Local Dirtied Blocks']) ?? 0,
      written: num(o['Local Written Blocks']) ?? 0,
    },
    temp: {
      read: num(o['Temp Read Blocks']) ?? 0,
      written: num(o['Temp Written Blocks']) ?? 0,
    },
  };
}

function parseIoFromObj(o: JsonObj): IoTimingStats | undefined {
  const readMs = num(o['I/O Read Time']);
  const writeMs = num(o['I/O Write Time']);
  const sharedReadMs = num(o['Shared I/O Read Time']);
  const sharedWriteMs = num(o['Shared I/O Write Time']);
  const localReadMs = num(o['Local I/O Read Time']);
  const localWriteMs = num(o['Local I/O Write Time']);
  const tempReadMs = num(o['Temp I/O Read Time']);
  const tempWriteMs = num(o['Temp I/O Write Time']);

  const hasSplit =
    sharedReadMs !== undefined ||
    sharedWriteMs !== undefined ||
    localReadMs !== undefined ||
    localWriteMs !== undefined ||
    tempReadMs !== undefined ||
    tempWriteMs !== undefined;
  if (!hasSplit && readMs === undefined && writeMs === undefined) return undefined;

  const totalReadMs =
    readMs ?? (sharedReadMs ?? 0) + (localReadMs ?? 0) + (tempReadMs ?? 0);
  const totalWriteMs =
    writeMs ?? (sharedWriteMs ?? 0) + (localWriteMs ?? 0) + (tempWriteMs ?? 0);

  return {
    readMs,
    writeMs,
    sharedReadMs,
    sharedWriteMs,
    localReadMs,
    localWriteMs,
    tempReadMs,
    tempWriteMs,
    totalReadMs,
    totalWriteMs,
  };
}

function parseWalFromObj(o: JsonObj): WalStats | undefined {
  const records = num(o['WAL Records']);
  const fpi = num(o['WAL FPI']);
  const bytes = num(o['WAL Bytes']);
  const fpiBytes = num(o['WAL FPI Bytes']);
  const buffersFull = num(o['WAL Buffers Full']);
  if (
    records === undefined &&
    fpi === undefined &&
    bytes === undefined &&
    fpiBytes === undefined &&
    buffersFull === undefined
  ) {
    return undefined;
  }
  return {
    records: records ?? 0,
    fpi: fpi ?? 0,
    bytes: bytes ?? 0,
    fpiBytes,
    buffersFull,
  };
}

function parseSortGroups(v: unknown): SortGroupStats | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as JsonObj;
  const mem = o['Sort Space Memory'] as JsonObj | undefined;
  const disk = o['Sort Space Disk'] as JsonObj | undefined;
  return {
    groupCount: num(o['Group Count']) ?? 0,
    sortMethodsUsed: strArr(o['Sort Methods Used']) ?? [],
    memoryAvgKb: mem ? num(mem['Average Sort Space Used']) : undefined,
    memoryPeakKb: mem ? num(mem['Peak Sort Space Used']) : undefined,
    diskAvgKb: disk ? num(disk['Average Sort Space Used']) : undefined,
    diskPeakKb: disk ? num(disk['Peak Sort Space Used']) : undefined,
  };
}

function parseJitFromObj(v: unknown): JitStats | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as JsonObj;
  const opts = (o['Options'] as JsonObj | undefined) ?? {};
  const timing = o['Timing'] as JsonObj | undefined;
  const gen = timing?.['Generation'];
  let generationMs: number | undefined;
  let deformMs: number | undefined;
  if (typeof gen === 'number') {
    generationMs = gen;
  } else if (gen && typeof gen === 'object') {
    generationMs = num((gen as JsonObj)['Total']);
    deformMs = num((gen as JsonObj)['Deform']);
  }
  return {
    functions: num(o['Functions']) ?? 0,
    options: {
      inlining: bool(opts['Inlining']),
      optimization: bool(opts['Optimization']),
      expressions: bool(opts['Expressions']),
      deforming: bool(opts['Deforming']),
    },
    timing: timing
      ? {
          generationMs,
          deformMs,
          inliningMs: num(timing['Inlining']),
          optimizationMs: num(timing['Optimization']),
          emissionMs: num(timing['Emission']),
          totalMs: num(timing['Total']),
        }
      : undefined,
  };
}

export function buildDisplayTitle(node: {
  nodeType: string;
  operation?: string;
  joinType?: string;
  strategy?: string;
  partialMode?: string;
  command?: string;
  parallelAware: boolean;
  asyncCapable: boolean;
  scanDirection?: string;
  indexName?: string;
  relationName?: string;
  cteName?: string;
  functionName?: string;
  schema?: string;
  alias?: string;
}): string {
  let label = node.nodeType;
  if (label === 'ModifyTable' && node.operation) {
    label = node.operation;
  } else if (label === 'Aggregate') {
    if (node.strategy === 'Sorted') label = 'GroupAggregate';
    else if (node.strategy === 'Hashed') label = 'HashAggregate';
    else if (node.strategy === 'Mixed') label = 'MixedAggregate';
    if (node.partialMode === 'Partial' || node.partialMode === 'Finalize') {
      label = `${node.partialMode} ${label}`;
    }
  } else if (label === 'SetOp') {
    label = node.strategy === 'Hashed' ? 'HashSetOp' : 'SetOp';
    if (node.command) label += ` ${node.command}`;
  } else if ((label === 'Hash Join' || label === 'Merge Join' || label === 'Nested Loop') && node.joinType && node.joinType !== 'Inner') {
    const base = label === 'Hash Join' ? 'Hash' : label === 'Merge Join' ? 'Merge' : 'Nested Loop';
    label = `${base} ${node.joinType} Join`;
  }

  const prefix = `${node.parallelAware ? 'Parallel ' : ''}${node.asyncCapable ? 'Async ' : ''}`;
  const dir = node.scanDirection && node.scanDirection !== 'Forward' ? ` ${node.scanDirection}` : '';

  let using = '';
  if (node.indexName) {
    using = node.nodeType === 'Bitmap Index Scan'
      ? ` on ${quoteIdentifier(node.indexName)}`
      : ` using ${quoteIdentifier(node.indexName)}`;
  }

  let on = '';
  if (node.nodeType === 'Subquery Scan') {
    if (node.alias) on = ` on ${quoteIdentifier(node.alias)}`;
  } else if (node.nodeType === 'Values Scan') {
    if (node.alias) on = ` on ${quoteIdentifier(node.alias)}`;
  } else if (node.nodeType === 'Function Scan') {
    if (node.functionName) {
      on = formatScanTarget(node.schema, node.functionName, node.alias);
    } else if (node.alias) {
      on = ` on ${quoteIdentifier(node.alias)}`;
    }
  } else {
    const targetName = node.relationName ?? node.cteName;
    on = formatScanTarget(node.schema, targetName, node.alias);
  }

  return `${prefix}${label}${dir}${using}${on}`;
}

function createEmptyNode(id: string, depth: number): PlanNode {
  return {
    id,
    depth,
    nodeType: 'Unknown',
    displayTitle: 'Unknown',
    parallelAware: false,
    asyncCapable: false,
    neverExecuted: false,
    inclusiveTimeMs: 0,
    exclusiveTimeMs: 0,
    exclusiveCpuMs: 0,
    pctExecutionTime: 0,
    pctExclusiveTime: 0,
    inclusiveCost: 0,
    exclusiveCost: 0,
    totalActualRows: 0,
    totalPlanRows: 0,
    rowEstimateFactor: 1,
    rowEstimateDirection: 'exact',
    buffers: emptyBufferStats(),
    exclusiveBuffers: emptyBufferStats(),
    totalBufferBlocks: 0,
    exclusiveBufferBlocks: 0,
    totalDiskBlocks: 0,
    exclusiveDiskBlocks: 0,
    exclusiveIoMs: 0,
    plans: [],
  };
}

type FieldSpec = [jsonKey: string, prop: keyof PlanNode, kind: 's' | 'n' | 'b' | 'sa', hasText?: 1];

// Shared field descriptors used by both JSON and TEXT node parsers.
const NODE_FIELD_SPECS: FieldSpec[] = [
  ['Parent Relationship', 'parentRelationship', 's'],
  ['Subplan Name', 'subplanName', 's'],
  ['CTE Name', 'cteName', 's'],
  ['Relation Name', 'relationName', 's'],
  ['Schema', 'schema', 's'],
  ['Alias', 'alias', 's'],
  ['Index Name', 'indexName', 's'],
  ['Scan Direction', 'scanDirection', 's'],
  ['Join Type', 'joinType', 's'],
  ['Strategy', 'strategy', 's'],
  ['Partial Mode', 'partialMode', 's'],
  ['Operation', 'operation', 's'],
  ['Command', 'command', 's'],
  ['Custom Plan Provider', 'customPlanProvider', 's'],
  ['Inner Unique', 'innerUnique', 'b', 1],
  ['Single Copy', 'singleCopy', 'b', 1],
  ['Disabled', 'disabled', 'b', 1],
  ['Replaces', 'replaces', 's', 1],
  ['Subplans Removed', 'subplansRemoved', 'n', 1],
  ['Startup Cost', 'startupCost', 'n'],
  ['Total Cost', 'totalCost', 'n'],
  ['Plan Rows', 'planRows', 'n'],
  ['Plan Width', 'planWidth', 'n'],
  ['Actual Startup Time', 'actualStartupTime', 'n'],
  ['Actual Total Time', 'actualTotalTime', 'n'],
  ['Actual Rows', 'actualRows', 'n'],
  ['Actual Loops', 'actualLoops', 'n'],
  ['Output', 'output', 'sa', 1],
  ['Filter', 'filter', 's', 1],
  ['Rows Removed by Filter', 'rowsRemovedByFilter', 'n', 1],
  ['Join Filter', 'joinFilter', 's', 1],
  ['Rows Removed by Join Filter', 'rowsRemovedByJoinFilter', 'n', 1],
  ['One-Time Filter', 'oneTimeFilter', 's', 1],
  ['Index Cond', 'indexCond', 's', 1],
  ['Order By', 'orderBy', 's', 1],
  ['Recheck Cond', 'recheckCond', 's', 1],
  ['Rows Removed by Index Recheck', 'rowsRemovedByIndexRecheck', 'n', 1],
  ['Merge Cond', 'mergeCond', 's', 1],
  ['Hash Cond', 'hashCond', 's', 1],
  ['TID Cond', 'tidCond', 's', 1],
  ['Function Call', 'functionCall', 's', 1],
  ['Table Function Call', 'tableFunctionCall', 's', 1],
  ['Sampling Method', 'samplingMethod', 's'],
  ['Sampling Parameters', 'samplingParameters', 'sa'],
  ['Repeatable Seed', 'repeatableSeed', 's'],
  ['Heap Fetches', 'heapFetches', 'n', 1],
  ['Index Searches', 'indexSearches', 'n', 1],
  ['Exact Heap Blocks', 'exactHeapBlocks', 'n'],
  ['Lossy Heap Blocks', 'lossyHeapBlocks', 'n'],
  ['Sort Key', 'sortKey', 'sa', 1],
  ['Presorted Key', 'presortedKey', 'sa', 1],
  ['Sort Method', 'sortMethod', 's'],
  ['Sort Space Used', 'sortSpaceUsedKb', 'n'],
  ['Sort Space Type', 'sortSpaceType', 's'],
  ['Estimated Groups', 'estimatedGroups', 'n', 1],
  ['Group Key', 'groupKey', 'sa', 1],
  ['Hash Buckets', 'hashBuckets', 'n'],
  ['Original Hash Buckets', 'originalHashBuckets', 'n'],
  ['Hash Batches', 'hashBatches', 'n'],
  ['Original Hash Batches', 'originalHashBatches', 'n'],
  ['Peak Memory Usage', 'peakMemoryUsageKb', 'n'],
  ['Planned Partitions', 'plannedPartitions', 'n'],
  ['HashAgg Batches', 'hashAggBatches', 'n'],
  ['Disk Usage', 'diskUsageKb', 'n'],
  ['Cache Key', 'cacheKey', 's', 1],
  ['Cache Mode', 'cacheMode', 's', 1],
  ['Cache Hits', 'cacheHits', 'n'],
  ['Cache Misses', 'cacheMisses', 'n'],
  ['Cache Evictions', 'cacheEvictions', 'n'],
  ['Cache Overflows', 'cacheOverflows', 'n'],
  ['Estimated Capacity', 'estimatedCapacity', 'n'],
  ['Estimated Distinct Lookup Keys', 'estimatedDistinctLookupKeys', 'n'],
  ['Estimated Lookups', 'estimatedLookups', 'n'],
  ['Estimated Hit Percent', 'estimatedHitPercent', 'n'],
  ['Window', 'windowDef', 's', 1],
  ['Run Condition', 'runCondition', 's', 1],
  ['Storage', 'storage', 's'],
  ['Maximum Storage', 'maximumStorageKb', 'n'],
  ['Conflict Resolution', 'conflictResolution', 's', 1],
  ['Conflict Arbiter Indexes', 'conflictArbiterIndexes', 'sa', 1],
  ['Conflict Filter', 'conflictFilter', 's', 1],
  ['Rows Removed by Conflict Filter', 'rowsRemovedByConflictFilter', 'n', 1],
  ['Tuples Inserted', 'tuplesInserted', 'n', 1],
  ['Conflicting Tuples', 'conflictingTuples', 'n', 1],
  ['Tuples Updated', 'tuplesUpdated', 'n'],
  ['Tuples Deleted', 'tuplesDeleted', 'n'],
  ['Tuples Skipped', 'tuplesSkipped', 'n'],
  ['Workers Planned', 'workersPlanned', 'n', 1],
  ['Workers Launched', 'workersLaunched', 'n', 1],
];

const TEXT_DETAIL_MAP = new Map<string, FieldSpec>(
  NODE_FIELD_SPECS.filter((s) => s[3]).map((s) => [s[0], s])
);

function parseJsonNode(o: JsonObj, depth: number, counter: { n: number }): PlanNode {
  const id = `n${counter.n++}`;
  const node = createEmptyNode(id, depth);
  const nodeRec = node as unknown as Record<string, unknown>;

  node.nodeType = str(o['Node Type']) ?? 'Unknown';
  node.parallelAware = bool(o['Parallel Aware']) ?? false;
  node.asyncCapable = bool(o['Async Capable']) ?? false;

  for (const [jsonKey, prop, kind] of NODE_FIELD_SPECS) {
    const raw = o[jsonKey];
    if (raw === undefined) continue;
    const val = kind === 's' ? str(raw) : kind === 'n' ? num(raw) : kind === 'b' ? bool(raw) : strArr(raw);
    if (val !== undefined) nodeRec[prop] = val;
  }

  node.neverExecuted = node.actualLoops === 0;
  node.buffers = parseBuffersFromObj(o);
  node.ioTimings = parseIoFromObj(o);
  node.wal = parseWalFromObj(o);
  node.fullSortGroups = parseSortGroups(o['Full-sort Groups']);
  node.presortedGroups = parseSortGroups(o['Pre-sorted Groups']);

  if (o['Average Prefetch Distance'] !== undefined || o['I/O Count'] !== undefined) {
    node.ioPrefetch = {
      avgPrefetchDistance: num(o['Average Prefetch Distance']),
      maxPrefetchDistance: num(o['Max Prefetch Distance']),
      prefetchCapacity: num(o['Prefetch Capacity']),
      ioCount: num(o['I/O Count']),
      ioWaits: num(o['I/O Waits']),
      avgIoSize: num(o['Average I/O Size']),
      avgIosInProgress: num(o['Average I/Os In Progress']),
    };
  }

  if (Array.isArray(o['Target Tables'])) {
    node.targetTables = o['Target Tables']
      .filter((t): t is JsonObj => !!t && typeof t === 'object')
      .map((t) => ({
        operation: str(t['Operation']),
        relationName: str(t['Relation Name']),
        schema: str(t['Schema']),
        alias: str(t['Alias']),
      }));
  }

  if (Array.isArray(o['Workers'])) {
    node.workers = o['Workers']
      .filter((w): w is JsonObj => !!w && typeof w === 'object')
      .map((w, idx): WorkerStats => ({
        workerNumber: num(w['Worker Number']) ?? idx,
        actualStartupTime: num(w['Actual Startup Time']),
        actualTotalTime: num(w['Actual Total Time']),
        actualRows: num(w['Actual Rows']),
        actualLoops: num(w['Actual Loops']),
        buffers:
          w['Shared Hit Blocks'] !== undefined || w['Temp Read Blocks'] !== undefined
            ? parseBuffersFromObj(w)
            : undefined,
        ioTimings: parseIoFromObj(w),
        wal: parseWalFromObj(w),
        sortMethod: str(w['Sort Method']),
        sortSpaceUsedKb: num(w['Sort Space Used']),
        sortSpaceType: str(w['Sort Space Type']),
        cacheHits: num(w['Cache Hits']),
        cacheMisses: num(w['Cache Misses']),
        cacheEvictions: num(w['Cache Evictions']),
        cacheOverflows: num(w['Cache Overflows']),
        peakMemoryKb: num(w['Peak Memory Usage']),
        exactHeapBlocks: num(w['Exact Heap Blocks']),
        lossyHeapBlocks: num(w['Lossy Heap Blocks']),
        storage: str(w['Storage']),
        maximumStorageKb: num(w['Maximum Storage']),
        jit: parseJitFromObj(w['JIT']),
      }));
  }

  const functionName = str(o['Function Name']);
  if (functionName) {
    node.extra = { ...(node.extra ?? {}), functionName };
  }
  node.displayTitle = buildDisplayTitle({
    ...node,
    functionName,
  });

  if (Array.isArray(o['Plans'])) {
    node.plans = o['Plans']
      .filter((c): c is JsonObj => !!c && typeof c === 'object')
      .map((c) => parseJsonNode(c, depth + 1, counter));
  }

  return node;
}

// ============================================================================
// TEXT format parser
// ============================================================================

function parseKvNums(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /([a-z-]+)=(\d+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out[m[1]!.toLowerCase()] = Number(m[2]!);
  }
  return out;
}

function parseBuffersLine(line: string, target: BufferStats): boolean {
  if (!line.startsWith('Buffers:')) return false;
  const body = line.slice('Buffers:'.length).trim();
  for (const part of body.split(',')) {
    const t = part.trim();
    const space = t.indexOf(' ');
    if (space < 0) continue;
    const scope = t.slice(0, space).toLowerCase();
    const kv = parseKvNums(t.slice(space + 1));
    if (scope === 'shared') {
      target.shared.hit = kv.hit ?? target.shared.hit;
      target.shared.read = kv.read ?? target.shared.read;
      target.shared.dirtied = kv.dirtied ?? target.shared.dirtied;
      target.shared.written = kv.written ?? target.shared.written;
    } else if (scope === 'local') {
      target.local.hit = kv.hit ?? target.local.hit;
      target.local.read = kv.read ?? target.local.read;
      target.local.dirtied = kv.dirtied ?? target.local.dirtied;
      target.local.written = kv.written ?? target.local.written;
    } else if (scope === 'temp') {
      target.temp.read = kv.read ?? target.temp.read;
      target.temp.written = kv.written ?? target.temp.written;
    }
  }
  return true;
}

function parseIoLine(line: string): IoTimingStats | undefined {
  if (!line.startsWith('I/O Timings:')) return undefined;
  const body = line.slice('I/O Timings:'.length).trim();
  const res: IoTimingStats = { totalReadMs: 0, totalWriteMs: 0 };
  if (/^(shared|local|temp)\b/i.test(body)) {
    for (const part of body.split(',')) {
      const t = part.trim();
      const space = t.indexOf(' ');
      if (space < 0) continue;
      const scope = t.slice(0, space).toLowerCase();
      const kv = parseKvNums(t.slice(space + 1));
      if (scope === 'shared') {
        if (kv.read !== undefined) res.sharedReadMs = kv.read;
        if (kv.write !== undefined) res.sharedWriteMs = kv.write;
      } else if (scope === 'local') {
        if (kv.read !== undefined) res.localReadMs = kv.read;
        if (kv.write !== undefined) res.localWriteMs = kv.write;
      } else if (scope === 'temp') {
        if (kv.read !== undefined) res.tempReadMs = kv.read;
        if (kv.write !== undefined) res.tempWriteMs = kv.write;
      }
    }
    res.totalReadMs = (res.sharedReadMs ?? 0) + (res.localReadMs ?? 0) + (res.tempReadMs ?? 0);
    res.totalWriteMs = (res.sharedWriteMs ?? 0) + (res.localWriteMs ?? 0) + (res.tempWriteMs ?? 0);
  } else {
    const kv = parseKvNums(body);
    res.readMs = kv.read;
    res.writeMs = kv.write;
    res.totalReadMs = kv.read ?? 0;
    res.totalWriteMs = kv.write ?? 0;
  }
  return res;
}

function parseWalLine(line: string): WalStats | undefined {
  if (!line.startsWith('WAL:')) return undefined;
  const body = line.slice('WAL:'.length).trim();
  const records = /records=(\d+)/.exec(body);
  const fpi = /\bfpi=(\d+)/.exec(body);
  const bytes = /\bbytes=(\d+)/.exec(body);
  const fpiBytes = /fpi bytes=(\d+)/.exec(body);
  const buffersFull = /buffers[ -]full=(\d+)/.exec(body);
  return {
    records: records ? Number(records[1]) : 0,
    fpi: fpi ? Number(fpi[1]) : 0,
    bytes: bytes ? Number(bytes[1]) : 0,
    fpiBytes: fpiBytes ? Number(fpiBytes[1]) : undefined,
    buffersFull: buffersFull ? Number(buffersFull[1]) : undefined,
  };
}

function parseSettingsLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = line.slice('Settings:'.length).trim();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && (body[i] === ' ' || body[i] === ',')) i++;
    const eq = body.indexOf('=', i);
    if (eq < 0) break;
    const key = body.slice(i, eq).trim();
    i = eq + 1;
    while (i < body.length && body[i] === ' ') i++;
    let val = '';
    if (body[i] === "'") {
      i++;
      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") {
          val += "'";
          i += 2;
        } else if (body[i] === "'") {
          i++;
          break;
        } else {
          val += body[i++];
        }
      }
    } else {
      const nextComma = body.indexOf(',', i);
      val = (nextComma < 0 ? body.slice(i) : body.slice(i, nextComma)).trim();
      i = nextComma < 0 ? body.length : nextComma;
    }
    if (key) out[key] = val;
  }
  return out;
}

function parseNodeHeader(rawTitle: string, node: PlanNode): void {
  let rest = rawTitle.trim();

  // Extract trailing clauses: (cost=...) (actual ...) or (never executed)
  const neverExecRe = /\s+\(never executed\)\s*$/;
  if (neverExecRe.test(rest)) {
    node.neverExecuted = true;
    node.actualLoops = 0;
    node.actualRows = 0;
    rest = rest.replace(neverExecRe, '');
  }

  const actualRe = /\s+\(actual(?:\s+time=(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?))?\s+rows=(\d+(?:\.\d+)?)\s+loops=(\d+)\)\s*$/;
  const actMatch = actualRe.exec(rest);
  if (actMatch) {
    if (actMatch[1] !== undefined) node.actualStartupTime = Number(actMatch[1]);
    if (actMatch[2] !== undefined) node.actualTotalTime = Number(actMatch[2]);
    node.actualRows = Number(actMatch[3]);
    node.actualLoops = Number(actMatch[4]);
    node.neverExecuted = node.actualLoops === 0;
    rest = rest.slice(0, actMatch.index);
  }

  const costRe = /\s+\(cost=(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)\s+rows=(\d+(?:\.\d+)?)\s+width=(\d+)\)\s*$/;
  const costMatch = costRe.exec(rest);
  if (costMatch) {
    node.startupCost = Number(costMatch[1]);
    node.totalCost = Number(costMatch[2]);
    node.planRows = Number(costMatch[3]);
    node.planWidth = Number(costMatch[4]);
    rest = rest.slice(0, costMatch.index);
  }

  const caption = rest.trim();
  node.displayTitle = caption;

  let t = caption;
  if (t.startsWith('Parallel ')) {
    node.parallelAware = true;
    t = t.slice('Parallel '.length);
  }
  if (t.startsWith('Async ')) {
    node.asyncCapable = true;
    t = t.slice('Async '.length);
  }

  const dmlMatch = /^(?:Foreign )?(Insert|Update|Delete|Merge) on (.+)$/.exec(t);
  if (dmlMatch) {
    node.nodeType = 'ModifyTable';
    node.operation = dmlMatch[1];
    assignTarget(dmlMatch[2]!, node);
    return;
  }

  const idxMatch = /^(Index Only Scan|Index Scan)(?: (Backward))? using (\S+) on (.+)$/.exec(t);
  if (idxMatch) {
    node.nodeType = idxMatch[1]!;
    node.scanDirection = idxMatch[2] ?? 'Forward';
    node.indexName = unquote(idxMatch[3]!);
    assignTarget(idxMatch[4]!, node);
    return;
  }

  const bIdxMatch = /^Bitmap Index Scan on (.+)$/.exec(t);
  if (bIdxMatch) {
    node.nodeType = 'Bitmap Index Scan';
    node.indexName = unquote(bIdxMatch[1]!);
    return;
  }

  const subqMatch = /^Subquery Scan on (.+)$/.exec(t);
  if (subqMatch) {
    node.nodeType = 'Subquery Scan';
    node.alias = unquote(subqMatch[1]!);
    return;
  }

  const scanMatch = /^(Seq Scan|Sample Scan|Bitmap Heap Scan|Tid Scan|Tid Range Scan|CTE Scan|WorkTable Scan|Named Tuplestore Scan|Function Scan|Table Function Scan|Values Scan|Foreign Scan|Custom Scan) on (.+)$/.exec(t);
  if (scanMatch) {
    node.nodeType = scanMatch[1]!;
    if (node.nodeType === 'CTE Scan') {
      const parts = splitTarget(scanMatch[2]!);
      node.cteName = parts.name;
      node.alias = parts.alias;
    } else if (node.nodeType === 'Values Scan') {
      node.alias = unquote(scanMatch[2]!);
    } else {
      assignTarget(scanMatch[2]!, node);
    }
    return;
  }

  const joinMatch = /^(Hash|Merge|Nested Loop)(?: (Left|Right|Full|Semi|Anti|Right Semi|Right Anti))? Join$/.exec(t);
  if (joinMatch) {
    node.nodeType =
      joinMatch[1] === 'Hash' ? 'Hash Join' : joinMatch[1] === 'Merge' ? 'Merge Join' : 'Nested Loop';
    node.joinType = joinMatch[2] ?? 'Inner';
    return;
  }

  const aggMatch = /^(?:(Partial|Finalize) )?(HashAggregate|GroupAggregate|MixedAggregate|Aggregate)$/.exec(t);
  if (aggMatch) {
    node.nodeType = 'Aggregate';
    node.partialMode = aggMatch[1] ?? 'Simple';
    node.strategy =
      aggMatch[2] === 'HashAggregate'
        ? 'Hashed'
        : aggMatch[2] === 'GroupAggregate'
          ? 'Sorted'
          : aggMatch[2] === 'MixedAggregate'
            ? 'Mixed'
            : 'Plain';
    return;
  }

  const setOpMatch = /^(HashSetOp|SetOp)(?: (.+))?$/.exec(t);
  if (setOpMatch) {
    node.nodeType = 'SetOp';
    node.strategy = setOpMatch[1] === 'HashSetOp' ? 'Hashed' : 'Sorted';
    node.command = setOpMatch[2];
    return;
  }

  node.nodeType = t;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

function splitTarget(raw: string): { schema?: string; name?: string; alias?: string } {
  const tokens: string[] = [];
  let i = 0;
  const s = raw.trim();
  while (i < s.length) {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      let end = i + 1;
      while (end < s.length) {
        if (s[end] === '"' && s[end + 1] === '"') end += 2;
        else if (s[end] === '"') {
          end++;
          break;
        } else end++;
      }
      tokens.push(s.slice(i, end));
      i = end;
    } else {
      let end = i;
      while (end < s.length && s[end] !== ' ') end++;
      tokens.push(s.slice(i, end));
      i = end;
    }
  }
  const first = tokens[0] ?? '';
  const dot = first.indexOf('.');
  let schema: string | undefined;
  let name: string | undefined;
  if (dot > 0 && !first.startsWith('"')) {
    schema = unquote(first.slice(0, dot));
    name = unquote(first.slice(dot + 1));
  } else {
    name = unquote(first);
  }
  const alias = tokens[1] ? unquote(tokens[1]) : name;
  return { schema, name, alias };
}

function assignTarget(raw: string, node: PlanNode): void {
  const { schema, name, alias } = splitTarget(raw);
  node.schema = schema;
  node.relationName = name;
  node.alias = alias;
}

function applySortGroupLine(trimmed: string): { kind: 'full' | 'pre'; stats: SortGroupStats } | undefined {
  const m = /^(Full-sort|Pre-sorted) Groups:\s*(\d+)\s+Sort Methods?:\s*(.+)$/.exec(trimmed);
  if (!m) return undefined;
  const kind = m[1] === 'Full-sort' ? 'full' : 'pre';
  const groupCount = Number(m[2]);
  const rest = m[3]!;
  const avgMem = /Average Memory:\s*(\d+)kB/.exec(rest);
  const peakMem = /Peak Memory:\s*(\d+)kB/.exec(rest);
  const avgDisk = /Average Disk:\s*(\d+)kB/.exec(rest);
  const peakDisk = /Peak Disk:\s*(\d+)kB/.exec(rest);
  const methodsPart = rest.split(/\s{2,}Average /)[0]!.trim();
  const sortMethodsUsed = methodsPart.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    kind,
    stats: {
      groupCount,
      sortMethodsUsed,
      memoryAvgKb: avgMem ? Number(avgMem[1]) : undefined,
      memoryPeakKb: peakMem ? Number(peakMem[1]) : undefined,
      diskAvgKb: avgDisk ? Number(avgDisk[1]) : undefined,
      diskPeakKb: peakDisk ? Number(peakDisk[1]) : undefined,
    },
  };
}

function parseNodeDetailLine(trimmed: string, node: PlanNode): void {
  if (trimmed === 'Disabled: true') {
    node.disabled = true;
    return;
  }
  if (trimmed === 'Inner Unique: true') {
    node.innerUnique = true;
    return;
  }
  if (trimmed === 'Single Copy: true') {
    node.singleCopy = true;
    return;
  }
  if (parseBuffersLine(trimmed, node.buffers)) return;
  const io = parseIoLine(trimmed);
  if (io) {
    node.ioTimings = io;
    return;
  }
  const wal = parseWalLine(trimmed);
  if (wal) {
    node.wal = wal;
    return;
  }
  const sg = applySortGroupLine(trimmed);
  if (sg) {
    if (sg.kind === 'full') node.fullSortGroups = sg.stats;
    else node.presortedGroups = sg.stats;
    return;
  }

  if (trimmed.startsWith('Sort Method:')) {
    const m = /^Sort Method:\s*(.+?)\s{2,}(Memory|Disk):\s*(\d+)kB$/.exec(trimmed);
    if (m) {
      node.sortMethod = m[1]!.trim();
      node.sortSpaceType = m[2];
      node.sortSpaceUsedKb = Number(m[3]);
    } else {
      node.sortMethod = trimmed.slice('Sort Method:'.length).trim();
    }
    return;
  }

  if (trimmed.startsWith('Buckets:')) {
    const bk = /Buckets:\s*(\d+)/.exec(trimmed);
    const bt = /Batches:\s*(\d+)/.exec(trimmed);
    const mu = /Memory Usage:\s*(\d+)kB/.exec(trimmed);
    if (bk) node.hashBuckets = Number(bk[1]);
    if (bt) node.hashBatches = Number(bt[1]);
    if (mu) node.peakMemoryUsageKb = Number(mu[1]);
    return;
  }

  if (trimmed.includes('Batches:') && trimmed.includes('Memory Usage:')) {
    const pp = /Planned Partitions:\s*(\d+)/.exec(trimmed);
    const bt = /Batches:\s*(\d+)/.exec(trimmed);
    const mu = /Memory Usage:\s*(\d+)kB/.exec(trimmed);
    const du = /Disk Usage:\s*(\d+)kB/.exec(trimmed);
    if (pp) node.plannedPartitions = Number(pp[1]);
    if (bt) node.hashAggBatches = Number(bt[1]);
    if (mu) node.peakMemoryUsageKb = Number(mu[1]);
    if (du) node.diskUsageKb = Number(du[1]);
    return;
  }

  if (trimmed.startsWith('Hits:')) {
    const m = /Hits:\s*(\d+)\s+Misses:\s*(\d+)\s+Evictions:\s*(\d+)\s+Overflows:\s*(\d+)\s+Memory Usage:\s*(\d+)kB/.exec(trimmed);
    if (m) {
      node.cacheHits = Number(m[1]);
      node.cacheMisses = Number(m[2]);
      node.cacheEvictions = Number(m[3]);
      node.cacheOverflows = Number(m[4]);
      node.peakMemoryUsageKb = Number(m[5]);
    }
    return;
  }

  if (trimmed.startsWith('Estimates:')) {
    const cap = /capacity=(\d+)/.exec(trimmed);
    const dk = /distinct keys=(\d+(?:\.\d+)?)/.exec(trimmed);
    const lk = /lookups=(\d+(?:\.\d+)?)/.exec(trimmed);
    const hp = /hit percent=(\d+(?:\.\d+)?)%/.exec(trimmed);
    if (cap) node.estimatedCapacity = Number(cap[1]);
    if (dk) node.estimatedDistinctLookupKeys = Number(dk[1]);
    if (lk) node.estimatedLookups = Number(lk[1]);
    if (hp) node.estimatedHitPercent = Number(hp[1]);
    return;
  }

  if (trimmed.startsWith('Heap Blocks:')) {
    const ex = /exact=(\d+)/.exec(trimmed);
    const lo = /lossy=(\d+)/.exec(trimmed);
    if (ex) node.exactHeapBlocks = Number(ex[1]);
    if (lo) node.lossyHeapBlocks = Number(lo[1]);
    return;
  }

  if (trimmed.startsWith('Storage:')) {
    const m = /^Storage:\s*(\S+)\s+Maximum Storage:\s*(\d+)kB/.exec(trimmed);
    if (m) {
      node.storage = m[1];
      node.maximumStorageKb = Number(m[2]);
    }
    return;
  }

  if (trimmed.startsWith('Prefetch:')) {
    const avg = /avg=(\d+(?:\.\d+)?)/.exec(trimmed);
    const max = /max=(\d+)/.exec(trimmed);
    const cap = /capacity=(\d+)/.exec(trimmed);
    node.ioPrefetch = {
      ...(node.ioPrefetch ?? {}),
      avgPrefetchDistance: avg ? Number(avg[1]) : undefined,
      maxPrefetchDistance: max ? Number(max[1]) : undefined,
      prefetchCapacity: cap ? Number(cap[1]) : undefined,
    };
    return;
  }

  if (trimmed.startsWith('I/O:')) {
    const cnt = /count=(\d+)/.exec(trimmed);
    const w = /waits=(\d+)/.exec(trimmed);
    const sz = /size=(\d+(?:\.\d+)?)/.exec(trimmed);
    const ip = /in-progress=(\d+(?:\.\d+)?)/.exec(trimmed);
    node.ioPrefetch = {
      ...(node.ioPrefetch ?? {}),
      ioCount: cnt ? Number(cnt[1]) : undefined,
      ioWaits: w ? Number(w[1]) : undefined,
      avgIoSize: sz ? Number(sz[1]) : undefined,
      avgIosInProgress: ip ? Number(ip[1]) : undefined,
    };
    return;
  }

  const colon = trimmed.indexOf(':');
  if (colon <= 0) return;
  const k = trimmed.slice(0, colon).trim();
  const v = trimmed.slice(colon + 1).trim();

  const spec = TEXT_DETAIL_MAP.get(k);
  if (spec) {
    const [, prop, kind] = spec;
    const nodeRec = node as unknown as Record<string, unknown>;
    nodeRec[prop] =
      kind === 's'
        ? v
        : kind === 'n'
          ? Number(v)
          : kind === 'b'
            ? v === 'true'
            : splitTopLevelCommaList(v);
    return;
  }

  if (k === 'Sampling') {
    const sm = /^(\S+)\s*\((.*)\)(?:\s+REPEATABLE\s+\((.*)\))?$/.exec(v);
    if (sm) {
      node.samplingMethod = sm[1];
      node.samplingParameters = splitTopLevelCommaList(sm[2]!);
      node.repeatableSeed = sm[3];
    }
  }
}

function splitTopLevelCommaList(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "'" && !inDouble) {
      if (inSingle && input[i + 1] === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (ch === '(' || ch === '[') depth++;
      else if ((ch === ')' || ch === ']') && depth > 0) depth--;
      else if (ch === ',' && depth === 0) {
        out.push(input.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  const tail = input.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function stripPsqlDecorations(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === '') start++;
  if (start < lines.length && lines[start]!.trim() === 'QUERY PLAN') {
    start++;
    if (start < lines.length && /^-+$/.test(lines[start]!.trim())) start++;
  }
  let end = lines.length;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  if (end > start && /^\(\d+\s+rows?\)$/.test(lines[end - 1]!.trim())) end--;
  return lines.slice(start, end);
}

function isTopLevelFooterStart(trimmed: string): boolean {
  return (
    trimmed === 'Planning:' ||
    trimmed.startsWith('Planning Time:') ||
    trimmed.startsWith('Execution Time:') ||
    trimmed.startsWith('Trigger ') ||
    trimmed === 'Trigger:' ||
    trimmed === 'JIT:' ||
    trimmed.startsWith('Serialization:') ||
    trimmed.startsWith('Settings:') ||
    trimmed.startsWith('Query Identifier:') ||
    trimmed.startsWith('Query ID:') ||
    trimmed.startsWith('Query Text:') ||
    trimmed.startsWith('Query Parameters:')
  );
}

function parseWorkerTail(tail: string, w: WorkerStats): void {
  const t = tail.trim();
  if (!t) return;
  const act = /^actual(?:\s+time=(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?))?\s+rows=(\d+(?:\.\d+)?)\s+loops=(\d+)/.exec(t);
  if (act) {
    if (act[1] !== undefined) w.actualStartupTime = Number(act[1]);
    if (act[2] !== undefined) w.actualTotalTime = Number(act[2]);
    w.actualRows = Number(act[3]);
    w.actualLoops = Number(act[4]);
    return;
  }
  if (t.startsWith('Buffers:')) {
    w.buffers = w.buffers ?? emptyBufferStats();
    parseBuffersLine(t, w.buffers);
    return;
  }
  const io = parseIoLine(t);
  if (io) {
    w.ioTimings = io;
    return;
  }
  const wal = parseWalLine(t);
  if (wal) {
    w.wal = wal;
    return;
  }
  if (t.startsWith('Sort Method:')) {
    const m = /^Sort Method:\s*(.+?)\s{2,}(Memory|Disk):\s*(\d+)kB$/.exec(t);
    if (m) {
      w.sortMethod = m[1]!.trim();
      w.sortSpaceType = m[2];
      w.sortSpaceUsedKb = Number(m[3]);
    }
    return;
  }
  if (t.startsWith('Heap Blocks:')) {
    const ex = /exact=(\d+)/.exec(t);
    const lo = /lossy=(\d+)/.exec(t);
    if (ex) w.exactHeapBlocks = Number(ex[1]);
    if (lo) w.lossyHeapBlocks = Number(lo[1]);
    return;
  }
  if (t.startsWith('Storage:')) {
    const m = /^Storage:\s*(\S+)\s+Maximum Storage:\s*(\d+)kB/.exec(t);
    if (m) {
      w.storage = m[1];
      w.maximumStorageKb = Number(m[2]);
    }
    return;
  }
  if (t.startsWith('Hits:')) {
    const m = /Hits:\s*(\d+)\s+Misses:\s*(\d+)\s+Evictions:\s*(\d+)\s+Overflows:\s*(\d+)\s+Memory Usage:\s*(\d+)kB/.exec(t);
    if (m) {
      w.cacheHits = Number(m[1]);
      w.cacheMisses = Number(m[2]);
      w.cacheEvictions = Number(m[3]);
      w.cacheOverflows = Number(m[4]);
      w.peakMemoryKb = Number(m[5]);
    }
  }
}

function parseJitTextLines(lines: string[], jit: JitStats): void {
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith('Functions:')) {
      jit.functions = Number(t.slice('Functions:'.length).trim());
    } else if (t.startsWith('Options:')) {
      const b = t.slice('Options:'.length);
      const getBool = (k: string) => {
        const m = new RegExp(`${k}\\s+(true|false)`, 'i').exec(b);
        return m ? m[1]!.toLowerCase() === 'true' : undefined;
      };
      jit.options = {
        inlining: getBool('Inlining'),
        optimization: getBool('Optimization'),
        expressions: getBool('Expressions'),
        deforming: getBool('Deforming'),
      };
    } else if (t.startsWith('Timing:')) {
      const b = t.slice('Timing:'.length);
      const getNum = (k: string) => {
        const m = new RegExp(`${k}\\s+(\\d+(?:\\.\\d+)?)\\s+ms`, 'i').exec(b);
        return m ? Number(m[1]) : undefined;
      };
      jit.timing = {
        generationMs: getNum('Generation'),
        deformMs: getNum('Deform'),
        inliningMs: getNum('Inlining'),
        optimizationMs: getNum('Optimization'),
        emissionMs: getNum('Emission'),
        totalMs: getNum('Total'),
      };
    }
  }
}

function parseTextPlan(raw: string): Omit<ParsedExplain, ComputedMetricFields> {
  const lines = stripPsqlDecorations(raw);
  if (lines.length === 0) {
    throw new Error('Empty EXPLAIN input');
  }

  const rootLine = lines[0]!;
  const rootIndent = rootLine.length - rootLine.trimStart().length;
  const counter = { n: 0 };
  const root = createEmptyNode(`n${counter.n++}`, 0);
  parseNodeHeader(rootLine.trim(), root);

  if (root.nodeType === 'Unknown' || (!rootLine.includes('(cost=') && !rootLine.includes('(actual') && !rootLine.includes('(never executed)') && lines.length === 1 && !/^(Seq|Index|Bitmap|Sort|Hash|Limit|Result|Aggregate|Nested|Merge|Gather|Append|Unique|Subquery|Values|Function|CTE|Materialize|Memoize|WindowAgg|LockRows|ProjectSet|SetOp|Recursive|ModifyTable|Insert|Update|Delete)/i.test(root.nodeType))) {
    throw new Error('Input does not look like a valid PostgreSQL EXPLAIN plan');
  }

  interface Frame {
    node: PlanNode;
    nodeIndent: number;
    pendingSubplan?: string;
    activeWorker?: { stats: WorkerStats; indent: number; inJit: boolean; jitLines: string[] };
  }

  const stack: Frame[] = [{ node: root, nodeIndent: rootIndent }];
  const footerLines: string[] = [];
  let inFooter = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indent = line.length - line.trimStart().length;

    if (!inFooter && indent <= rootIndent + 1 && isTopLevelFooterStart(trimmed)) {
      inFooter = true;
    }
    if (inFooter) {
      footerLines.push(line);
      continue;
    }

    const arrowMatch = /^(\s*)->\s+(.+)$/.exec(line);
    if (arrowMatch) {
      const arrowIndent = arrowMatch[1]!.length;
      while (stack.length > 1 && arrowIndent <= stack[stack.length - 1]!.nodeIndent) {
        stack.pop();
      }
      const parentFrame = stack[stack.length - 1]!;
      parentFrame.activeWorker = undefined;
      const child = createEmptyNode(`n${counter.n++}`, parentFrame.node.depth + 1);
      parseNodeHeader(arrowMatch[2]!, child);

      if (parentFrame.pendingSubplan) {
        child.subplanName = parentFrame.pendingSubplan;
        child.parentRelationship = /^(CTE |InitPlan )/.test(parentFrame.pendingSubplan)
          ? 'InitPlan'
          : 'SubPlan';
        parentFrame.pendingSubplan = undefined;
      } else {
        child.parentRelationship = parentFrame.node.plans.length === 0 ? 'Outer' : 'Inner';
      }

      parentFrame.node.plans.push(child);
      stack.push({ node: child, nodeIndent: arrowIndent });
      continue;
    }

    // Check for CTE / InitPlan / SubPlan headers
    if (/^(CTE \S+|InitPlan \d+.*|SubPlan \d+.*)$/.test(trimmed)) {
      while (stack.length > 1 && indent <= stack[stack.length - 1]!.nodeIndent) {
        stack.pop();
      }
      const owner = stack[stack.length - 1]!;
      owner.activeWorker = undefined;
      owner.pendingSubplan = trimmed;
      continue;
    }

    // Pop stack if indent returned to an ancestor's detail level (outside active worker)
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.nodeIndent) {
      stack.pop();
    }
    const top = stack[stack.length - 1]!;

    if (top.activeWorker) {
      if (indent > top.activeWorker.indent) {
        if (top.activeWorker.inJit) {
          top.activeWorker.jitLines.push(line);
        } else if (trimmed === 'JIT:') {
          top.activeWorker.inJit = true;
        } else {
          parseWorkerTail(trimmed, top.activeWorker.stats);
        }
        continue;
      } else {
        if (top.activeWorker.jitLines.length > 0) {
          const jit: JitStats = { functions: 0, options: {} };
          parseJitTextLines(top.activeWorker.jitLines, jit);
          top.activeWorker.stats.jit = jit;
        }
        top.activeWorker = undefined;
      }
    }

    const wm = /^Worker (\d+):\s*(.*)$/.exec(trimmed);
    if (wm) {
      const wn = Number(wm[1]);
      top.node.workers = top.node.workers ?? [];
      let w = top.node.workers.find((x) => x.workerNumber === wn);
      if (!w) {
        w = { workerNumber: wn };
        top.node.workers.push(w);
      }
      parseWorkerTail(wm[2]!, w);
      top.activeWorker = { stats: w, indent, inJit: false, jitLines: [] };
      continue;
    }

    parseNodeDetailLine(trimmed, top.node);
  }

  // Parse footer sections
  let planningTimeMs: number | undefined;
  let executionTimeMs: number | undefined;
  let planning: PlanningStats | undefined;
  let jit: JitStats | undefined;
  let serialization: SerializationStats | undefined;
  let settings: Record<string, string> | undefined;
  let queryIdentifier: string | undefined;
  let queryText: string | undefined;
  let queryParameters: string | undefined;
  const triggers: TriggerInfo[] = [];

  let section: 'none' | 'planning' | 'jit' | 'serialization' = 'none';
  const jitLines: string[] = [];

  for (const line of footerLines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (indent <= rootIndent + 1 && section === 'jit' && trimmed !== 'JIT:') {
      if (jit && jitLines.length > 0) parseJitTextLines(jitLines, jit);
      section = 'none';
    }
    if (indent <= rootIndent + 1 && section !== 'none' && !trimmed.startsWith('Buffers:') && !trimmed.startsWith('I/O Timings:') && !trimmed.startsWith('Memory:')) {
      if (section !== 'jit') section = 'none';
    }

    if (trimmed === 'Planning:') {
      section = 'planning';
      planning = planning ?? {};
      continue;
    }
    if (trimmed === 'JIT:') {
      section = 'jit';
      jit = { functions: 0, options: {} };
      continue;
    }
    if (trimmed.startsWith('Serialization:')) {
      section = 'serialization';
      const tm = /time=(\d+(?:\.\d+)?)\s*ms/.exec(trimmed);
      const om = /output=(\d+)kB/.exec(trimmed);
      const fm = /format=(\S+)/.exec(trimmed);
      serialization = {
        timeMs: tm ? Number(tm[1]) : undefined,
        outputKb: om ? Number(om[1]) : 0,
        format: fm ? fm[1]! : 'text',
      };
      continue;
    }

    if (section === 'jit') {
      jitLines.push(line);
      continue;
    }
    if (section === 'planning' && planning) {
      if (trimmed.startsWith('Buffers:')) {
        planning.buffers = planning.buffers ?? emptyBufferStats();
        parseBuffersLine(trimmed, planning.buffers);
        continue;
      }
      const pio = parseIoLine(trimmed);
      if (pio) {
        planning.ioTimings = pio;
        continue;
      }
      if (trimmed.startsWith('Memory:')) {
        const um = /used=(\d+)(kB|bytes)/.exec(trimmed);
        const am = /allocated=(\d+)(kB|bytes)/.exec(trimmed);
        planning.memoryUsedKb = um ? (um[2] === 'bytes' ? Number(um[1]) / 1024 : Number(um[1])) : undefined;
        planning.memoryAllocatedKb = am ? (am[2] === 'bytes' ? Number(am[1]) / 1024 : Number(am[1])) : undefined;
        planning.memoryUnit = um?.[2] === 'bytes' ? 'bytes' : 'kB';
        continue;
      }
    }
    if (section === 'serialization' && serialization) {
      if (trimmed.startsWith('Buffers:')) {
        serialization.buffers = serialization.buffers ?? emptyBufferStats();
        parseBuffersLine(trimmed, serialization.buffers);
        continue;
      }
      const sio = parseIoLine(trimmed);
      if (sio) {
        serialization.ioTimings = sio;
        continue;
      }
    }

    if (trimmed.startsWith('Planning Time:')) {
      planningTimeMs = parseFloat(trimmed.slice('Planning Time:'.length));
    } else if (trimmed.startsWith('Execution Time:')) {
      executionTimeMs = parseFloat(trimmed.slice('Execution Time:'.length));
    } else if (trimmed.startsWith('Settings:')) {
      settings = parseSettingsLine(trimmed);
    } else if (trimmed.startsWith('Query Identifier:')) {
      queryIdentifier = trimmed.slice('Query Identifier:'.length).trim();
    } else if (trimmed.startsWith('Query ID:')) {
      queryIdentifier = trimmed.slice('Query ID:'.length).trim();
    } else if (trimmed.startsWith('Query Text:')) {
      queryText = trimmed.slice('Query Text:'.length).trim();
    } else if (trimmed.startsWith('Query Parameters:')) {
      queryParameters = trimmed.slice('Query Parameters:'.length).trim();
    } else if (trimmed.startsWith('Trigger')) {
      const m = /^Trigger(?:\s+(.+?))?(?:\s+for constraint\s+(\S+))?(?:\s+on\s+(\S+))?:\s*(?:time=(\d+(?:\.\d+)?)\s+)?calls=(\d+)$/.exec(trimmed);
      if (m) {
        triggers.push({
          name: m[1] ?? m[2] ?? 'Trigger',
          constraintName: m[2],
          relation: m[3],
          timeMs: m[4] !== undefined ? Number(m[4]) : undefined,
          calls: Number(m[5]),
        });
      }
    }
  }
  if (section === 'jit' && jit && jitLines.length > 0) {
    parseJitTextLines(jitLines, jit);
  }

  const flags = detectPlanFlags(root, planning, triggers, jit);
  return {
    plan: root,
    planningTimeMs,
    executionTimeMs,
    planning,
    triggers,
    jit,
    serialization,
    settings,
    queryIdentifier,
    queryText,
    queryParameters,
    sourceFormat: 'text',
    rawText: raw,
    ...flags,
  };
}

function detectPlanFlags(
  root: PlanNode,
  planning?: PlanningStats,
  triggers?: TriggerInfo[],
  jit?: JitStats
): { isAnalyze: boolean; hasCosts: boolean; hasBuffers: boolean; hasTiming: boolean } {
  let isAnalyze = false;
  let hasCosts = false;
  let hasBuffers = !!(planning?.buffers && sumBufferBlocks(planning.buffers) > 0);
  let hasTiming = false;

  const walk = (n: PlanNode) => {
    if (n.actualLoops !== undefined || n.neverExecuted) isAnalyze = true;
    if (n.totalCost !== undefined || n.startupCost !== undefined) hasCosts = true;
    if (n.actualTotalTime !== undefined || n.actualStartupTime !== undefined) hasTiming = true;
    if (sumBufferBlocks(n.buffers) > 0) hasBuffers = true;
    for (const c of n.plans) walk(c);
  };
  walk(root);

  if ((triggers?.length ?? 0) > 0 || jit?.timing) isAnalyze = true;
  return { isAnalyze, hasCosts, hasBuffers, hasTiming };
}

type ComputedMetricFields =
  | 'effectiveTotalTimeMs'
  | 'effectiveTotalCost'
  | 'effectiveTotalBufferBlocks'
  | 'effectiveTotalDiskBlocks'
  | 'effectiveTotalIoMs'
  | 'effectiveTotalCpuMs'
  | 'maxNodeExclusiveTimeMs'
  | 'maxNodeInclusiveTimeMs'
  | 'maxNodeBufferBlocks'
  | 'maxNodeDiskBlocks'
  | 'maxNodeRows'
  | 'maxNodeCost'
  | 'maxNodeIoMs'
  | 'hotPathIds'
  | 'nodeCount'
  | 'neverExecutedCount'
  | 'byRelation'
  | 'byNodeType'
  | 'subplanTargets';

function computeMetrics(base: Omit<ParsedExplain, ComputedMetricFields>): ParsedExplain {
  const { plan } = base;

  const executedCtes = new Set<string>();
  const collectCteScans = (n: PlanNode) => {
    if (n.nodeType === 'CTE Scan' && n.cteName && !n.neverExecuted && (n.actualLoops ?? 0) > 0) {
      executedCtes.add(n.cteName);
    }
    for (const c of n.plans) collectCteScans(c);
  };
  collectCteScans(plan);

  const isParallelGather = (n: PlanNode) => n.nodeType === 'Gather' || n.nodeType === 'Gather Merge';
  const isLazyCteInitPlan = (c: PlanNode) =>
    c.parentRelationship === 'InitPlan' &&
    Boolean(c.subplanName?.startsWith('CTE ')) &&
    executedCtes.has(c.subplanName!.slice(4));

  const walkBottomUp = (node: PlanNode): number => {
    let childCount = 1;
    for (const c of node.plans) {
      childCount += walkBottomUp(c);
    }

    const loops = node.actualLoops ?? 0;
    node.totalActualRows = (node.actualRows ?? 0) * loops;
    node.totalPlanRows = (node.planRows ?? 0) * Math.max(loops, 1);

    // Row estimation factor (comparing per-loop actual vs planned when executed)
    if (base.isAnalyze && !node.neverExecuted && node.planRows !== undefined && node.actualRows !== undefined) {
      const est = node.planRows;
      const act = node.actualRows;
      if (est === act) {
        node.rowEstimateFactor = 1;
        node.rowEstimateDirection = 'exact';
      } else if (act > est) {
        node.rowEstimateDirection = 'under';
        node.rowEstimateFactor = est > 0 ? act / est : Number.POSITIVE_INFINITY;
      } else {
        node.rowEstimateDirection = 'over';
        node.rowEstimateFactor = act > 0 ? est / act : Number.POSITIVE_INFINITY;
      }
    }

    // Inclusive & exclusive execution time
    const gather = isParallelGather(node);
    if (node.actualTotalTime !== undefined && loops > 0) {
      node.inclusiveTimeMs = node.actualTotalTime * loops;
      let childTimeSum = 0;
      for (const c of node.plans) {
        if (isLazyCteInitPlan(c)) continue;
        if (gather && c.parallelAware) {
          // Parallel workers run concurrently: wall-clock span is per-loop time, not summed across loops
          childTimeSum += c.actualTotalTime ?? 0;
        } else {
          childTimeSum += c.inclusiveTimeMs;
        }
      }
      node.exclusiveTimeMs = Math.max(0, node.inclusiveTimeMs - childTimeSum);
    } else {
      node.inclusiveTimeMs = 0;
      node.exclusiveTimeMs = 0;
    }

    // Cost
    node.inclusiveCost = node.totalCost ?? 0;
    let childCostSum = 0;
    for (const c of node.plans) {
      if (c.nodeType !== 'CTE Scan') childCostSum += c.inclusiveCost;
    }
    node.exclusiveCost = Math.max(0, node.inclusiveCost - childCostSum);

    // Buffers (PostgreSQL accumulates child buffer usage into parent)
    node.totalBufferBlocks = sumBufferBlocks(node.buffers);
    const exB = emptyBufferStats();
    const sumChild = (fn: (b: BufferStats) => number) =>
      node.plans.reduce((acc, c) => (isLazyCteInitPlan(c) ? acc : acc + fn(c.buffers)), 0);
    exB.shared.hit = Math.max(0, node.buffers.shared.hit - sumChild((b) => b.shared.hit));
    exB.shared.read = Math.max(0, node.buffers.shared.read - sumChild((b) => b.shared.read));
    exB.shared.dirtied = Math.max(0, node.buffers.shared.dirtied - sumChild((b) => b.shared.dirtied));
    exB.shared.written = Math.max(0, node.buffers.shared.written - sumChild((b) => b.shared.written));
    exB.local.hit = Math.max(0, node.buffers.local.hit - sumChild((b) => b.local.hit));
    exB.local.read = Math.max(0, node.buffers.local.read - sumChild((b) => b.local.read));
    exB.local.dirtied = Math.max(0, node.buffers.local.dirtied - sumChild((b) => b.local.dirtied));
    exB.local.written = Math.max(0, node.buffers.local.written - sumChild((b) => b.local.written));
    exB.temp.read = Math.max(0, node.buffers.temp.read - sumChild((b) => b.temp.read));
    exB.temp.written = Math.max(0, node.buffers.temp.written - sumChild((b) => b.temp.written));
    node.exclusiveBuffers = exB;
    node.exclusiveBufferBlocks = sumBufferBlocks(exB);
    node.totalDiskBlocks =
      node.buffers.shared.read + node.buffers.local.read + node.buffers.temp.read + node.buffers.temp.written;
    node.exclusiveDiskBlocks =
      exB.shared.read + exB.local.read + exB.temp.read + exB.temp.written;

    // I/O timing & estimated CPU* split
    const nodeIo = (node.ioTimings?.totalReadMs ?? 0) + (node.ioTimings?.totalWriteMs ?? 0);
    const childIo = node.plans.reduce(
      (acc, c) => (isLazyCteInitPlan(c) ? acc : acc + (c.ioTimings?.totalReadMs ?? 0) + (c.ioTimings?.totalWriteMs ?? 0)),
      0
    );
    node.exclusiveIoMs = Math.max(0, nodeIo - childIo);
    node.exclusiveCpuMs = Math.max(0, node.exclusiveTimeMs - node.exclusiveIoMs);

    return childCount;
  };

  const nodeCount = walkBottomUp(plan);

  const effectiveTotalTimeMs =
    base.executionTimeMs && base.executionTimeMs > 0
      ? base.executionTimeMs
      : plan.inclusiveTimeMs > 0
        ? plan.inclusiveTimeMs
        : 0;

  const effectiveTotalCost = plan.inclusiveCost;
  const effectiveTotalBufferBlocks = plan.totalBufferBlocks;
  const effectiveTotalDiskBlocks = plan.totalDiskBlocks;
  const effectiveTotalIoMs =
    (plan.ioTimings?.totalReadMs ?? 0) + (plan.ioTimings?.totalWriteMs ?? 0);

  let maxNodeExclusiveTimeMs = 0;
  let maxNodeInclusiveTimeMs = 0;
  let maxNodeBufferBlocks = 0;
  let maxNodeDiskBlocks = 0;
  let maxNodeRows = 0;
  let maxNodeCost = 0;
  let maxNodeIoMs = 0;
  let neverExecutedCount = 0;

  const relMap = new Map<string, RelationSummary & { _bestTime: number }>();
  const ntMap = new Map<string, NodeTypeSummary & { _bestTime: number }>();
  const subplanTargets: Record<string, string> = {};

  const accStat = <T extends { nodeCount: number; exclusiveTimeMs: number; exclusiveIoMs: number; exclusiveBufferBlocks: number; sharedHit: number; sharedRead: number; hottestNodeId: string; nodeIds: string[]; _bestTime: number }>(
    entry: T,
    node: PlanNode
  ): void => {
    entry.nodeCount++;
    entry.exclusiveTimeMs += node.exclusiveTimeMs;
    entry.exclusiveIoMs += node.exclusiveIoMs;
    entry.exclusiveBufferBlocks += node.exclusiveBufferBlocks;
    entry.sharedHit += node.exclusiveBuffers.shared.hit;
    entry.sharedRead += node.exclusiveBuffers.shared.read;
    entry.nodeIds.push(node.id);
    if (node.exclusiveTimeMs > entry._bestTime) {
      entry._bestTime = node.exclusiveTimeMs;
      entry.hottestNodeId = node.id;
    }
  };

  const walkTopDown = (node: PlanNode) => {
    if (effectiveTotalTimeMs > 0) {
      node.pctExecutionTime = Math.min(100, (node.inclusiveTimeMs / effectiveTotalTimeMs) * 100);
      node.pctExclusiveTime = Math.min(100, (node.exclusiveTimeMs / effectiveTotalTimeMs) * 100);
    }
    if (node.exclusiveTimeMs > maxNodeExclusiveTimeMs) maxNodeExclusiveTimeMs = node.exclusiveTimeMs;
    if (node.inclusiveTimeMs > maxNodeInclusiveTimeMs) maxNodeInclusiveTimeMs = node.inclusiveTimeMs;
    if (node.totalBufferBlocks > maxNodeBufferBlocks) maxNodeBufferBlocks = node.totalBufferBlocks;
    if (node.totalDiskBlocks > maxNodeDiskBlocks) maxNodeDiskBlocks = node.totalDiskBlocks;
    if (node.totalActualRows > maxNodeRows) maxNodeRows = node.totalActualRows;
    if (node.inclusiveCost > maxNodeCost) maxNodeCost = node.inclusiveCost;
    if (node.neverExecuted) neverExecutedCount++;
    const io = (node.ioTimings?.totalReadMs ?? 0) + (node.ioTimings?.totalWriteMs ?? 0);
    if (io > maxNodeIoMs) maxNodeIoMs = io;

    if (node.subplanName) {
      subplanTargets[node.subplanName] = node.id;
    }

    let relName: string | undefined;
    let relKind: 'table' | 'index' | 'cte' = 'table';
    if (node.relationName) {
      relName = node.schema ? `${node.schema}.${node.relationName}` : node.relationName;
    } else if (node.indexName) {
      relName = node.indexName;
      relKind = 'index';
    } else if (node.cteName && node.nodeType === 'CTE Scan') {
      relName = `CTE ${node.cteName}`;
      relKind = 'cte';
    }
    if (relName) {
      let cur = relMap.get(relName);
      if (!cur) {
        cur = {
          name: relName,
          kind: relKind,
          nodeCount: 0,
          exclusiveTimeMs: 0,
          pctTime: 0,
          exclusiveIoMs: 0,
          exclusiveBufferBlocks: 0,
          sharedHit: 0,
          sharedRead: 0,
          tempBlocks: 0,
          hottestNodeId: node.id,
          nodeIds: [],
          _bestTime: -1,
        };
        relMap.set(relName, cur);
      }
      accStat(cur, node);
      cur.tempBlocks += node.exclusiveBuffers.temp.read + node.exclusiveBuffers.temp.written;
    }

    let nt = ntMap.get(node.nodeType);
    if (!nt) {
      nt = {
        nodeType: node.nodeType,
        nodeCount: 0,
        exclusiveTimeMs: 0,
        pctTime: 0,
        exclusiveIoMs: 0,
        exclusiveBufferBlocks: 0,
        sharedHit: 0,
        sharedRead: 0,
        hottestNodeId: node.id,
        nodeIds: [],
        _bestTime: -1,
      };
      ntMap.set(node.nodeType, nt);
    }
    accStat(nt, node);

    for (const c of node.plans) walkTopDown(c);
  };
  walkTopDown(plan);

  const totalExclTimeSum = Array.from(ntMap.values()).reduce((s, x) => s + x.exclusiveTimeMs, 0);
  const pctDenom = effectiveTotalTimeMs > 0 ? effectiveTotalTimeMs : totalExclTimeSum;

  const byRelation: RelationSummary[] = Array.from(relMap.values())
    .map(({ _bestTime: _drop, ...rest }) => ({
      ...rest,
      pctTime: pctDenom > 0 ? Math.min(100, (rest.exclusiveTimeMs / pctDenom) * 100) : 0,
    }))
    .sort((a, b) => b.exclusiveTimeMs - a.exclusiveTimeMs || b.exclusiveBufferBlocks - a.exclusiveBufferBlocks);

  const byNodeType: NodeTypeSummary[] = Array.from(ntMap.values())
    .map(({ _bestTime: _drop, ...rest }) => ({
      ...rest,
      pctTime: pctDenom > 0 ? Math.min(100, (rest.exclusiveTimeMs / pctDenom) * 100) : 0,
    }))
    .sort((a, b) => b.exclusiveTimeMs - a.exclusiveTimeMs || b.exclusiveBufferBlocks - a.exclusiveBufferBlocks);

  const effectiveTotalCpuMs = Math.max(0, effectiveTotalTimeMs - effectiveTotalIoMs);

  // Compute hot path (nodes accounting for >= 25% inclusive time or leading to the slowest exclusive node)
  const hotPathIds = new Set<string>();
  const findHotBranch = (node: PlanNode): boolean => {
    let childHot = false;
    for (const c of node.plans) {
      if (findHotBranch(c)) childHot = true;
    }
    const isSelfHot =
      (maxNodeExclusiveTimeMs > 0 && node.exclusiveTimeMs >= maxNodeExclusiveTimeMs * 0.5) ||
      (effectiveTotalTimeMs > 0 && node.pctExclusiveTime >= 20) ||
      (!base.hasTiming && maxNodeCost > 0 && node.exclusiveCost >= maxNodeCost * 0.4);
    if (isSelfHot || childHot) {
      hotPathIds.add(node.id);
      return true;
    }
    return false;
  };
  findHotBranch(plan);

  return {
    ...base,
    effectiveTotalTimeMs,
    effectiveTotalCost,
    effectiveTotalBufferBlocks,
    effectiveTotalDiskBlocks,
    effectiveTotalIoMs,
    effectiveTotalCpuMs,
    maxNodeExclusiveTimeMs,
    maxNodeInclusiveTimeMs,
    maxNodeBufferBlocks,
    maxNodeDiskBlocks,
    maxNodeRows,
    maxNodeCost,
    maxNodeIoMs,
    hotPathIds,
    nodeCount,
    neverExecutedCount,
    byRelation,
    byNodeType,
    subplanTargets,
  };
}

function parseJsonExplain(rawInput: string | unknown): Omit<ParsedExplain, ComputedMetricFields> {
  let rawJsonString: string | undefined;
  let parsed: unknown;
  let rawQueryId: string | undefined;

  if (typeof rawInput === 'string') {
    rawJsonString = rawInput.trim();
    // Preserve exact 64-bit signed Query Identifier before JS float64 rounding
    const qidMatch = /"Query Identifier"\s*:\s*(-?\d+)/.exec(rawJsonString);
    if (qidMatch) rawQueryId = qidMatch[1];
    parsed = JSON.parse(rawJsonString);
  } else {
    parsed = rawInput;
  }

  const rootDoc = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!rootDoc || typeof rootDoc !== 'object' || !('Plan' in rootDoc)) {
    throw new Error('Invalid EXPLAIN JSON: missing top-level "Plan" object');
  }
  const doc = rootDoc as JsonObj;
  const planObj = doc['Plan'];
  if (!planObj || typeof planObj !== 'object') {
    throw new Error('Invalid EXPLAIN JSON: "Plan" must be an object');
  }

  const plan = parseJsonNode(planObj as JsonObj, 0, { n: 0 });
  const planningTimeMs = num(doc['Planning Time']);
  const executionTimeMs = num(doc['Execution Time']);

  let planning: PlanningStats | undefined;
  if (doc['Planning'] && typeof doc['Planning'] === 'object') {
    const p = doc['Planning'] as JsonObj;
    planning = {
      buffers: parseBuffersFromObj(p),
      ioTimings: parseIoFromObj(p),
      memoryUsedKb: num(p['Memory Used']),
      memoryAllocatedKb: num(p['Memory Allocated']),
      memoryUnit: 'kB',
    };
  }

  const triggers: TriggerInfo[] = Array.isArray(doc['Triggers'])
    ? doc['Triggers']
        .filter((t): t is JsonObj => !!t && typeof t === 'object')
        .map((t) => ({
          name: str(t['Trigger Name']) ?? 'Trigger',
          constraintName: str(t['Constraint Name']),
          relation: str(t['Relation']),
          timeMs: num(t['Time']),
          calls: num(t['Calls']) ?? 0,
        }))
    : [];

  const jit = parseJitFromObj(doc['JIT']);

  let serialization: SerializationStats | undefined;
  if (doc['Serialization'] && typeof doc['Serialization'] === 'object') {
    const s = doc['Serialization'] as JsonObj;
    serialization = {
      timeMs: num(s['Time']),
      outputKb: num(s['Output Volume']) ?? 0,
      format: str(s['Format']) ?? 'text',
      buffers:
        s['Shared Hit Blocks'] !== undefined || s['Temp Read Blocks'] !== undefined
          ? parseBuffersFromObj(s)
          : undefined,
      ioTimings: parseIoFromObj(s),
    };
  }

  let settings: Record<string, string> | undefined;
  if (doc['Settings'] && typeof doc['Settings'] === 'object') {
    const s = doc['Settings'] as JsonObj;
    const entries = Object.entries(s).filter(([, v]) => typeof v === 'string');
    if (entries.length > 0) {
      settings = Object.fromEntries(entries) as Record<string, string>;
    }
  }

  let queryIdentifier = rawQueryId;
  if (!queryIdentifier && doc['Query Identifier'] !== undefined && doc['Query Identifier'] !== null) {
    queryIdentifier = String(doc['Query Identifier']);
  }

  const flags = detectPlanFlags(plan, planning, triggers, jit);
  return {
    plan,
    planningTimeMs,
    executionTimeMs,
    planning,
    triggers,
    jit,
    serialization,
    settings,
    queryIdentifier,
    queryText: str(doc['Query Text']),
    queryParameters: str(doc['Query Parameters']),
    sourceFormat: 'json',
    rawJson: parsed,
    rawJsonString,
    ...flags,
  };
}

export function parsePlan(input: string | unknown): ParsedExplain {
  if (input === null || input === undefined) {
    throw new Error('Empty EXPLAIN input');
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Empty EXPLAIN input');
    }
    const stripped = stripPsqlDecorations(trimmed).join('\n').trim();
    if (stripped.startsWith('[') || stripped.startsWith('{')) {
      return computeMetrics(parseJsonExplain(stripped));
    }
    return computeMetrics(parseTextPlan(trimmed));
  }
  return computeMetrics(parseJsonExplain(input));
}
