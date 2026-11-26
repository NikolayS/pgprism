import type { MetricMode, RenderOptions, ThemeMode, ViewMode } from './types';
import { type PlanHandle, renderPlan } from './ui/render';

const BaseElement: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as typeof HTMLElement);

export class PgPlanElement extends BaseElement {
  static observedAttributes = ['plan', 'view', 'theme', 'metric', 'node', 'diagnostics', 'max-height'];

  private _plan: string | unknown = null;
  private _handle: PlanHandle | null = null;
  private _ready = false;

  get handle(): PlanHandle | null {
    return this._handle;
  }

  get plan(): string | unknown {
    return this._plan;
  }

  set plan(value: string | unknown) {
    this._plan = value;
    this.sync();
  }

  connectedCallback(): void {
    this._ready = true;
    if (this._plan === null) {
      const attr = this.getAttribute('plan');
      if (attr) {
        this._plan = attr;
      } else {
        const script = this.querySelector('script[type="application/json"], script[type="text/plain"]');
        const pre = this.querySelector('pre');
        const txt = (script?.textContent ?? pre?.textContent ?? this.textContent ?? '').trim();
        if (txt) this._plan = txt;
      }
    }
    this.sync();
  }

  disconnectedCallback(): void {
    this._handle?.destroy();
    this._handle = null;
  }

  attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null): void {
    if (name === 'plan' && newVal !== null) {
      this._plan = newVal;
    }
    if (!this._ready) return;
    if (this._handle) {
      if (name === 'node') {
        this._handle.selectNode(newVal || null);
        return;
      }
      if (name === 'view' && newVal) {
        this._handle.setView(newVal as ViewMode);
        return;
      }
      if (name === 'metric' && newVal) {
        this._handle.setMetric(newVal as MetricMode | 'auto');
        return;
      }
    }
    this.sync();
  }

  private readOptions(): RenderOptions {
    const viewAttr = this.getAttribute('view') as ViewMode | null;
    const themeAttr = this.getAttribute('theme') as ThemeMode | null;
    const metricAttr = this.getAttribute('metric') as (MetricMode | 'auto') | null;
    const nodeAttr = this.getAttribute('node');
    const diagAttr = this.getAttribute('diagnostics');
    const maxHeight = this.getAttribute('max-height') ?? undefined;
    return {
      view: viewAttr ?? undefined,
      theme: themeAttr ?? 'auto',
      metric: metricAttr ?? undefined,
      selectedNode: nodeAttr || undefined,
      showDiagnostics: diagAttr === 'false' ? false : true,
      maxHeight,
      useShadow: true,
    };
  }

  private sync(): void {
    if (!this._ready || this._plan === null || this._plan === '') return;
    const opts = this.readOptions();
    try {
      if (this._handle) {
        this._handle.update(this._plan, opts);
      } else {
        this._handle = renderPlan(this, this._plan, opts);
      }
    } catch (err) {
      const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
      const msg = err instanceof Error ? err.message : String(err);
      shadow.textContent = `pgPrism error: ${msg}`;
    }
  }
}

export function registerElement(tagName = 'pg-plan'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tagName)) {
    customElements.define(tagName, PgPlanElement);
  }
}
