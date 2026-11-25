import type { MetricMode, ParsedExplain, PlanNode } from '../types';
export interface NodeFlag {
    label: string;
    tone: 'danger' | 'warn' | 'blue' | 'ok' | 'neutral';
}
export declare function getNodeFlags(node: PlanNode): NodeFlag[];
export declare function nodeMatchesSearch(node: PlanNode, q: string): boolean;
export declare function nodeQualPreview(node: PlanNode): string | undefined;
export declare function getMetricSample(parsed: ParsedExplain, node: PlanNode, metric: MetricMode): {
    pct: number;
    selfPct: number;
    label: string;
};
export declare function heatClass(pct: number): string;
export declare function countDescendants(node: PlanNode): number;
