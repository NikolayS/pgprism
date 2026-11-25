import type { AutoAttachOptions, AutoAttachResult, ThemeMode, ViewMode } from './types';
export declare function isLikelyExplainPlan(raw: string): boolean;
export declare function autoAttach(root?: ParentNode, options?: AutoAttachOptions): AutoAttachResult;
export interface AutoAttachScriptConfig {
    mode: 'toggle' | 'replace' | 'below';
    theme?: ThemeMode;
    view?: ViewMode;
}
export declare function resolveAutoAttachScriptConfig(doc: Document): AutoAttachScriptConfig | null;
export declare function bootstrapDocument(doc: Document, capturedConfig?: AutoAttachScriptConfig | null): AutoAttachResult | null;
export declare function upgradeDeclarativeElements(root?: ParentNode): AutoAttachResult;
