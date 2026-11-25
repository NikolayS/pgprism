import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonToText } from '../src/json-to-text';
import { parsePlan } from '../src/parser';

const JOE_TESTDATA = '/Users/nik/gitlab/joe/pkg/pgexplain/testdata';

test('jsonToText matches joe PG 17 and PG 18 golden plan bodies and details', () => {
  if (!existsSync(JOE_TESTDATA)) return;
  for (const ver of ['pg16', 'pg17', 'pg18']) {
    const dir = join(JOE_TESTDATA, ver);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const jsonStr = readFileSync(join(dir, f), 'utf8');
      const goldenTxt = readFileSync(join(JOE_TESTDATA, 'golden', ver, f.replace('.json', '.txt')), 'utf8');
      const goldenPlanBody = goldenTxt.split('\n--- stats ---')[0]!.trim();

      const rendered = jsonToText(jsonStr, { verbose: false, includeFooter: false });

      const goldenLines = goldenPlanBody
        .split('\n')
        .map((l) => l.trim().replace(' fpi=0 ', ' '))
        .filter((l) => l && !l.startsWith('Settings:') && !l.startsWith('Query ID:') && !l.startsWith('Trigger '));
      const renderedLines = rendered
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      assert.deepEqual(
        renderedLines,
        goldenLines,
        `Mismatch for ${ver}/${f}`
      );
    }
  }

  // Also test joe correctness fixtures decode and translate cleanly without error
  const corrDir = join(JOE_TESTDATA, 'correctness');
  for (const f of readdirSync(corrDir).filter((x) => x.endsWith('.json'))) {
    const jsonStr = readFileSync(join(corrDir, f), 'utf8');
    const txt = jsonToText(jsonStr);
    const rt = parsePlan(txt);
    assert.ok(rt.nodeCount >= 1, `Expected nodes for correctness/${f}`);
  }
});

test('jsonToText handles PG 17-19 features accurately and round-trips through parsePlan', () => {
  const complex = [
    {
      Plan: {
        'Node Type': 'WindowAgg',
        'Parallel Aware': false,
        'Startup Cost': 1.25,
        'Total Cost': 45.6,
        'Plan Rows': 100,
        'Plan Width': 24,
        'Actual Startup Time': 0.15,
        'Actual Total Time': 3.456,
        'Actual Rows': 100.0,
        'Actual Loops': 1,
        Window: 'w AS (ORDER BY a)',
        'Run Condition': '(row_number() OVER w <= 10)',
        Storage: 'Memory',
        'Maximum Storage': 25,
        'Shared Hit Blocks': 12,
        'Shared Read Blocks': 3,
        'Shared I/O Read Time': 0.888,
        'WAL Records': 2,
        'WAL FPI': 1,
        'WAL Bytes': 200,
        'WAL FPI Bytes': 128,
        'WAL Buffers Full': 1,
        Plans: [
          {
            'Node Type': 'Subquery Scan',
            'Parent Relationship': 'Outer',
            'Parallel Aware': false,
            Alias: 'left',
            'Startup Cost': 0.0,
            'Total Cost': 10.0,
            'Plan Rows': 100,
            'Plan Width': 12,
            'Actual Startup Time': 0.01,
            'Actual Total Time': 1.1,
            'Actual Rows': 0.5,
            'Actual Loops': 2,
            Disabled: true,
            'Shared Hit Blocks': 4,
          },
        ],
      },
      Planning: {
        'Shared Hit Blocks': 10,
        'Memory Used': 64,
        'Memory Allocated': 128,
      },
      'Planning Time': 0.321,
      Serialization: {
        Time: 0.444,
        'Output Volume': 12,
        Format: 'binary',
      },
      Settings: { jit: 'off' },
      'Execution Time': 3.9,
    },
  ];

  const rawComplex = JSON.stringify(complex).replace(
    '"Planning Time":0.321',
    '"Query Identifier":-8378418432840199008,"Planning Time":0.321'
  );
  const text = jsonToText(rawComplex);
  assert.ok(text.includes('Window: w AS (ORDER BY a)'));
  assert.ok(text.includes('Storage: Memory  Maximum Storage: 25kB'));
  assert.ok(text.includes('WAL: records=2 fpi=1 bytes=200 fpi bytes=128 buffers full=1'));
  assert.ok(text.includes('I/O Timings: shared read=0.888'));
  assert.ok(text.includes('Subquery Scan on "left"'));
  assert.ok(text.includes('rows=0.50 loops=2'));
  assert.ok(text.includes('Disabled: true'));
  assert.ok(text.includes('Query Identifier: -8378418432840199008'));
  assert.ok(text.includes('Memory: used=64kB  allocated=128kB'));
  assert.ok(text.includes('Serialization: time=0.444 ms  output=12kB  format=binary'));

  // Round-trip back through TEXT parser
  const rt = parsePlan(text);
  assert.equal(rt.nodeCount, 2);
  assert.equal(rt.plan.nodeType, 'WindowAgg');
  assert.equal(rt.plan.storage, 'Memory');
  assert.equal(rt.plan.wal?.buffersFull, 1);
  assert.equal(rt.plan.wal?.fpiBytes, 128);
  assert.equal(rt.plan.ioTimings?.sharedReadMs, 0.888);
  assert.equal(rt.plan.plans[0]?.nodeType, 'Subquery Scan');
  assert.equal(rt.plan.plans[0]?.alias, 'left');
  assert.equal(rt.plan.plans[0]?.disabled, true);
  assert.equal(rt.plan.plans[0]?.actualRows, 0.5);
  assert.equal(rt.planning?.memoryUsedKb, 64);
  assert.equal(rt.serialization?.outputKb, 12);
  assert.equal(rt.queryIdentifier, '-8378418432840199008');
});
