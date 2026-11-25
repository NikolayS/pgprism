import type { Diagnostic, ParsedExplain, PlanNode } from '../types';
export declare function renderInspector(parsed: ParsedExplain, node: PlanNode, onClose: () => void, onSelectNode: (id: string) => void, diagnostics?: Diagnostic[]): HTMLElement;
