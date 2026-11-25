import type { ParsedExplain } from '../types';
export interface TableViewOpts {
    selectedId: string | null;
    collapsed: Set<string>;
    search: string;
    hotOnly: boolean;
    onSelect: (id: string) => void;
    onToggleCollapse: (id: string) => void;
}
export declare function renderTableView(parsed: ParsedExplain, opts: TableViewOpts): HTMLElement;
