import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePlan } from '../src/diagnostics';
import { parsePlan } from '../src/parser';
import { blocksToBytes, formatBlocks, formatBytes, formatFactor } from '../src/units';
import { DISK_SPILLS_PLAN, MOVIES_SEQ_SCANS_PLAN } from './sample-plans-fixture';

test('IEC binary units and 8 KiB block formatting', () => {
  assert.equal(blocksToBytes(1), 8192);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBlocks(1), '8 KiB');
  assert.equal(formatBlocks(128), '1 MiB');
  assert.equal(formatBlocks(94304), '737 MiB');
  assert.equal(formatBlocks(131072), '1 GiB');
  assert.equal(formatFactor(351449.97), '351,450×');
  assert.equal(formatFactor(3.25), '3.3×');
});

test('Diagnostics engine flags spills, lossy bitmaps, disabled nodes, misestimates, and filter discards', () => {
  const spills = diagnosePlan(parsePlan(DISK_SPILLS_PLAN));
  assert.ok(spills.some((d) => d.code === 'row-misestimate' && d.severity === 'high'));
  assert.ok(spills.some((d) => d.code === 'disk-spill' && d.severity === 'high'));
  const seqScans = diagnosePlan(parsePlan(MOVIES_SEQ_SCANS_PLAN));
  assert.ok(seqScans.some((d) => d.code === 'filter-discard' && d.severity === 'high'));

  // Synthetic test with disk spill, lossy bitmap, disabled node, worker shortfall, heap fetches, JIT
  const tricky = [
    {
      Plan: {
        'Node Type': 'Gather',
        'Parallel Aware': false,
        'Workers Planned': 4,
        'Workers Launched': 1,
        'Startup Cost': 0,
        'Total Cost': 1000,
        'Plan Rows': 100,
        'Plan Width': 8,
        'Actual Startup Time': 1,
        'Actual Total Time': 100,
        'Actual Rows': 100,
        'Actual Loops': 1,
        'Temp Read Blocks': 500,
        'Temp Written Blocks': 500,
        Plans: [
          {
            'Node Type': 'Bitmap Heap Scan',
            'Parent Relationship': 'Outer',
            'Parallel Aware': true,
            'Relation Name': 'events',
            Alias: 'events',
            'Startup Cost': 0,
            'Total Cost': 500,
            'Plan Rows': 10,
            'Plan Width': 8,
            'Actual Startup Time': 1,
            'Actual Total Time': 50,
            'Actual Rows': 1000,
            'Actual Loops': 2,
            'Exact Heap Blocks': 10,
            'Lossy Heap Blocks': 400,
            Disabled: true,
            'Shared Read Blocks': 2000,
            'Shared I/O Read Time': 60,
          },
          {
            'Node Type': 'Index Only Scan',
            'Parent Relationship': 'Inner',
            'Parallel Aware': false,
            'Index Name': 'events_pkey',
            'Relation Name': 'events',
            Alias: 'e2',
            'Startup Cost': 0,
            'Total Cost': 10,
            'Plan Rows': 5,
            'Plan Width': 8,
            'Actual Startup Time': 0.1,
            'Actual Total Time': 2,
            'Actual Rows': 100,
            'Actual Loops': 1,
            'Heap Fetches': 100,
          },
        ],
      },
      JIT: {
        Functions: 12,
        Options: { Inlining: true, Optimization: true, Expressions: true, Deforming: true },
        Timing: { Generation: 2, Inlining: 10, Optimization: 25, Emission: 8, Total: 45 },
      },
      'Execution Time': 105,
    },
  ];
  const p2 = parsePlan(tricky);
  const d2 = diagnosePlan(p2);
  const codes = new Set(d2.map((d) => d.code));
  assert.ok(codes.has('disabled-node'));
  assert.ok(codes.has('disk-spill'));
  assert.ok(codes.has('lossy-bitmap'));
  assert.ok(codes.has('worker-shortfall'));
  assert.ok(codes.has('shared-reads'));
  assert.ok(codes.has('heap-fetches'));
  assert.ok(codes.has('jit-overhead'));
  assert.ok(codes.has('row-misestimate'));

  const noBufPlan = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Parallel Aware': false,
        'Relation Name': 'users',
        Alias: 'u',
        'Startup Cost': 0,
        'Total Cost': 10,
        'Plan Rows': 100,
        'Plan Width': 8,
        'Actual Startup Time': 0.01,
        'Actual Total Time': 0.5,
        'Actual Rows': 100,
        'Actual Loops': 1,
      },
      'Execution Time': 0.6,
    },
  ];
  assert.ok(diagnosePlan(parsePlan(noBufPlan)).some((d) => d.code === 'no-buffers'));
});
