import type { ParsedExplain } from '../types';
import { formatBlocks, formatCompactCount, formatMs } from '../units';
import { h } from './dom';

interface BreakdownRow {
  label: string;
  nodeCount: number;
  exclusiveTimeMs: number;
  pctTime: number;
  exclusiveBufferBlocks: number;
  sharedHit: number;
  sharedRead: number;
  hottestNodeId: string;
  tip: string;
}

function buildSection(
  title: string,
  colHeader: string,
  countHeader: string,
  parsed: ParsedExplain,
  rows: BreakdownRow[],
  onJumpNode: (id: string) => void
): HTMLElement {
  const tbody = h(
    'tbody',
    null,
    ...rows.map((r) => {
      const hitDenom = r.sharedHit + r.sharedRead;
      const hitTxt = hitDenom > 0 ? `${((r.sharedHit / hitDenom) * 100).toFixed(1)}%` : '—';
      const bufTxt =
        r.exclusiveBufferBlocks > 0
          ? `${formatBlocks(r.exclusiveBufferBlocks)} (${hitTxt})`
          : parsed.hasBuffers
            ? '0 B'
            : '—';
      const tr = h(
        'tr',
        { title: r.tip },
        h('td', null, h('span', { className: 'pgp-node-title' }, r.label)),
        h('td', { className: 'num' }, formatCompactCount(r.nodeCount)),
        h('td', { className: 'num' }, parsed.hasTiming ? `${formatMs(r.exclusiveTimeMs)} · ${r.pctTime.toFixed(0)}%` : '—'),
        h('td', { className: 'num' }, bufTxt)
      );
      tr.addEventListener('click', () => onJumpNode(r.hottestNodeId));
      return tr;
    })
  );

  return h(
    'div',
    { className: 'pgp-bd-col' },
    h('div', { className: 'pgp-bd-title' }, title),
    h(
      'table',
      { className: 'pgp-bd-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, colHeader),
          h('th', { className: 'num' }, countHeader),
          h('th', { className: 'num' }, 'Excl. time'),
          h('th', { className: 'num' }, 'Buffers (hit %)')
        )
      ),
      tbody
    )
  );
}

export function renderBreakdownPanel(
  parsed: ParsedExplain,
  onJumpNode: (id: string) => void
): HTMLElement {
  const grid = h('div', { className: 'pgp-bd-grid' });

  if (parsed.byRelation.length > 0) {
    grid.appendChild(
      buildSection(
        'By relation / index',
        'Object',
        'Nodes',
        parsed,
        parsed.byRelation.map((r) => ({ ...r, label: r.name, tip: `Jump to hottest node on ${r.name}` })),
        onJumpNode
      )
    );
  }
  if (parsed.byNodeType.length > 0) {
    grid.appendChild(
      buildSection(
        'By node type',
        'Operator',
        'Count',
        parsed,
        parsed.byNodeType.map((t) => ({ ...t, label: t.nodeType, tip: `Jump to hottest ${t.nodeType}` })),
        onJumpNode
      )
    );
  }

  return h('div', { className: 'pgp-breakdown' }, grid);
}
