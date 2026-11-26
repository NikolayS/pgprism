export type ViewMode = 'table' | 'tree' | 'flame' | 'text' | 'json';
export type MetricMode = 'exclusiveTime' | 'inclusiveTime' | 'buffers' | 'diskReads' | 'ioTime' | 'rows' | 'cost';
export type ThemeMode = 'dark' | 'light' | 'auto';
export interface BufferGroup {
    hit: number;
    read: number;
    dirtied: number;
    written: number;
}
export interface TempBufferGroup {
    read: number;
    written: number;
}
export interface BufferStats {
    shared: BufferGroup;
    local: BufferGroup;
    temp: TempBufferGroup;
}
export interface IoTimingStats {
    readMs?: number;
    writeMs?: number;
    sharedReadMs?: number;
    sharedWriteMs?: number;
    localReadMs?: number;
    localWriteMs?: number;
    tempReadMs?: number;
    tempWriteMs?: number;
    totalReadMs: number;
    totalWriteMs: number;
}
export interface SortGroupStats {
    groupCount: number;
    sortMethodsUsed: string[];
    memoryAvgKb?: number;
    memoryPeakKb?: number;
    diskAvgKb?: number;
    diskPeakKb?: number;
}
export interface WalStats {
    records: number;
    fpi: number;
    bytes: number;
    fpiBytes?: number;
    buffersFull?: number;
}
export interface IoPrefetchStats {
    avgPrefetchDistance?: number;
    maxPrefetchDistance?: number;
    prefetchCapacity?: number;
    ioCount?: number;
    ioWaits?: number;
    avgIoSize?: number;
    avgIosInProgress?: number;
}
export interface WorkerStats {
    workerNumber: number;
    actualStartupTime?: number;
    actualTotalTime?: number;
    actualRows?: number;
    actualLoops?: number;
    buffers?: BufferStats;
    ioTimings?: IoTimingStats;
    wal?: WalStats;
    sortMethod?: string;
    sortSpaceUsedKb?: number;
    sortSpaceType?: string;
    cacheHits?: number;
    cacheMisses?: number;
    cacheEvictions?: number;
    cacheOverflows?: number;
    peakMemoryKb?: number;
    exactHeapBlocks?: number;
    lossyHeapBlocks?: number;
    storage?: string;
    maximumStorageKb?: number;
    jit?: JitStats;
}
export interface PlanNode {
    id: string;
    depth: number;
    nodeType: string;
    displayTitle: string;
    parentRelationship?: string;
    subplanName?: string;
    cteName?: string;
    relationName?: string;
    schema?: string;
    alias?: string;
    indexName?: string;
    scanDirection?: string;
    joinType?: string;
    strategy?: string;
    partialMode?: string;
    operation?: string;
    command?: string;
    customPlanProvider?: string;
    parallelAware: boolean;
    asyncCapable: boolean;
    innerUnique?: boolean;
    singleCopy?: boolean;
    disabled?: boolean;
    replaces?: string;
    subplansRemoved?: number;
    startupCost?: number;
    totalCost?: number;
    planRows?: number;
    planWidth?: number;
    actualStartupTime?: number;
    actualTotalTime?: number;
    actualRows?: number;
    actualLoops?: number;
    neverExecuted: boolean;
    inclusiveTimeMs: number;
    exclusiveTimeMs: number;
    exclusiveCpuMs: number;
    pctExecutionTime: number;
    pctExclusiveTime: number;
    inclusiveCost: number;
    exclusiveCost: number;
    totalActualRows: number;
    totalPlanRows: number;
    rowEstimateFactor: number;
    rowEstimateDirection: 'exact' | 'over' | 'under';
    buffers: BufferStats;
    exclusiveBuffers: BufferStats;
    totalBufferBlocks: number;
    exclusiveBufferBlocks: number;
    totalDiskBlocks: number;
    exclusiveDiskBlocks: number;
    ioTimings?: IoTimingStats;
    exclusiveIoMs: number;
    wal?: WalStats;
    ioPrefetch?: IoPrefetchStats;
    output?: string[];
    filter?: string;
    rowsRemovedByFilter?: number;
    joinFilter?: string;
    rowsRemovedByJoinFilter?: number;
    oneTimeFilter?: string;
    indexCond?: string;
    orderBy?: string;
    recheckCond?: string;
    rowsRemovedByIndexRecheck?: number;
    mergeCond?: string;
    hashCond?: string;
    tidCond?: string;
    functionCall?: string;
    tableFunctionCall?: string;
    samplingMethod?: string;
    samplingParameters?: string[];
    repeatableSeed?: string;
    heapFetches?: number;
    indexSearches?: number;
    exactHeapBlocks?: number;
    lossyHeapBlocks?: number;
    sortKey?: string[];
    presortedKey?: string[];
    sortMethod?: string;
    sortSpaceUsedKb?: number;
    sortSpaceType?: string;
    estimatedGroups?: number;
    fullSortGroups?: SortGroupStats;
    presortedGroups?: SortGroupStats;
    groupKey?: string[];
    hashBuckets?: number;
    originalHashBuckets?: number;
    hashBatches?: number;
    originalHashBatches?: number;
    peakMemoryUsageKb?: number;
    plannedPartitions?: number;
    hashAggBatches?: number;
    diskUsageKb?: number;
    cacheKey?: string;
    cacheMode?: string;
    cacheHits?: number;
    cacheMisses?: number;
    cacheEvictions?: number;
    cacheOverflows?: number;
    estimatedCapacity?: number;
    estimatedDistinctLookupKeys?: number;
    estimatedLookups?: number;
    estimatedHitPercent?: number;
    windowDef?: string;
    runCondition?: string;
    storage?: string;
    maximumStorageKb?: number;
    targetTables?: Array<{
        operation?: string;
        relationName?: string;
        schema?: string;
        alias?: string;
    }>;
    conflictResolution?: string;
    conflictArbiterIndexes?: string[];
    conflictFilter?: string;
    rowsRemovedByConflictFilter?: number;
    tuplesInserted?: number;
    conflictingTuples?: number;
    tuplesUpdated?: number;
    tuplesDeleted?: number;
    tuplesSkipped?: number;
    workersPlanned?: number;
    workersLaunched?: number;
    workers?: WorkerStats[];
    extra?: Record<string, unknown>;
    plans: PlanNode[];
}
export interface TriggerInfo {
    name: string;
    constraintName?: string;
    relation?: string;
    timeMs?: number;
    calls: number;
}
export interface JitStats {
    functions: number;
    options: {
        inlining?: boolean;
        optimization?: boolean;
        expressions?: boolean;
        deforming?: boolean;
    };
    timing?: {
        generationMs?: number;
        deformMs?: number;
        inliningMs?: number;
        optimizationMs?: number;
        emissionMs?: number;
        totalMs?: number;
    };
}
export interface PlanningStats {
    buffers?: BufferStats;
    ioTimings?: IoTimingStats;
    memoryUsedKb?: number;
    memoryAllocatedKb?: number;
    memoryUnit?: 'kB' | 'bytes';
}
export interface SerializationStats {
    timeMs?: number;
    outputKb: number;
    format: string;
    buffers?: BufferStats;
    ioTimings?: IoTimingStats;
}
export interface RelationSummary {
    name: string;
    kind: 'table' | 'index' | 'cte';
    nodeCount: number;
    exclusiveTimeMs: number;
    pctTime: number;
    exclusiveIoMs: number;
    exclusiveBufferBlocks: number;
    sharedHit: number;
    sharedRead: number;
    tempBlocks: number;
    hottestNodeId: string;
    nodeIds: string[];
}
export interface NodeTypeSummary {
    nodeType: string;
    nodeCount: number;
    exclusiveTimeMs: number;
    pctTime: number;
    exclusiveIoMs: number;
    exclusiveBufferBlocks: number;
    sharedHit: number;
    sharedRead: number;
    hottestNodeId: string;
    nodeIds: string[];
}
export interface ParsedExplain {
    plan: PlanNode;
    planningTimeMs?: number;
    executionTimeMs?: number;
    effectiveTotalTimeMs: number;
    effectiveTotalCost: number;
    effectiveTotalBufferBlocks: number;
    effectiveTotalDiskBlocks: number;
    effectiveTotalIoMs: number;
    effectiveTotalCpuMs: number;
    maxNodeExclusiveTimeMs: number;
    maxNodeInclusiveTimeMs: number;
    maxNodeBufferBlocks: number;
    maxNodeDiskBlocks: number;
    maxNodeRows: number;
    maxNodeCost: number;
    maxNodeIoMs: number;
    hotPathIds: Set<string>;
    nodeCount: number;
    neverExecutedCount: number;
    byRelation: RelationSummary[];
    byNodeType: NodeTypeSummary[];
    subplanTargets: Record<string, string>;
    planning?: PlanningStats;
    triggers: TriggerInfo[];
    jit?: JitStats;
    serialization?: SerializationStats;
    settings?: Record<string, string>;
    queryIdentifier?: string;
    queryText?: string;
    queryParameters?: string;
    sourceFormat: 'json' | 'text';
    rawText?: string;
    rawJson?: unknown;
    rawJsonString?: string;
    isAnalyze: boolean;
    hasCosts: boolean;
    hasBuffers: boolean;
    hasTiming: boolean;
}
export type DiagnosticSeverity = 'high' | 'med' | 'low';
export interface Diagnostic {
    id: string;
    severity: DiagnosticSeverity;
    code: string;
    title: string;
    detail: string;
    nodeId: string;
    nodeTitle: string;
    metric?: string;
}
export interface PlanState {
    view: ViewMode;
    metric: MetricMode;
    selectedNodeId: string | null;
}
export interface RenderOptions {
    theme?: ThemeMode;
    view?: ViewMode;
    metric?: MetricMode | 'auto';
    selectedNode?: string | null;
    showDiagnostics?: boolean;
    showHeader?: boolean;
    showToolbar?: boolean;
    maxHeight?: string;
    styleNonce?: string;
    injectStyles?: boolean;
    useShadow?: boolean;
    onSelectNode?: (node: PlanNode | null) => void;
    onStateChange?: (state: PlanState) => void;
}
export interface PlanAnalysis {
    parsed: ParsedExplain;
    diagnostics: Diagnostic[];
    exclusiveTimeMs: number;
    exclusiveIoMs: number;
    exclusiveCpuMs: number;
    totalBufferBlocks: number;
    bufferHitPercent: number | null;
    byRelation: RelationSummary[];
    byNodeType: NodeTypeSummary[];
}
export interface AutoAttachOptions {
    mode?: 'toggle' | 'replace' | 'below';
    theme?: ThemeMode;
    view?: ViewMode;
    showDiagnostics?: boolean;
    selector?: string;
}
export interface AutoAttachResult {
    attached: number;
    elements: HTMLElement[];
    destroy: () => void;
}
export interface JsonToTextOptions {
    verbose?: boolean;
    includeFooter?: boolean;
}
export interface FormatForLLMOptions {
    nodeId?: string;
    includePlan?: boolean;
    verbose?: boolean;
}
