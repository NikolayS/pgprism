import type { AutoAttachOptions, AutoAttachResult } from './types';
export declare function isLikelyExplainPlan(raw: string): boolean;
export declare function autoAttach(root?: ParentNode, options?: AutoAttachOptions): AutoAttachResult;
export declare function upgradeDeclarativeElements(root?: ParentNode): AutoAttachResult;
