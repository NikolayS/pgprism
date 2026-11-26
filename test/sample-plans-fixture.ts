// Text plans published on explain.depesz.com. Tables are a public IMDB teaching dataset or synthetic.

// https://explain.depesz.com/s/Uto3s : Postgres 18, parallel seq scans, no useful indexes
export const MOVIES_SEQ_SCANS_PLAN = `Unique  (cost=44243.03..182241.36 rows=1 width=17) (actual time=369.558..390.387 rows=1.00 loops=1)
  Buffers: shared hit=76 read=94304
  ->  Nested Loop  (cost=44243.03..182241.36 rows=1 width=17) (actual time=369.557..390.385 rows=1.00 loops=1)
        Join Filter: (m.id = c.mid)
        Rows Removed by Join Filter: 2251735
        Buffers: shared hit=76 read=94304
        ->  Gather Merge  (cost=19634.55..19997.58 rows=3117 width=21) (actual time=45.128..46.085 rows=4201.00 loops=1)
              Workers Planned: 2
              Workers Launched: 2
              Buffers: shared hit=76 read=10560
              ->  Sort  (cost=18634.53..18637.78 rows=1299 width=21) (actual time=35.079..35.118 rows=1400.33 loops=3)
                    Sort Key: m.name
                    Sort Method: quicksort  Memory: 124kB
                    Buffers: shared hit=76 read=10560
                    Worker 0:  Sort Method: quicksort  Memory: 94kB
                    Worker 1:  Sort Method: quicksort  Memory: 94kB
                    ->  Parallel Seq Scan on movie m  (cost=0.00..18567.35 rows=1299 width=21) (actual time=1.989..33.843 rows=1400.33 loops=3)
                          Filter: (year > 2010)
                          Rows Removed by Filter: 511070
                          Buffers: shared read=10560
        ->  Materialize  (cost=24608.48..161963.26 rows=6 width=4) (actual time=0.060..0.069 rows=536.00 loops=4201)
              Storage: Memory  Maximum Storage: 33kB
              Buffers: shared read=83744
              ->  Gather  (cost=24608.48..161963.23 rows=6 width=4) (actual time=253.689..253.788 rows=536.00 loops=1)
                    Workers Planned: 2
                    Workers Launched: 2
                    Buffers: shared read=83744
                    ->  Parallel Hash Join  (cost=23608.48..160962.63 rows=2 width=4) (actual time=198.352..252.147 rows=178.67 loops=3)
                          Hash Cond: (c.pid = a.id)
                          Buffers: shared read=83744
                          ->  Parallel Seq Scan on casts c  (cost=0.00..119473.55 rows=4768155 width=8) (actual time=0.426..105.239 rows=3815282.33 loops=3)
                                Buffers: shared read=71792
                          ->  Parallel Hash  (cost=23608.46..23608.46 rows=1 width=4) (actual time=33.115..33.116 rows=0.33 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 40kB
                                Buffers: shared read=11952
                                ->  Parallel Seq Scan on actor a  (cost=0.00..23608.46 rows=1 width=4) (actual time=25.005..32.937 rows=0.33 loops=3)
                                      Filter: (((fname)::text = 'Tom'::text) AND ((lname)::text = 'Hanks'::text))
                                      Rows Removed by Filter: 621678
                                      Buffers: shared read=11952
Planning:
  Buffers: shared hit=187 read=26 dirtied=2
Planning Time: 5.200 ms
Execution Time: 390.922 ms`;

// https://explain.depesz.com/s/CC4m : Postgres 19, two correlated SubPlans, a million loops each
export const CORRELATED_SUBPLANS_PLAN = `Seq Scan on t1  (cost=0.00..53286573.40 rows=1000000 width=20) (actual time=0.453..40904.442 rows=1000000.00 loops=1)
  Buffers: shared hit=17069328 read=58143
  SubPlan expr_1
    ->  Aggregate  (cost=4.53..4.54 rows=1 width=8) (actual time=0.006..0.006 rows=1.00 loops=1000000)
          Buffers: shared hit=4106094 read=7122
          ->  Index Only Scan using ix_t2_t1_id on t2  (cost=0.43..4.52 rows=5 width=0) (actual time=0.003..0.004 rows=5.00 loops=1000000)
                Index Cond: (t1_id = t1.id)
                Heap Fetches: 0
                Index Searches: 1000000
                Buffers: shared hit=4106094 read=7122
  SubPlan expr_2
    ->  Aggregate  (cost=48.71..48.72 rows=1 width=8) (actual time=0.034..0.034 rows=1.00 loops=1000000)
          Buffers: shared hit=12963234 read=36767
          ->  Nested Loop  (cost=24.10..48.70 rows=5 width=0) (actual time=0.018..0.032 rows=5.00 loops=1000000)
                Buffers: shared hit=12963234 read=36767
                ->  Unique  (cost=23.94..23.97 rows=4 width=34) (actual time=0.014..0.016 rows=5.00 loops=1000000)
                      Buffers: shared hit=7963235 read=36765
                      ->  Sort  (cost=23.94..23.96 rows=5 width=34) (actual time=0.013..0.014 rows=5.00 loops=1000000)
                            Sort Key: t2_1.code
                            Sort Method: quicksort  Memory: 25kB
                            Buffers: shared hit=7963235 read=36765
                            ->  Index Scan using ix_t2_t1_id on t2 t2_1  (cost=0.43..23.89 rows=5 width=34) (actual time=0.004..0.007 rows=5.00 loops=1000000)
                                  Index Cond: (t1_id = t1.id)
                                  Index Searches: 1000000
                                  Buffers: shared hit=7963235 read=36765
                ->  Index Only Scan using codes_pkey on codes  (cost=0.15..6.17 rows=1 width=38) (actual time=0.003..0.003 rows=1.00 loops=5000000)
                      Index Cond: (code = (t2_1.code)::text)
                      Heap Fetches: 5000000
                      Index Searches: 5000000
                      Buffers: shared hit=4999999 read=2
Planning Time: 0.495 ms
Execution Time: 41020.879 ms`;

