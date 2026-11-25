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
          if (sv !== undefined) (el.style as unknown as Record<string, string>)[sk] = sv;
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

export function attachCopyAction(btn: HTMLButtonElement, getText: () => string, label = btn.textContent || 'Copy'): void {
  btn.addEventListener('click', () => {
    const done = () => {
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = label;
      }, 1400);
    };
    const txt = getText();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => {});
    }
  });
}
