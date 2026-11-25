import type { ParsedExplain, RenderOptions, ThemeMode, ViewMode } from '../types';
export interface PlanHandle {
    update: (nextPlan: string | unknown, nextOptions?: RenderOptions) => void;
    selectNode: (nodeId: string | null) => void;
    setView: (view: ViewMode) => void;
    setTheme: (theme: 'dark' | 'light') => void;
    destroy: () => void;
    readonly parsed: ParsedExplain;
}
export declare function parseCssColor(color: string): {
    r: number;
    g: number;
    b: number;
    a: number;
} | null;
export declare function relativeLuminance(r: number, g: number, b: number): number;
export declare function resolveThemeFromBackgroundLayers(layers: string[], prefersLight: boolean): 'dark' | 'light';
export declare function resolveInitialTheme(container: HTMLElement, pref?: ThemeMode): 'dark' | 'light';
export declare function renderPlan(container: HTMLElement, planInput: string | unknown, options?: RenderOptions): PlanHandle;
