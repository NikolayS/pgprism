import type { BufferGroup, BufferStats, TempBufferGroup } from './types';

export const PG_BLOCK_SIZE = 8192;

const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export function emptyBufferGroup(): BufferGroup {
  return { hit: 0, read: 0, dirtied: 0, written: 0 };
}

export function emptyTempGroup(): TempBufferGroup {
  return { read: 0, written: 0 };
}

export function emptyBufferStats(): BufferStats {
  return {
    shared: emptyBufferGroup(),
    local: emptyBufferGroup(),
    temp: emptyTempGroup(),
  };
}

export function sumBufferBlocks(b: BufferStats): number {
  return (
    b.shared.hit +
    b.shared.read +
    b.shared.dirtied +
    b.shared.written +
    b.local.hit +
    b.local.read +
    b.local.dirtied +
    b.local.written +
    b.temp.read +
    b.temp.written
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), IEC_UNITS.length - 1);
  const val = bytes / 1024 ** exp;
  if (exp === 1 && Math.abs(val - Math.round(val)) < 1e-6) {
    return `${Math.round(val)} KiB`;
  }
  const decimals = val >= 100 ? 0 : val >= 10 ? 1 : 2;
  const formatted = val.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${formatted} ${IEC_UNITS[exp]}`;
}

export function blocksToBytes(blocks: number): number {
  return blocks * PG_BLOCK_SIZE;
}

export function formatBlocks(blocks: number): string {
  return formatBytes(blocksToBytes(blocks));
}

export function formatKbAsIec(kb: number): string {
  return formatBytes(kb * 1024);
}

export function formatMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms >= 10000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${ms.toFixed(1)} ms`;
  if (ms >= 1) return `${ms.toFixed(2)} ms`;
  return `${ms.toFixed(3)} ms`;
}

export function formatCount(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) {
    return Math.round(n).toLocaleString('en-US');
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.0+$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.0+$/, '')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0+$/, '')}k`;
  return formatCount(n);
}

export function formatFactor(factor: number): string {
  if (!Number.isFinite(factor)) return '∞';
  if (factor >= 1000) return `${Math.round(factor).toLocaleString('en-US')}×`;
  if (factor >= 10) return `${factor.toFixed(0)}×`;
  return `${factor.toFixed(1).replace(/\.0$/, '')}×`;
}

export function formatActualRowsText(rows: number): string {
  if (rows === Math.trunc(rows)) {
    return String(Math.trunc(rows));
  }
  return rows.toFixed(2);
}

const SAFE_IDENT_RE = /^[a-z_][a-z0-9_]*$/;

// Union of PostgreSQL RESERVED, TYPE_FUNC_NAME, and COL_NAME keywords across PG 15-19
// (matches PostgreSQL quote_identifier() / src/include/parser/kwlist.h).
const NON_UNRESERVED_KEYWORDS = new Set(
  'all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing primary references returning select session_user some symmetric system_user table then to trailing true union unique user using variadic when where window with authorization binary collation concurrently cross current_schema freeze full ilike inner is isnull join left like natural notnull outer overlaps right similar tablesample verbose between bigint bit boolean char character coalesce dec decimal exists extract float graph_table greatest grouping inout int integer interval json json_array json_arrayagg json_exists json_object json_objectagg json_query json_scalar json_serialize json_table json_value least merge_action national nchar none normalize nullif numeric out overlay position precision real row setof smallint substring time timestamp treat trim values varchar xmlattributes xmlconcat xmlelement xmlexists xmlforest xmlnamespaces xmlparse xmlpi xmlroot xmlserialize xmltable'.split(
    ' '
  )
);

export function quoteIdentifier(ident: string): string {
  if (SAFE_IDENT_RE.test(ident) && !NON_UNRESERVED_KEYWORDS.has(ident)) {
    return ident;
  }
  return `"${ident.replace(/"/g, '""')}"`;
}

export function formatScanTarget(
  schema: string | undefined,
  name: string | undefined,
  alias: string | undefined,
  quoteAll = false
): string {
  if (!name) return '';
  const fmt = (s: string) => (quoteAll ? quoteIdentifier(s) : s);
  let out = schema ? ` on ${fmt(schema)}.${fmt(name)}` : ` on ${fmt(name)}`;
  if (alias && alias !== name) {
    out += ` ${quoteIdentifier(alias)}`;
  }
  return out;
}
