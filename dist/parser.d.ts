import type { ParsedExplain } from './types';
export declare function buildDisplayTitle(node: {
    nodeType: string;
    operation?: string;
    joinType?: string;
    strategy?: string;
    partialMode?: string;
    command?: string;
    parallelAware: boolean;
    asyncCapable: boolean;
    scanDirection?: string;
    indexName?: string;
    relationName?: string;
    cteName?: string;
    functionName?: string;
    schema?: string;
    alias?: string;
}): string;
export declare function parsePlan(input: string | unknown): ParsedExplain;
