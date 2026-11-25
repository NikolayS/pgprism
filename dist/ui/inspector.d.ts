import type { ParsedExplain, PlanNode } from '../types';
export declare function renderInspector(parsed: ParsedExplain, node: PlanNode, onClose: () => void, onSelectNode: (id: string) => void): HTMLElement;
