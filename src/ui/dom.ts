export type StyleMap = Record<string, string | undefined>;

export interface DomProps {
  className?: string;
  style?: StyleMap;
  [key: string]: string | number | boolean | StyleMap | undefined;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: DomProps | null,
  ...children: Array<Node | string | number | false | null | undefined>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k === 'className') {
        el.className = String(v);
      } else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv === undefined) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else (el.style as unknown as Record<string, string>)[sk] = sv;
        }
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const ch of children) {
    if (ch === undefined || ch === null || ch === false) continue;
    el.appendChild(typeof ch === 'object' ? ch : document.createTextNode(String(ch)));
  }
  return el;
}

export function clearNode(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function createCopyIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', '5.5');
  rect.setAttribute('y', '5.5');
  rect.setAttribute('width', '8');
  rect.setAttribute('height', '8');
  rect.setAttribute('rx', '1.5');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5');
  svg.append(rect, path);
  return svg;
}

export function makeCopyButton(
  label: string,
  getText: () => string,
  title?: string,
  small = false
): HTMLButtonElement {
  const lbl = h('span', null, label);
  const btn = h(
    'button',
    {
      type: 'button',
      className: `pgp-btn pgp-btn-action ${small ? 'pgp-btn-sm' : ''}`,
      title,
    },
    createCopyIcon(),
    lbl
  );
  btn.addEventListener('click', () => {
    const done = () => {
      lbl.textContent = 'Copied';
      setTimeout(() => {
        lbl.textContent = label;
      }, 1400);
    };
    const txt = getText();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => {});
    }
  });
  return btn;
}
