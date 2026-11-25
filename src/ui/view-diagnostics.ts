import type { Diagnostic } from '../types';
import { h } from './dom';

export function renderDiagnosticsStrip(
  diagnostics: Diagnostic[],
  expanded: boolean,
  onToggleExpand: () => void,
  onJumpNode: (nodeId: string) => void
): HTMLElement {
  const root = h('div', { className: 'pgp-diag' });

  const high = diagnostics.filter((d) => d.severity === 'high').length;
  const med = diagnostics.filter((d) => d.severity === 'med').length;
  const low = diagnostics.filter((d) => d.severity === 'low').length;

  const summaryParts: Array<Node | string> = [
    h('span', null, diagnostics.length === 0 ? 'Diagnostics: no issues flagged' : `Diagnostics: ${diagnostics.length} ${diagnostics.length === 1 ? 'finding' : 'findings'}`),
  ];
  if (high > 0) summaryParts.push(h('span', { className: 'pgp-sev pgp-sev-high' }, `${high} high`));
  if (med > 0) summaryParts.push(h('span', { className: 'pgp-sev pgp-sev-med' }, `${med} medium`));
  if (low > 0) summaryParts.push(h('span', { className: 'pgp-sev pgp-sev-low' }, `${low} low`));
  if (!expanded && diagnostics.length > 0) {
    summaryParts.push(h('span', { className: 'pgp-diag-preview' }, diagnostics[0]!.title));
  }

  const head = h(
    'div',
    {
      className: 'pgp-diag-head',
      role: 'button',
      tabindex: '0',
      'aria-expanded': String(expanded),
    },
    h('div', { className: 'pgp-diag-summary' }, ...summaryParts),
    diagnostics.length > 0
      ? h('span', null, expanded ? 'Hide' : 'Show')
      : null
  );

  if (diagnostics.length > 0) {
    head.addEventListener('click', onToggleExpand);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggleExpand();
      }
    });
  }
  root.appendChild(head);

  if (expanded && diagnostics.length > 0) {
    const list = h('div', { className: 'pgp-diag-list' });
    for (const d of diagnostics) {
      const sevCls =
        d.severity === 'high' ? 'pgp-sev-high' : d.severity === 'med' ? 'pgp-sev-med' : 'pgp-sev-low';
      const sevLbl = d.severity === 'high' ? 'High' : d.severity === 'med' ? 'Med' : 'Low';
      const jumpBtn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm' }, d.nodeTitle);
      jumpBtn.addEventListener('click', () => onJumpNode(d.nodeId));

      list.appendChild(
        h(
          'div',
          { className: 'pgp-diag-row' },
          h(
            'div',
            { className: 'pgp-diag-main' },
            h('span', { className: `pgp-sev ${sevCls}` }, sevLbl),
            h(
              'div',
              { className: 'pgp-diag-txt' },
              h('span', { className: 'pgp-diag-title' }, d.title),
              h('span', { className: 'pgp-diag-detail' }, d.detail)
            )
          ),
          jumpBtn
        )
      );
    }
    root.appendChild(list);
  }

  return root;
}
