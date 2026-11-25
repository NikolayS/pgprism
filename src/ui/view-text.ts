import { parsedToText } from '../json-to-text';
import type { ParsedExplain } from '../types';
import { attachCopyAction, h } from './dom';

function highlightTextLine(line: string): HTMLElement {
  const span = h('span');
  // Split node header vs detail lines safely without innerHTML
  const arrowOrRoot = /^(\s*(?:->\s+)?)([A-Z][A-Za-z0-9 _-]+?)(\s+\(cost=.*)?$/;
  if (
    !line.trimStart().startsWith('Buffers:') &&
    !line.trimStart().startsWith('WAL:') &&
    !line.trimStart().startsWith('I/O Timings:') &&
    !line.trimStart().startsWith('Planning') &&
    !line.trimStart().startsWith('Execution Time:') &&
    !line.trimStart().startsWith('Settings:')
  ) {
    const costIdx = line.indexOf('  (cost=');
    const actIdx = line.indexOf(' (actual');
    const neverIdx = line.indexOf(' (never executed)');
    const splitAt = costIdx >= 0 ? costIdx : actIdx >= 0 ? actIdx : neverIdx;
    if (splitAt > 0 && (line.trimStart().startsWith('->') || line.indexOf(':') < 0 || line.indexOf(':') > splitAt)) {
      const head = line.slice(0, splitAt);
      const rest = line.slice(splitAt);
      const actInRest = rest.indexOf(' (actual');
      span.appendChild(h('span', { className: 'pgp-tok-node' }, head));
      if (actInRest >= 0) {
        span.appendChild(h('span', { className: 'pgp-tok-cost' }, rest.slice(0, actInRest)));
        span.appendChild(h('span', { className: 'pgp-tok-act' }, rest.slice(actInRest)));
      } else {
        span.appendChild(h('span', { className: 'pgp-tok-cost' }, rest));
      }
      return span;
    }
  }

  const trimmed = line.trimStart();
  if (trimmed.startsWith('Buffers:') || trimmed.startsWith('I/O Timings:')) {
    span.appendChild(h('span', { className: 'pgp-tok-buf' }, line));
    return span;
  }
  if (
    trimmed.startsWith('Rows Removed') ||
    trimmed.startsWith('Disabled: true') ||
    trimmed.includes('Disk:') ||
    trimmed.includes('Disk Usage:') ||
    trimmed.includes('lossy=')
  ) {
    span.appendChild(h('span', { className: 'pgp-tok-warn' }, line));
    return span;
  }
  if (trimmed.startsWith('Execution Time:') || trimmed.startsWith('Planning Time:')) {
    span.appendChild(h('span', { className: 'pgp-tok-act' }, line));
    return span;
  }
  if (arrowOrRoot.test(line)) {
    span.appendChild(document.createTextNode(line));
    return span;
  }
  span.appendChild(document.createTextNode(line));
  return span;
}

export function renderCodeView(
  parsed: ParsedExplain,
  mode: 'text' | 'json',
  verboseOutput: boolean,
  onToggleVerbose: () => void
): HTMLElement {
  const wrap = h('div', { className: 'pgp-code-wrap' });

  const content =
    mode === 'text'
      ? parsed.sourceFormat === 'text' && parsed.rawText
        ? parsed.rawText
        : parsedToText(parsed, { verbose: verboseOutput })
      : parsed.rawJsonString
        ? (() => {
            try {
              return JSON.stringify(JSON.parse(parsed.rawJsonString), null, 2);
            } catch {
              return parsed.rawJsonString;
            }
          })()
        : JSON.stringify(parsed.rawJson ?? parsed.plan, null, 2);

  const copyBtn = h('button', { type: 'button', className: 'pgp-btn pgp-btn-sm' }, 'Copy');
  attachCopyAction(copyBtn, () => content, 'Copy');

  const infoText =
    mode === 'text'
      ? parsed.sourceFormat === 'json'
        ? 'Translated from JSON via jsonToText'
        : 'Original EXPLAIN text'
      : parsed.sourceFormat === 'json'
        ? 'Original EXPLAIN JSON'
        : 'Normalized AST JSON';

  const rightControls = h('div', { className: 'pgp-btn-group' });
  if (mode === 'text' && parsed.sourceFormat === 'json') {
    const vBtn = h(
      'button',
      { type: 'button', className: `pgp-btn pgp-btn-sm ${verboseOutput ? 'active' : ''}` },
      'Verbose Output'
    );
    vBtn.addEventListener('click', onToggleVerbose);
    rightControls.appendChild(vBtn);
  }
  rightControls.appendChild(copyBtn);

  wrap.appendChild(
    h('div', { className: 'pgp-code-head' }, h('span', null, infoText), rightControls)
  );

  const pre = h('pre', { className: 'pgp-pre' });
  if (mode === 'text') {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) pre.appendChild(document.createTextNode('\n'));
      pre.appendChild(highlightTextLine(lines[i]!));
    }
  } else {
    pre.textContent = content;
  }
  wrap.appendChild(pre);

  return wrap;
}
