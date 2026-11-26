import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan } from '../src/parser';
import { BITMAP_SUBPLANS_SAMPLE } from './bitmap-subplans-fixture';

test('PG 15 JSON plan: legacy I/O timings, JIT, Memoize, Triggers, Settings, negative 64-bit Query ID', () => {
  const pg15 = JSON.stringify([
    {
      Plan: {
        'Node Type': 'Nested Loop',
        'Parallel Aware': false,
        'Join Type': 'Inner',
        'Startup Cost': 0.15,
        'Total Cost': 22.5,
        'Plan Rows': 10,
        'Plan Width': 16,
        'Actual Startup Time': 0.25,
        'Actual Total Time': 14.5,
        'Actual Rows': 500,
        'Actual Loops': 1,
        'Shared Hit Blocks': 120,
        'Shared Read Blocks': 10,
        'I/O Read Time': 4.125,
        'I/O Write Time': 0.0,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Parent Relationship': 'Outer',
            'Parallel Aware': false,
            'Relation Name': 'orders',
            Alias: 'o',
            'Startup Cost': 0.0,
            'Total Cost': 10.0,
            'Plan Rows': 10,
            'Plan Width': 8,
            'Actual Startup Time': 0.1,
            'Actual Total Time': 5.0,
            'Actual Rows': 500,
            'Actual Loops': 1,
            'Shared Hit Blocks': 80,
            'Shared Read Blocks': 10,
            'I/O Read Time': 4.125,
          },
          {
            'Node Type': 'Memoize',
            'Parent Relationship': 'Inner',
            'Parallel Aware': false,
            'Startup Cost': 0.15,
            'Total Cost': 0.2,
            'Plan Rows': 1,
            'Plan Width': 8,
            'Actual Startup Time': 0.002,
            'Actual Total Time': 0.01,
            'Actual Rows': 1,
            'Actual Loops': 500,
            'Cache Key': 'o.cust_id',
            'Cache Mode': 'logical',
            'Cache Hits': 450,
            'Cache Misses': 50,
            'Cache Evictions': 0,
            'Cache Overflows': 0,
            'Peak Memory Usage': 12,
            'Shared Hit Blocks': 40,
            'Shared Read Blocks': 0,
          },
        ],
      },
      'Query Identifier': -7310968812554926703,
      'Planning Time': 1.25,
      Triggers: [{ 'Trigger Name': 'audit_trg', Relation: 'orders', Time: 0.45, Calls: 5 }],
      JIT: {
        Functions: 6,
        Options: { Inlining: false, Optimization: false, Expressions: true, Deforming: true },
        Timing: { Generation: 0.8, Inlining: 0.0, Optimization: 0.0, Emission: 2.1, Total: 2.9 },
      },
      Settings: { work_mem: '32MB', jit: 'on' },
      'Execution Time': 15.1,
    },
  ]).replace(/-731096881255492\d{4}/g, '-7310968812554926703');

  // Test raw JSON string with exact 64-bit integer literal
  const pg15WithRawQid = pg15.replace('"Execution Time":15.1', '"Query Identifier":-7310968812554926703,"Execution Time":15.1');
  const parsed = parsePlan(pg15WithRawQid);
  assert.equal(parsed.queryIdentifier, '-7310968812554926703');
  assert.equal(parsed.planningTimeMs, 1.25);
  assert.equal(parsed.executionTimeMs, 15.1);
  assert.equal(parsed.triggers.length, 1);
  assert.equal(parsed.jit?.functions, 6);
  assert.equal(parsed.jit?.timing?.totalMs, 2.9);
  assert.equal(parsed.settings?.work_mem, '32MB');
  assert.equal(parsed.plan.ioTimings?.totalReadMs, 4.125);
  // Nested Loop exclusive time: 14.5 - 5.0 - (0.01 * 500 = 5.0) = 4.5 ms
  assert.ok(Math.abs(parsed.plan.exclusiveTimeMs - 4.5) < 1e-6);
  assert.equal(parsed.plan.exclusiveBuffers.shared.hit, 0);
  // Outer seq scan underestimated 50x (500 vs 10)
  const seq = parsed.plan.plans[0]!;
  assert.equal(seq.rowEstimateDirection, 'under');
  assert.equal(seq.rowEstimateFactor, 50);
  // Memoize
  const mem = parsed.plan.plans[1]!;
  assert.equal(mem.cacheHits, 450);
  assert.equal(mem.cacheMisses, 50);
});

