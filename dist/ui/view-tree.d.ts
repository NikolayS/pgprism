import type { MetricMode, ParsedExplain } from '../types';
export interface TreeViewOpts {
    selectedId: string | null;
    collapsed: Set<string>;
    metric: MetricMode;
    search: string;
    hotOnly: boolean;
    onSelect: (id: string) => void;
    onToggleCollapse: (id: string) => void;
}
export declare function renderTreeView(parsed: ParsedExplain, opts: TreeViewOpts): HTMLElement;
