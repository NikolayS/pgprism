import type { MetricMode, ParsedExplain } from '../types';
export interface FlameViewOpts {
    selectedId: string | null;
    metric: MetricMode;
    search: string;
    hotOnly: boolean;
    hideUnused: boolean;
    onSelect: (id: string) => void;
}
export declare function renderFlameView(parsed: ParsedExplain, opts: FlameViewOpts): HTMLElement;