// https://explain.depesz.com/s/FUsh : Sort and HashAggregate spilling to disk, no BUFFERS
export const DISK_SPILLS_PLAN = `Merge Left Join  (cost=553697.38..987310.08 rows=27676688 width=16) (actual time=5693.291..5693.299 rows=3 loops=1)
  Merge Cond: (t1.b1 = t2.a2)
  ->  Sort  (cost=157.78..163.40 rows=2250 width=8) (actual time=0.038..0.040 rows=3 loops=1)
        Sort Key: t1.b1
        Sort Method: quicksort  Memory: 25kB
        ->  Seq Scan on t1  (cost=0.00..32.50 rows=2250 width=8) (actual time=0.015..0.016 rows=3 loops=1)
  ->  Materialize  (cost=553539.60..578141.10 rows=2460150 width=8) (actual time=5693.243..5693.249 rows=4 loops=1)
        ->  Unique  (cost=553539.60..571990.73 rows=2460150 width=8) (actual time=5693.239..5693.244 rows=4 loops=1)
              ->  Sort  (cost=553539.60..559689.98 rows=2460150 width=8) (actual time=5693.237..5693.240 rows=7 loops=1)
                    Sort Key: t2.a2, t2.b2
                    Sort Method: external merge  Disk: 59184kB
                    ->  Append  (cost=84499.32..225120.81 rows=2460150 width=8) (actual time=697.320..2957.968 rows=2460000 loops=1)
                          ->  HashAggregate  (cost=84499.32..106410.03 rows=1230075 width=8) (actual time=697.319..1306.407 rows=1230000 loops=1)
                                Group Key: t2.a2, t2.b2
                                Planned Partitions: 16  Batches: 17     Memory Usage: 8337kB    Disk Usage: 31720kB
                                ->  Seq Scan on t2  (cost=0.00..17767.75 rows=1230075 width=8) (actual time=0.011..128.553 rows=1230000 loops=1)
                          ->  HashAggregate  (cost=84499.32..106410.03 rows=1230075 width=8) (actual time=846.517..1503.983 rows=1230000 loops=1)
                                Group Key: a.a2, a.b2
                                Planned Partitions: 16  Batches: 17     Memory Usage: 8337kB    Disk Usage: 31720kB
                                ->  Seq Scan on t2 a  (cost=0.00..17767.75 rows=1230075 width=8) (actual time=0.120..108.258 rows=1230000 loops=1)
Planning Time: 0.511 ms
Execution Time: 5701.668 ms`;

// Hand-written Postgres 17 style plan: CTE, numbered SubPlan, bitmap scan, Query Identifier
export const CTE_BITMAP_PLAN = `Bitmap Heap Scan on t1  (cost=148.31..5261.44 rows=250000 width=12) (actual time=1.912..38.447 rows=7 loops=1)
  Recheck Cond: (code = 42)
  Filter: ((SubPlan 2) > 3)
  Rows Removed by Filter: 9993
  Heap Blocks: exact=800
  Buffers: shared hit=842
  CTE recent
    ->  Seq Scan on t2  (cost=0.00..35.50 rows=850 width=8) (actual time=0.010..0.214 rows=850 loops=1)
          Filter: (created_at > (now() - '7 days'::interval))
          Buffers: shared hit=12
  ->  Bitmap Index Scan on ix_t1_code  (cost=0.00..85.81 rows=10000 width=0) (actual time=1.403..1.403 rows=10000 loops=1)
        Index Cond: (code = 42)
        Buffers: shared hit=30
  SubPlan 2
    ->  Aggregate  (cost=19.13..19.14 rows=1 width=8) (actual time=0.003..0.003 rows=1 loops=10000)
          ->  CTE Scan on recent r  (cost=0.00..19.12 rows=4 width=0) (actual time=0.001..0.002 rows=1 loops=10000)
                Filter: (t1_id = t1.id)
                Rows Removed by Filter: 849
Query Identifier: 4611686018427387904
Planning Time: 0.412 ms
Execution Time: 38.519 ms`;
