export const BITMAP_SUBPLANS_SAMPLE = `Bitmap Heap Scan on shop.product_names n  (cost=52976.25..37637165.77 rows=6613063 width=12) (actual time=32.203..131.876 rows=187 loops=1)
  Output: n.product_id, n.locale, n.is_primary
  Recheck Cond: (shop.fuzzy_keys(n.name, n.variants) && '{-1830472915,-1207756342}'::integer[])
  Filter: ((n.catalog_id = 42) AND (EXISTS(SubPlan 2) OR EXISTS(SubPlan 3)))
  Rows Removed by Filter: 15648
  Heap Blocks: exact=15669
  Buffers: shared hit=16636
  CTE terms
    ->  Append  (cost=0.00..0.10 rows=2 width=72) (actual time=0.015..0.022 rows=3 loops=1)
          ->  Function Scan on pg_catalog.unnest f  (cost=0.00..0.04 rows=1 width=72) (actual time=0.014..0.014 rows=1 loops=1)
                Output: f.term, 'word'::text
                Function Call: unnest('{espresso}'::text[])
                Filter: ((char_length(f.term) >= 3) AND (char_length(f.term) <= 255))
          ->  Function Scan on pg_catalog.unnest f_1  (cost=0.00..0.06 rows=1 width=72) (actual time=0.004..0.005 rows=2 loops=1)
                Output: f_1.term, 'phrase'::text
                Function Call: unnest('{"espresso machine","espresso maker"}'::text[])
                Filter: ((char_length(f_1.term) >= 3) AND (char_length(f_1.term) <= 255))
  ->  Bitmap Index Scan on product_names_fuzzy_keys_idx  (cost=0.00..51322.88 rows=8817417 width=0) (actual time=28.621..28.622 rows=15835 loops=1)
        Index Cond: (shop.fuzzy_keys(n.name, n.variants) && '{-1830472915,-1207756342}'::integer[])
        Buffers: shared hit=967
  SubPlan 2
    ->  CTE Scan on terms t  (cost=0.00..0.11 rows=1 width=0) (actual time=0.001..0.001 rows=0 loops=15835)
          Filter: ((t.max_typos > 0) AND (t.kind = 'word'::text))
          Rows Removed by Filter: 3
  SubPlan 3
    ->  Hash Join  (cost=0.07..0.26 rows=1 width=0) (actual time=0.004..0.004 rows=0 loops=15648)
          Hash Cond: ("left"(ff.term, 1) = "left"(t_1.term, 1))
          Rows Removed by Join Filter: 4
          ->  Function Scan on pg_catalog.unnest ff  (cost=0.00..0.10 rows=10 width=32) (actual time=0.001..0.001 rows=2 loops=15648)
                Output: ff.term
                Function Call: unnest(n.variants)
          ->  Hash  (cost=0.05..0.05 rows=1 width=40) (actual time=0.007..0.007 rows=2 loops=1)
                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                ->  CTE Scan on terms t_1  (cost=0.00..0.05 rows=1 width=40) (actual time=0.002..0.003 rows=2 loops=1)
                      Filter: ((t_1.max_typos > 0) AND (t_1.kind = 'phrase'::text))
                      Rows Removed by Filter: 1
Settings: jit = 'off', effective_cache_size = '48GB', work_mem = '32MB'
Query Identifier: 6039174250186347112
Planning:
  Buffers: shared hit=1
Planning Time: 0.355 ms
Execution Time: 131.964 ms`;
