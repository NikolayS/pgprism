import type { Diagnostic } from '../types';
export declare function renderDiagnosticsStrip(diagnostics: Diagnostic[], expanded: boolean, onToggleExpand: () => void, onJumpNode: (nodeId: string) => void): HTMLElement;