test('PG 16 TEXT plan: Parallel Gather, Right Anti Join, COSTS OFF, TIMING OFF, never executed', () => {
  const text = `
QUERY PLAN
--------------------------------------------------------------------
Gather  (cost=1000.00..25000.00 rows=500 width=12) (actual rows=400 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Hash Right Anti Join  (cost=100.00..20000.00 rows=250 width=12) (actual rows=133 loops=3)
        Hash Cond: (b.id = a.id)
        Buffers: shared hit=1200 read=300
        Worker 0:  actual rows=140 loops=1
          Buffers: shared hit=400 read=100
        ->  Parallel Seq Scan on public.big_a a  (cost=0.00..15000.00 rows=100000 width=8) (actual rows=100000 loops=3)
              Buffers: shared hit=900 read=200
        ->  Hash  (cost=50.00..50.00 rows=1000 width=4) (never executed)
              Buckets: 1024  Batches: 1  Memory Usage: 44kB
Planning Time: 0.450 ms
Execution Time: 42.100 ms
(12 rows)
`;
  const parsed = parsePlan(text);
  assert.equal(parsed.plan.nodeType, 'Gather');
  assert.equal(parsed.plan.workersPlanned, 2);
  assert.equal(parsed.plan.workersLaunched, 2);
  assert.equal(parsed.hasTiming, false);
  assert.equal(parsed.isAnalyze, true);
  assert.equal(parsed.hasBuffers, true);
  const join = parsed.plan.plans[0]!;
  assert.equal(join.nodeType, 'Hash Join');
  assert.equal(join.joinType, 'Right Anti');
  assert.equal(join.workers?.length, 1);
  assert.equal(join.workers?.[0]?.buffers?.shared.read, 100);
  const hashNode = join.plans[1]!;
  assert.equal(hashNode.neverExecuted, true);
  assert.equal(hashNode.actualLoops, 0);

  // Plan without COSTS
  const noCost = parsePlan(`Seq Scan on users (actual time=0.010..0.020 rows=5 loops=1)\n  Filter: active`);
  assert.equal(noCost.hasCosts, false);
  assert.equal(noCost.plan.filter, 'active');
  assert.equal(noCost.plan.actualRows, 5);
});

test('PG 17 JSON & TEXT: Planning Memory, Serialization, Split I/O Timings, Right Semi Join', () => {
  const pg17 = [
    {
      Plan: {
        'Node Type': 'Hash Join',
        'Join Type': 'Right Semi',
        'Parallel Aware': false,
        'Startup Cost': 1.0,
        'Total Cost': 10.0,
        'Plan Rows': 50,
        'Plan Width': 8,
        'Actual Startup Time': 0.5,
        'Actual Total Time': 4.2,
        'Actual Rows': 50,
        'Actual Loops': 1,
        'Shared Hit Blocks': 20,
        'Shared Read Blocks': 5,
        'Temp Read Blocks': 2,
        'Temp Written Blocks': 3,
        'Shared I/O Read Time': 1.25,
        'Shared I/O Write Time': 0.15,
        'Temp I/O Read Time': 0.4,
        'Temp I/O Write Time': 0.6,
      },
      Planning: {
        'Shared Hit Blocks': 45,
        'Memory Used': 128,
        'Memory Allocated': 256,
      },
      'Planning Time': 0.55,
      Serialization: {
        Time: 0.85,
        'Output Volume': 42,
        Format: 'text',
        'Shared Hit Blocks': 2,
      },
      'Execution Time': 5.1,
    },
  ];

  const parsed = parsePlan(pg17);
  assert.equal(parsed.plan.joinType, 'Right Semi');
  assert.equal(parsed.planning?.memoryUsedKb, 128);
  assert.equal(parsed.planning?.memoryAllocatedKb, 256);
  assert.equal(parsed.serialization?.outputKb, 42);
  assert.equal(parsed.serialization?.format, 'text');
  assert.equal(parsed.serialization?.timeMs, 0.85);
  assert.ok(Math.abs((parsed.plan.ioTimings?.totalReadMs ?? 0) - 1.65) < 1e-6);
  assert.ok(Math.abs((parsed.plan.ioTimings?.totalWriteMs ?? 0) - 0.75) < 1e-6);

  // TEXT variant
  const pg17Text = `
Hash Right Semi Join  (cost=1.00..10.00 rows=50 width=8) (actual time=0.500..4.200 rows=50 loops=1)
  Buffers: shared hit=20 read=5, temp read=2 written=3
  I/O Timings: shared read=1.250 write=0.150, temp read=0.400 write=0.600
Planning:
  Buffers: shared hit=45
  Memory: used=128kB  allocated=256kB
Planning Time: 0.550 ms
Serialization: time=0.850 ms  output=42kB  format=text
  Buffers: shared hit=2
Execution Time: 5.100 ms`;
  const parsedTxt = parsePlan(pg17Text);
  assert.equal(parsedTxt.planning?.memoryUsedKb, 128);
  assert.equal(parsedTxt.serialization?.outputKb, 42);
  assert.equal(parsedTxt.plan.ioTimings?.tempWriteMs, 0.6);
});

