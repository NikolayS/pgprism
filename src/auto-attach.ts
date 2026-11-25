import { parsePlan } from './parser';
import type { AutoAttachOptions, AutoAttachResult, ThemeMode, ViewMode } from './types';

const PG_OP_RE =
  /^(?:Parallel |Async )?(?:(?:Seq|Index(?: Only)?|Bitmap (?:Heap|Index)|Tid(?: Range)?|Subquery|CTE|Function|Table Function|Values|WorkTable|Foreign|Custom|Sample) Scan\b|(?:Hash|Merge|Nested Loop)(?: (?:Left|Right|Full|Semi|Anti|Right Semi|Right Anti))? Join\b|(?:Partial |Finalize )?(?:Hash|Group|Mixed)?Aggregate\b|(?:Incremental )?Sort\b|Gather(?: Merge)?\b|(?:Hash)?SetOp\b|(?:Insert|Update|Delete|Merge) on\b|(?:Limit|Materialize|Memoize|Hash|Unique|Append|Merge Append|WindowAgg|Result|ProjectSet|LockRows|ModifyTable)\b)/;

const PG_DETAIL_RE =
  /^(?:Output|Filter|Index Cond|Recheck Cond|Hash Cond|Merge Cond|Join Filter|One-Time Filter|Buffers|Planning Time|Execution Time|Sort Key|Group Key|WAL|I\/O Timings|Workers Planned|Heap Fetches|Index Searches|Buckets|Cache Key):/;

function stripPsqlHeaderText(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let s = 0;
  while (s < lines.length && !lines[s]!.trim()) s++;
  if (s < lines.length && lines[s]!.trim() === 'QUERY PLAN') {
    s++;
    if (s < lines.length && /^-+$/.test(lines[s]!.trim())) s++;
  }
  let e = lines.length;
  while (e > s && !lines[e - 1]!.trim()) e--;
  if (e > s && /^\(\d+\s+rows?\)$/.test(lines[e - 1]!.trim())) e--;
  return lines.slice(s, e).join('\n').trim();
}

export function isLikelyExplainPlan(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 15) return false;
  const body = stripPsqlHeaderText(trimmed);
  if (!body) return false;

  if (body.startsWith('{') || body.startsWith('[')) {
    if (!body.includes('"Node Type"') || !body.includes('"Plan"')) return false;
    try {
      const obj = JSON.parse(body) as unknown;
      const root = Array.isArray(obj) ? obj[0] : obj;
      if (!root || typeof root !== 'object' || !('Plan' in root)) return false;
      const p = (root as Record<string, unknown>)['Plan'] as Record<string, unknown> | undefined;
      if (!p || typeof p !== 'object' || typeof p['Node Type'] !== 'string') return false;
      if (
        !('Startup Cost' in p) &&
        !('Total Cost' in p) &&
        !('Plan Rows' in p) &&
        !('Actual Rows' in p) &&
        !('Actual Loops' in p) &&
        !Array.isArray(p['Plans'])
      ) {
        return false;
      }
      parsePlan(body);
      return true;
    } catch {
      return false;
    }
  }

  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const first = lines[0]!;
  if (/^(EXPLAIN|SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|SET|SHOW)\b/i.test(first) || first.endsWith(';')) {
    return false;
  }

  const hasPlanSuffix =
    /\(cost=\d+\.\d+\.\.\d+\.\d+\s+rows=\d+(?:\.\d+)?\s+width=\d+\)/.test(first) ||
    /\(actual(?:\s+time=\d+\.\d+\.\.\d+\.\d+)?\s+rows=\d+(?:\.\d+)?\s+loops=\d+\)/.test(first) ||
    /\(never executed\)\s*$/.test(first);

  if (!hasPlanSuffix) {
    if (!PG_OP_RE.test(first)) return false;
    if (!lines.slice(1).some((l) => l.startsWith('->  ') || PG_DETAIL_RE.test(l))) return false;
  }

  try {
    return parsePlan(trimmed).nodeCount >= 1;
  } catch {
    return false;
  }
}

