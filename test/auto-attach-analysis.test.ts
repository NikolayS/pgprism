import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { analyzePlan, formatForLLM, isLikelyExplainPlan, jsonToText } from '../src/index';
import { WAVE1A_SAMPLE } from './wave1a-fixture';

const WAVE1A_SUMMARY = '/Users/nik/tmp/forge-tradeverifyd-w0/cases/tradeverifyd-search-pg17-01/runs/wave1a_61m/wave1a_summary.json';

test('isLikelyExplainPlan accepts JSON/TEXT plans and rejects arbitrary SQL, JSON, and prose', () => {
  assert.equal(isLikelyExplainPlan('SELECT id, name FROM users WHERE active = true;'), false);
  assert.equal(isLikelyExplainPlan('EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users;'), false);
  assert.equal(isLikelyExplainPlan('{"name": "pgprism", "version": "0.1.0"}'), false);
  assert.equal(isLikelyExplainPlan('{"Plan": "enterprise", "Node Type": 42}'), false);
  assert.equal(isLikelyExplainPlan('Total time: 12.3 ms\nRows: 100\nPlanning: done'), false);
  assert.equal(isLikelyExplainPlan('Seq Scan on users'), false);

  assert.equal(
    isLikelyExplainPlan('Seq Scan on users  (cost=0.00..15.50 rows=550 width=32) (actual time=0.012..0.089 rows=550 loops=1)'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('QUERY PLAN\n----------\nResult  (cost=0.00..0.01 rows=1 width=4)\n(1 row)'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('Seq Scan on users\n  Filter: (id > 10)\n  Buffers: shared hit=4'),
    true
  );
  assert.equal(
    isLikelyExplainPlan('[{"Plan": {"Node Type": "Result", "Startup Cost": 0, "Total Cost": 0.01, "Plan Rows": 1, "Plan Width": 4}}]'),
    true
  );
});

test('analyzePlan aggregates byRelation, byNodeType, CPU* vs I/O split, buffer hit %, and SubPlan targets', () => {
  const wavePlan = existsSync(WAVE1A_SUMMARY)
    ? JSON.parse(readFileSync(WAVE1A_SUMMARY, 'utf8')).explains.exact.stage3a_v6_2k_explain
    : WAVE1A_SAMPLE;
  const analysis = analyzePlan(wavePlan);

  assert.ok(analysis.diagnostics.length > 0);
  assert.ok(analysis.bufferHitPercent !== null && analysis.bufferHitPercent > 90);
  assert.ok(analysis.byRelation.some((r) => r.name.includes('entity_names_g00000000')));
  assert.ok(analysis.byNodeType.some((t) => t.nodeType === 'Bitmap Heap Scan'));
  assert.ok(analysis.parsed.subplanTargets['SubPlan 2']);
  assert.ok(analysis.parsed.subplanTargets['SubPlan 3']);

  // I/O timing CPU* split check
  const ioPlan = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Parallel Aware': false,
        'Relation Name': 'items',
        Alias: 'items',
        'Startup Cost': 0,
        'Total Cost': 100,
        'Plan Rows': 1000,
        'Plan Width': 8,
        'Actual Startup Time': 0.1,
        'Actual Total Time': 80,
        'Actual Rows': 1000,
        'Actual Loops': 1,
        'Shared Hit Blocks': 800,
        'Shared Read Blocks': 200,
        'Shared I/O Read Time': 50,
      },
      'Execution Time': 82,
    },
  ];
  const ioAnalysis = analyzePlan(ioPlan);
  assert.equal(ioAnalysis.exclusiveIoMs, 50);
  assert.equal(ioAnalysis.exclusiveCpuMs, 32);
  assert.equal(Math.round(ioAnalysis.bufferHitPercent!), 80);
  assert.equal(typeof jsonToText(ioPlan), 'string');

  const md = formatForLLM(wavePlan);
  assert.match(md, /# PostgreSQL execution plan summary/);
  assert.match(md, /## Findings/);
  assert.match(md, /## Top relations \/ indexes/);
  assert.match(md, /```text/);

  const nodeMd = formatForLLM(analysis.parsed, { nodeId: analysis.parsed.plan.id });
  assert.match(nodeMd, /### Node:/);
  assert.match(nodeMd, /- Path:/);
});