test('PG 18 JSON & TEXT: fractional Actual Rows, Disabled, Index Searches, Storage, WAL Buffers Full, Window', () => {
  const pg18 = [
    {
      Plan: {
        'Node Type': 'WindowAgg',
        'Parallel Aware': false,
        'Startup Cost': 1.0,
        'Total Cost': 25.0,
        'Plan Rows': 10,
        'Plan Width': 16,
        'Actual Startup Time': 0.2,
        'Actual Total Time': 1.5,
        'Actual Rows': 10.0,
        'Actual Loops': 1,
        Disabled: false,
        Window: 'w1 AS (PARTITION BY grp ORDER BY id)',
        'Run Condition': '(row_number() OVER w1 <= 2)',
        Storage: 'Memory',
        'Maximum Storage': 33,
        'WAL Records': 4,
        'WAL FPI': 1,
        'WAL Bytes': 512,
        'WAL Buffers Full': 2,
        Plans: [
          {
            'Node Type': 'Index Only Scan',
            'Parent Relationship': 'Outer',
            'Parallel Aware': false,
            'Scan Direction': 'Forward',
            'Index Name': 't_grp_id_idx',
            'Relation Name': 't',
            Alias: 't',
            'Startup Cost': 0.14,
            'Total Cost': 10.0,
            'Plan Rows': 5,
            'Plan Width': 8,
            'Actual Startup Time': 0.01,
            'Actual Total Time': 0.05,
            'Actual Rows': 0.5,
            'Actual Loops': 20,
            Disabled: true,
            'Heap Fetches': 3,
            'Index Searches': 20,
          },
        ],
      },
      'Planning Time': 0.2,
      'Execution Time': 1.7,
    },
  ];
  const parsed = parsePlan(pg18);
  assert.equal(parsed.plan.windowDef, 'w1 AS (PARTITION BY grp ORDER BY id)');
  assert.equal(parsed.plan.storage, 'Memory');
  assert.equal(parsed.plan.maximumStorageKb, 33);
  assert.equal(parsed.plan.wal?.buffersFull, 2);
  const child = parsed.plan.plans[0]!;
  assert.equal(child.disabled, true);
  assert.equal(child.indexSearches, 20);
  assert.equal(child.actualRows, 0.5);
  assert.equal(child.totalActualRows, 10);
});

