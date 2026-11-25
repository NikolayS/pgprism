import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { analyzePlan, jsonToText, parsePlan } from '../dist/pgprism.js';
import { jsonToText as standaloneJsonToText } from '../dist/json-to-text.js';

const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const SCHEMA = `pgprism_reg_${process.pid}`;

function psqlEnv() {
  const env = { ...process.env };
  if (!env.PGHOST && !env.PGURL && !env.DATABASE_URL) env.PGHOST = '127.0.0.1';
  if (!env.PGUSER && !env.PGURL && !env.DATABASE_URL) env.PGUSER = 'postgres';
  if (!env.PGDATABASE && !env.PGURL && !env.DATABASE_URL) env.PGDATABASE = 'postgres';
  return env;
}

function runSql(sql) {
  const args = [];
  const url = process.env.PGURL || process.env.DATABASE_URL;
  if (url) args.push(url);
  args.push('-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1');
  const out = execFileSync(PSQL_BIN, args, {
    input: sql,
    encoding: 'utf8',
    env: psqlEnv(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return out.trim();
}

function normalizeTextForCompare(txt) {
  return txt
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/\bactual time=[\d.]+\.\.[\d.]+/g, 'actual time=T..T')
        .replace(/\brows=[\d.]+/g, 'rows=R')
        .replace(/\bloops=\d+/g, 'loops=L')
        .replace(/\bExecution Time: [\d.]+ ms/g, 'Execution Time: T ms')
        .replace(/\bPlanning Time: [\d.]+ ms/g, 'Planning Time: T ms')
        .replace(/\btime=[\d.]+(\.\.[\d.]+)?/g, 'time=T')
        .replace(/\boutput=\d+kB/g, 'output=XkB')
        .replace(/\bused=\d+kB\s+allocated=\d+kB/g, 'used=XkB allocated=YkB')
        .replace(/\b(Memory|Disk|Memory Usage|Disk Usage|Average Memory|Peak Memory|Average Disk|Peak Disk|Maximum Storage):\s*\d+kB/g, '$1: XkB')
        .replace(/\bWorkers Launched:\s*\d+/g, 'Workers Launched: W')
        .replace(/\bWorker \d+:/g, 'Worker N:')
        .replace(/\bshared [a-z0-9 =]+/gi, 'shared BUF')
        .replace(/\btemp [a-z0-9 =]+/gi, 'temp BUF')
        .replace(/\bHits:\s*\d+\s+Misses:\s*\d+\s+Evictions:\s*\d+\s+Overflows:\s*\d+/g, 'Hits: H Misses: M Evictions: E Overflows: O')
        .replace(/\bHeap Fetches:\s*\d+/g, 'Heap Fetches: F')
        .replace(/\bexact=\d+(\s+lossy=\d+)?/g, 'exact=E')
        .replace(/\bfpi=0\b\s*/g, '')
    )
    .filter((l) => l && !l.startsWith('JIT:') && !l.startsWith('Functions:') && !l.startsWith('Options:') && !l.startsWith('Timing:') && !l.startsWith('Worker N:') && !l.startsWith('WAL:') && !l.startsWith('I/O Timings:'));
}

function assertTreeStructureEqual(a, b, label) {
  assert.equal(a.nodeType, b.nodeType, `${label}: nodeType mismatch (${a.nodeType} vs ${b.nodeType})`);
  assert.equal(a.displayTitle, b.displayTitle, `${label}: displayTitle mismatch (${a.displayTitle} vs ${b.displayTitle})`);
  assert.equal(a.depth, b.depth, `${label}: depth mismatch at ${a.displayTitle}`);
  assert.equal(a.plans.length, b.plans.length, `${label}: children count mismatch at ${a.displayTitle}`);
  for (let i = 0; i < a.plans.length; i++) {
    assertTreeStructureEqual(a.plans[i], b.plans[i], `${label}.${i}`);
  }
}

const versionNum = Number(runSql('SHOW server_version_num;'));
const major = Math.floor(versionNum / 10000);
console.log(`Connected to PostgreSQL major=${major} (server_version_num=${versionNum})`);

const setupSql = `
DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
CREATE SCHEMA ${SCHEMA};
SET search_path TO ${SCHEMA}, public;

CREATE TABLE accounts (
  id int PRIMARY KEY,
  country text NOT NULL,
  tier int NOT NULL,
  label text NOT NULL
);

INSERT INTO accounts
SELECT g, CASE (g % 5) WHEN 0 THEN 'US' WHEN 1 THEN 'DE' WHEN 2 THEN 'GB' WHEN 3 THEN 'JP' ELSE 'BR' END,
       (g % 4) + 1,
       'acct_' || repeat(md5(g::text), 2)
FROM generate_series(1, 1000) g;

CREATE TABLE events (
  id int PRIMARY KEY,
  acct_id int NOT NULL,
  kind text NOT NULL,
  payload text NOT NULL,
  created_day int NOT NULL
);

INSERT INTO events
SELECT g,
       (g % 1000) + 1,
       CASE (g % 3) WHEN 0 THEN 'click' WHEN 1 THEN 'search' ELSE 'checkout' END,
       md5(g::text) || repeat('x', 80),
       (g % 90) + 1
FROM generate_series(1, 20000) g;

CREATE INDEX idx_events_acct ON events (acct_id);
CREATE INDEX idx_events_cover ON events (kind, acct_id) INCLUDE (created_day);

CREATE TABLE audit_log (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acct_id int NOT NULL,
  note text
);

CREATE OR REPLACE FUNCTION log_acct_write() RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE dml_target (
  id int PRIMARY KEY,
  val text
);

CREATE TRIGGER trg_dml_target_bi
BEFORE INSERT ON dml_target
FOR EACH ROW EXECUTE FUNCTION log_acct_write();

CREATE TABLE metrics_part (
  id int NOT NULL,
  bucket int NOT NULL,
  score int NOT NULL
) PARTITION BY RANGE (bucket);

CREATE TABLE metrics_p1 PARTITION OF metrics_part FOR VALUES FROM (0) TO (10);
CREATE TABLE metrics_p2 PARTITION OF metrics_part FOR VALUES FROM (10) TO (20);
CREATE TABLE metrics_p3 PARTITION OF metrics_part FOR VALUES FROM (20) TO (30);

INSERT INTO metrics_part
SELECT g, (g % 19), g * 3 FROM generate_series(1, 3000) g;

ANALYZE accounts;
ANALYZE events;
ANALYZE metrics_part;

-- Dirty visibility map slightly for Index Only Scan Heap Fetches
UPDATE events SET created_day = created_day + 1 WHERE id <= 400;
`;

try {
  runSql(setupSql);

  const analyzeOpts =
    major >= 17
      ? 'ANALYZE, BUFFERS, SETTINGS, VERBOSE, WAL, MEMORY, SERIALIZE TEXT'
      : 'ANALYZE, BUFFERS, SETTINGS, VERBOSE, WAL';

  const cases = [
    {
      name: 'hash_join_parallel_agg',
      preamble: "SET max_parallel_workers_per_gather = 2; SET min_parallel_table_scan_size = 0; SET min_parallel_index_scan_size = 0; SET parallel_setup_cost = 0; SET parallel_tuple_cost = 0;",
      sql: `SELECT a.country, count(*), sum(e.created_day)
            FROM ${SCHEMA}.events e
            JOIN ${SCHEMA}.accounts a ON a.id = e.acct_id
            WHERE e.kind = 'checkout'
            GROUP BY a.country
            ORDER BY 2 DESC`,
      expectNodes: ['Hash Join'],
      expectAnyNode: ['Gather', 'Gather Merge'],
    },
    {
      name: 'bitmap_subplan_initplan',
      preamble: "SET enable_seqscan = off;",
      sql: `SELECT e.id, e.acct_id
            FROM ${SCHEMA}.events e
            WHERE e.acct_id BETWEEN 1 AND 80
              AND e.created_day > (SELECT avg(tier)::int FROM ${SCHEMA}.accounts)
              AND EXISTS (SELECT 1 FROM ${SCHEMA}.accounts a WHERE a.id = e.acct_id AND a.country = 'US')`,
      expectNodes: ['Bitmap Heap Scan', 'Bitmap Index Scan'],
    },
    {
      name: 'index_only_scan_heap_fetches',
      preamble: "SET enable_seqscan = off; SET enable_bitmapscan = off;",
      sql: `SELECT kind, acct_id, created_day
            FROM ${SCHEMA}.events
            WHERE kind = 'click' AND acct_id <= 250`,
      expectNodes: ['Index Only Scan'],
    },
    {
      name: 'cte_window_incremental_sort',
      preamble: "SET work_mem = '4MB';",
      sql: `WITH top_acct AS MATERIALIZED (
              SELECT id, country, tier FROM ${SCHEMA}.accounts WHERE tier >= 2
            )
            SELECT e.acct_id, e.created_day,
                   row_number() OVER (PARTITION BY e.acct_id ORDER BY e.created_day)
            FROM ${SCHEMA}.events e
            JOIN top_acct t ON t.id = e.acct_id
            WHERE e.acct_id <= 120
            ORDER BY e.acct_id, e.created_day`,
      expectNodes: ['WindowAgg', 'CTE Scan'],
    },
    {
      name: 'nested_loop_memoize_disabled_pg18',
      preamble: "SET enable_hashjoin = off; SET enable_mergejoin = off; SET enable_material = off;",
      sql: `SELECT count(*)
            FROM ${SCHEMA}.events e
            JOIN ${SCHEMA}.accounts a ON a.id = e.acct_id
            WHERE e.id <= 4000`,
      expectNodes: ['Nested Loop', 'Memoize'],
    },
    {
      name: 'disk_sort_hash_spill',
      preamble: "SET work_mem = '64kB'; SET max_parallel_workers_per_gather = 0;",
      sql: `SELECT e.id, e.payload, a.label
            FROM ${SCHEMA}.events e
            JOIN ${SCHEMA}.accounts a ON a.id = e.acct_id
            ORDER BY e.payload, a.label`,
      expectNodes: ['Sort', 'Hash Join'],
    },
    {
      name: 'partitioned_append_pruned',
      preamble: '',
      sql: `SELECT count(*)
            FROM ${SCHEMA}.metrics_part
            WHERE bucket < (SELECT 10)`,
      expectNodes: ['Append'],
    },
    {
      name: 'dml_insert_on_conflict_trigger_wal',
      preamble: '',
      sql: `INSERT INTO ${SCHEMA}.dml_target (id, val)
            SELECT g, md5(g::text) FROM generate_series(1, 200) g
            ON CONFLICT (id) DO NOTHING`,
      expectNodes: ['ModifyTable'],
    },
  ];

  for (const tc of cases) {
    // Run inside rolled-back transaction so DML/settings don't leak across cases
    const runPair = (format, opts) => {
      const sql = `
        BEGIN;
        SET LOCAL search_path TO ${SCHEMA}, public;
        ${tc.preamble}
        EXPLAIN (${opts}, FORMAT ${format}) ${tc.sql};
        ROLLBACK;
      `;
      return runSql(sql);
    };

    // 1. Deterministic non-ANALYZE equivalence check (COSTS ON, VERBOSE, SETTINGS)
    const detJson = runPair('JSON', 'COSTS ON, VERBOSE, SETTINGS');
    const detText = runPair('TEXT', 'COSTS ON, VERBOSE, SETTINGS');

    const pDetJson = parsePlan(detJson);
    const pDetText = parsePlan(detText);
    assertTreeStructureEqual(pDetJson.plan, pDetText.plan, `${tc.name}/det`);

    const detConverted = jsonToText(detJson, { verbose: true, includeFooter: true });
    assert.deepEqual(
      detConverted.split('\n').map((l) => l.trim()).filter(Boolean),
      detText.split('\n').map((l) => l.trim()).filter(Boolean),
      `${tc.name}: deterministic jsonToText mismatch vs psql PG ${major}`
    );

    // Ensure standalone subpath bundle matches
    assert.equal(standaloneJsonToText(detJson, { verbose: true, includeFooter: true }), detConverted);

    // 2. Full ANALYZE run (Buffers, WAL, Settings, Verbose, Memory/Serialize on PG 17+)
    const actJson = runPair('JSON', analyzeOpts);
    const actText = runPair('TEXT', analyzeOpts);

    const pActJson = parsePlan(actJson);
    const pActText = parsePlan(actText);
    assert.equal(pActJson.isAnalyze, true, `${tc.name}: JSON isAnalyze`);
    assert.equal(pActText.isAnalyze, true, `${tc.name}: TEXT isAnalyze`);
    assert.ok(pActJson.nodeCount >= 1 && pActText.nodeCount >= 1);

    // Check expected operator presence
    const seenTypes = new Set(pActJson.byNodeType.map((x) => x.nodeType));
    for (const req of tc.expectNodes) {
      assert.ok(seenTypes.has(req), `${tc.name}: expected nodeType ${req}, got ${[...seenTypes].join(', ')}`);
    }
    if (tc.expectAnyNode) {
      assert.ok(
        tc.expectAnyNode.some((req) => seenTypes.has(req)),
        `${tc.name}: expected one of [${tc.expectAnyNode.join(', ')}], got ${[...seenTypes].join(', ')}`
      );
    }

    // Compare jsonToText round-trip AST against original JSON AST
    const actConverted = jsonToText(actJson, { verbose: true, includeFooter: true });
    const pRoundTrip = parsePlan(actConverted);
    assertTreeStructureEqual(pActJson.plan, pRoundTrip.plan, `${tc.name}/roundtrip`);
    assert.equal(
      pRoundTrip.plan.totalBufferBlocks,
      pActJson.plan.totalBufferBlocks,
      `${tc.name}: buffer total mismatch after jsonToText round-trip`
    );
    if (pActJson.triggers.length > 0) {
      assert.equal(pRoundTrip.triggers.length, pActJson.triggers.length, `${tc.name}: triggers round-trip`);
    }

    // Sanity check structural parity between PG FORMAT TEXT and normalized jsonToText on single-threaded deterministic shapes
    const hasParallel = seenTypes.has('Gather') || seenTypes.has('Gather Merge');
    if (!hasParallel) {
      assert.equal(
        normalizeTextForCompare(actConverted).length,
        normalizeTextForCompare(actText).length,
        `${tc.name}: ANALYZE jsonToText line structure length differed vs psql FORMAT TEXT\n--- converted ---\n${actConverted}\n--- psql ---\n${actText}`
      );
    }

    const aJson = analyzePlan(actJson);
    const aText = analyzePlan(actText);
    assert.ok(aJson.byNodeType.length > 0 && aText.byNodeType.length > 0);
    if (tc.name === 'disk_sort_hash_spill') {
      assert.ok(aJson.diagnostics.some((d) => d.code === 'disk-spill'), `${tc.name}: expected disk-spill diagnostic`);
    }

    console.log(`  PASS ${tc.name} (PG ${major}, nodes=${pActJson.nodeCount}, time=${pActJson.executionTimeMs?.toFixed(2) ?? '?'} ms)`);
  }

  console.log(`ALL ${cases.length} psql regression cases passed on PostgreSQL ${major}!`);
} finally {
  try {
    runSql(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`);
  } catch {
    // ignore cleanup error
  }
}
