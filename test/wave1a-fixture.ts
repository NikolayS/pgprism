export const WAVE1A_SAMPLE = `Bitmap Heap Scan on entity_search.entity_names_g00000000 n  (cost=52976.25..37637165.77 rows=6613063 width=12) (actual time=32.203..131.876 rows=187 loops=1)
  Output: n.id, n.country, n.is_alias
  Recheck Cond: (entity_search.typo_pair_keys(n.normalized_name, n.full_form_names) && '{-2129295693,-2124144046}'::integer[])
  Filter: ((n.generation_id = '00000000-0000-4000-8000-000000000001'::uuid) AND (EXISTS(SubPlan 2) OR EXISTS(SubPlan 3)))
  Rows Removed by Filter: 15648
  Heap Blocks: exact=15669
  Buffers: shared hit=16636
  CTE forms
    ->  Append  (cost=0.00..0.10 rows=2 width=72) (actual time=0.015..0.022 rows=3 loops=1)
          ->  Function Scan on pg_catalog.unnest f  (cost=0.00..0.04 rows=1 width=72) (actual time=0.014..0.014 rows=1 loops=1)
                Output: f.form, 'short'::text
                Function Call: unnest('{fdtuse}'::text[])
                Filter: ((char_length(f.form) >= 3) AND (char_length(f.form) <= 255))
          ->  Function Scan on pg_catalog.unnest f_1  (cost=0.00..0.06 rows=1 width=72) (actual time=0.004..0.005 rows=2 loops=1)
                Output: f_1.form, 'full'::text
                Function Call: unnest('{"fdtuse inc","fdtuse incorporated"}'::text[])
                Filter: ((char_length(f_1.form) >= 3) AND (char_length(f_1.form) <= 255))
  ->  Bitmap Index Scan on entity_names_g00000000_typo_pairs_idx  (cost=0.00..51322.88 rows=8817417 width=0) (actual time=28.621..28.622 rows=15835 loops=1)
        Index Cond: (entity_search.typo_pair_keys(n.normalized_name, n.full_form_names) && '{-2129295693,-2124144046}'::integer[])
        Buffers: shared hit=967
  SubPlan 2
    ->  CTE Scan on forms t  (cost=0.00..0.11 rows=1 width=0) (actual time=0.001..0.001 rows=0 loops=15835)
          Filter: ((t.edits > 0) AND (t.kind = 'short'::text))
          Rows Removed by Filter: 3
  SubPlan 3
    ->  Hash Join  (cost=0.07..0.26 rows=1 width=0) (actual time=0.004..0.004 rows=0 loops=15648)
          Hash Cond: ("left"(ff.form, 1) = "left"(t_1.form, 1))
          Rows Removed by Join Filter: 4
          ->  Function Scan on pg_catalog.unnest ff  (cost=0.00..0.10 rows=10 width=32) (actual time=0.001..0.001 rows=2 loops=15648)
                Output: ff.form
                Function Call: unnest(n.full_form_names)
          ->  Hash  (cost=0.05..0.05 rows=1 width=40) (actual time=0.007..0.007 rows=2 loops=1)
                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                ->  CTE Scan on forms t_1  (cost=0.00..0.05 rows=1 width=40) (actual time=0.002..0.003 rows=2 loops=1)
                      Filter: ((t_1.edits > 0) AND (t_1.kind = 'full'::text))
                      Rows Removed by Filter: 1
Settings: jit = 'off', effective_cache_size = '48GB', work_mem = '32MB'
Query Identifier: 2270953677838325333
Planning:
  Buffers: shared hit=1
Planning Time: 0.355 ms
Execution Time: 131.964 ms`;
