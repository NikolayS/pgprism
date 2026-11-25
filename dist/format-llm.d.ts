import type { Diagnostic, FormatForLLMOptions, ParsedExplain, PlanNode } from './types';
export declare function formatNodeForLLM(parsed: ParsedExplain, node: PlanNode, diagnostics?: Diagnostic[]): string;
export declare function formatForLLM(planInput: string | unknown, options?: FormatForLLMOptions): string;
