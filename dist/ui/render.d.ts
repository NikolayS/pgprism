import type { ParsedExplain, RenderOptions, ViewMode } from '../types';
export interface PlanHandle {
    update: (nextPlan: string | unknown, nextOptions?: RenderOptions) => void;
    selectNode: (nodeId: string | null) => void;
    setView: (view: ViewMode) => void;
    setTheme: (theme: 'dark' | 'light') => void;
    destroy: () => void;
    readonly parsed: ParsedExplain;
}
export declare function renderPlan(container: HTMLElement, planInput: string | unknown, options?: RenderOptions): PlanHandle;
