import type { Diagnostic, ParsedExplain, PlanAnalysis } from './types';
export declare function diagnosePlan(parsed: ParsedExplain): Diagnostic[];
export declare function analyzePlan(planInput: string | unknown): PlanAnalysis;