function mountPreUpgrade(
  pre: HTMLElement,
  rawText: string,
  opts: { mode: 'toggle' | 'replace' | 'below'; theme?: ThemeMode; view?: ViewMode; showDiagnostics?: boolean }
): { root: HTMLElement; cleanup: () => void } {
  pre.setAttribute('data-pgprism-attached', '1');
  const pgPlan = document.createElement('pg-plan') as HTMLElement & { plan: unknown };
  if (opts.theme && opts.theme !== 'auto') pgPlan.setAttribute('theme', opts.theme);
  if (opts.view) pgPlan.setAttribute('view', opts.view);
  if (opts.showDiagnostics === false) pgPlan.setAttribute('diagnostics', 'false');
  pgPlan.plan = rawText;

  if (opts.mode === 'replace') {
    pre.hidden = true;
    pre.parentNode?.insertBefore(pgPlan, pre.nextSibling);
    return {
      root: pgPlan,
      cleanup: () => {
        pgPlan.remove();
        pre.hidden = false;
        pre.removeAttribute('data-pgprism-attached');
      },
    };
  }

  if (opts.mode === 'below') {
    const wrap = document.createElement('div');
    wrap.className = 'pgp-attach-below';
    wrap.style.marginTop = '8px';
    wrap.appendChild(pgPlan);
    pre.parentNode?.insertBefore(wrap, pre.nextSibling);
    return {
      root: wrap,
      cleanup: () => {
        wrap.remove();
        pre.removeAttribute('data-pgprism-attached');
      },
    };
  }

  const wrap = document.createElement('div');
  wrap.className = 'pgp-attach-wrap';
  wrap.style.margin = '12px 0';

  const bar = document.createElement('div');
  Object.assign(bar.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px',
    font: '12px/1.4 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
  });

  const lbl = document.createElement('span');
  lbl.textContent = 'PostgreSQL execution plan';
  lbl.style.opacity = '0.72';

  const btns = document.createElement('span');
  Object.assign(btns.style, { display: 'inline-flex', gap: '4px' });

  const mkBtn = (txt: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = txt;
    Object.assign(b.style, {
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: '500',
      borderRadius: '3px',
      border: '1px solid rgba(128,128,128,0.4)',
      cursor: 'pointer',
    });
    return b;
  };

  const visBtn = mkBtn('Visual');
  const rawBtn = mkBtn('Raw');

  const setActive = (b: HTMLButtonElement, active: boolean) => {
    b.style.background = active ? '#ff7a33' : 'transparent';
    b.style.borderColor = active ? '#ff7a33' : 'rgba(128,128,128,0.4)';
    b.style.color = active ? '#0b0e14' : 'inherit';
  };

  let showVisual = true;
  const syncView = () => {
    pgPlan.hidden = !showVisual;
    pre.hidden = showVisual;
    setActive(visBtn, showVisual);
    setActive(rawBtn, !showVisual);
  };
  visBtn.addEventListener('click', () => {
    showVisual = true;
    syncView();
  });
  rawBtn.addEventListener('click', () => {
    showVisual = false;
    syncView();
  });

  btns.append(visBtn, rawBtn);
  bar.append(lbl, btns);

  pre.parentNode?.insertBefore(wrap, pre);
  wrap.append(bar, pgPlan, pre);
  syncView();

  return {
    root: wrap,
    cleanup: () => {
      wrap.parentNode?.insertBefore(pre, wrap);
      wrap.remove();
      pre.hidden = false;
      pre.removeAttribute('data-pgprism-attached');
    },
  };
}

export function autoAttach(
  root: ParentNode = typeof document !== 'undefined' ? document : ({} as ParentNode),
  options: AutoAttachOptions = {}
): AutoAttachResult {
  if (typeof document === 'undefined' || !root || typeof root.querySelectorAll !== 'function') {
    return { attached: 0, elements: [], destroy: () => {} };
  }

  const selector = options.selector ?? 'pre[data-pgprism], pre';
  const defaultMode = options.mode ?? 'toggle';
  const cleanups: Array<() => void> = [];
  const elements: HTMLElement[] = [];

  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (el.getAttribute('data-pgprism-attached') === '1' || el.closest('pg-plan')) continue;
    const code = el.tagName === 'PRE' ? el.querySelector('code') : null;
    const raw = (code ? code.textContent : el.textContent ?? '').trim();
    if (!raw || !isLikelyExplainPlan(raw)) continue;

    const attrMode = el.getAttribute('data-mode') || el.getAttribute('data-pgprism');
    const mode =
      attrMode === 'replace' || attrMode === 'toggle' || attrMode === 'below'
        ? attrMode
        : defaultMode;

    const res = mountPreUpgrade(el, raw, {
      mode,
      theme: (el.getAttribute('data-theme') as ThemeMode | null) ?? options.theme,
      view: (el.getAttribute('data-view') as ViewMode | null) ?? options.view,
      showDiagnostics: options.showDiagnostics,
    });
    cleanups.push(res.cleanup);
    elements.push(res.root);
  }

  return {
    attached: elements.length,
    elements,
    destroy: () => cleanups.forEach((fn) => fn()),
  };
}

export function upgradeDeclarativeElements(
  root: ParentNode = typeof document !== 'undefined' ? document : ({} as ParentNode)
): AutoAttachResult {
  return autoAttach(root, { selector: 'pre[data-pgprism]', mode: 'toggle' });
}