test('PG 19 JSON & TEXT: Replaces, WAL FPI Bytes, Memoize Estimates, EXPLAIN (IO), ON CONFLICT', () => {
  const pg19 = [
    {
      Plan: {
        'Node Type': 'ModifyTable',
        Operation: 'Insert',
        'Relation Name': 'kv',
        Alias: 'kv',
        'Startup Cost': 0.0,
        'Total Cost': 15.0,
        'Plan Rows': 0,
        'Plan Width': 0,
        'Actual Startup Time': 0.1,
        'Actual Total Time': 2.0,
        'Actual Rows': 0.0,
        'Actual Loops': 1,
        'Conflict Resolution': 'SELECT FOR UPDATE',
        'Conflict Arbiter Indexes': ['kv_pkey'],
        'Tuples Inserted': 8,
        'Conflicting Tuples': 2,
        'WAL Records': 10,
        'WAL FPI': 2,
        'WAL Bytes': 4096,
        'WAL FPI Bytes': 3200,
        Plans: [
          {
            'Node Type': 'Nested Loop',
            'Parent Relationship': 'Outer',
            'Join Type': 'Inner',
            'Parallel Aware': false,
            'Startup Cost': 0.0,
            'Total Cost': 12.0,
            'Plan Rows': 10,
            'Plan Width': 8,
            'Actual Startup Time': 0.05,
            'Actual Total Time': 1.2,
            'Actual Rows': 10.0,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'Seq Scan',
                'Parent Relationship': 'Outer',
                'Parallel Aware': false,
                'Relation Name': 'src',
                Alias: 'src',
                'Startup Cost': 0.0,
                'Total Cost': 5.0,
                'Plan Rows': 10,
                'Plan Width': 8,
                'Actual Startup Time': 0.01,
                'Actual Total Time': 0.5,
                'Actual Rows': 10.0,
                'Actual Loops': 1,
                'Average Prefetch Distance': 4.5,
                'Max Prefetch Distance': 16,
                'Prefetch Capacity': 32,
                'I/O Count': 3,
                'I/O Waits': 1,
                'Average I/O Size': 2.67,
                'Average I/Os In Progress': 1.33,
              },
              {
                'Node Type': 'Memoize',
                'Parent Relationship': 'Inner',
                'Parallel Aware': false,
                'Startup Cost': 0.0,
                'Total Cost': 1.0,
                'Plan Rows': 1,
                'Plan Width': 4,
                'Actual Startup Time': 0.001,
                'Actual Total Time': 0.002,
                'Actual Rows': 1.0,
                'Actual Loops': 10,
                'Cache Key': 'src.k',
                'Cache Mode': 'logical',
                'Estimated Capacity': 64,
                'Estimated Distinct Lookup Keys': 5,
                'Estimated Lookups': 10,
                'Estimated Hit Percent': 50.0,
                'Cache Hits': 6,
                'Cache Misses': 4,
                'Cache Evictions': 0,
                'Cache Overflows': 0,
                'Peak Memory Usage': 8,
                Plans: [
                  {
                    'Node Type': 'Result',
                    'Parent Relationship': 'Outer',
                    'Parallel Aware': false,
                    'Startup Cost': 0.0,
                    'Total Cost': 0.01,
                    'Plan Rows': 1,
                    'Plan Width': 4,
                    'Actual Startup Time': 0.001,
                    'Actual Total Time': 0.001,
                    'Actual Rows': 0.0,
                    'Actual Loops': 4,
                    Replaces: 'Scan on dummy',
                    'One-Time Filter': 'false',
                  },
                ],
              },
            ],
          },
        ],
      },
      'Planning Time': 0.1,
      'Execution Time': 2.1,
    },
  ];

  const parsed = parsePlan(pg19);
  assert.equal(parsed.plan.conflictResolution, 'SELECT FOR UPDATE');
  assert.equal(parsed.plan.tuplesInserted, 8);
  assert.equal(parsed.plan.wal?.fpiBytes, 3200);
  const nl = parsed.plan.plans[0]!;
  const seq = nl.plans[0]!;
  assert.equal(seq.ioPrefetch?.avgPrefetchDistance, 4.5);
  assert.equal(seq.ioPrefetch?.ioCount, 3);
  const memo = nl.plans[1]!;
  assert.equal(memo.estimatedCapacity, 64);
  assert.equal(memo.estimatedHitPercent, 50);
  const res = memo.plans[0]!;
  assert.equal(res.replaces, 'Scan on dummy');
});

test('PG 17 text plan with a CTE, SubPlans, and a bitmap scan parses cleanly', () => {
  const p = parsePlan(BITMAP_SUBPLANS_SAMPLE);
  assert.equal(p.plan.nodeType, 'Bitmap Heap Scan');
  assert.equal(p.queryIdentifier, '6039174250186347112');
  assert.ok(p.executionTimeMs && p.executionTimeMs > 0);
  assert.ok(p.plan.plans.some((c) => c.subplanName === 'CTE terms'));
  assert.ok(p.plan.plans.some((c) => c.subplanName === 'SubPlan 2'));
  assert.ok(p.plan.plans.some((c) => c.subplanName === 'SubPlan 3'));
  assert.ok(p.plan.exclusiveTimeMs > 0);
  assert.ok(p.plan.totalBufferBlocks > 8000);
  assert.ok(p.plan.rowEstimateFactor > 10000);
});

test('Error handling for empty and malformed inputs', () => {
  assert.throws(() => parsePlan(''), /Empty/);
  assert.throws(() => parsePlan('   '), /Empty/);
  assert.throws(() => parsePlan('{"notAPlan": true}'), /missing top-level "Plan"/);
  assert.throws(() => parsePlan('select * from foo;'), /does not look like a valid/);
  assert.throws(() => parsePlan('{broken json'), SyntaxError);
});
