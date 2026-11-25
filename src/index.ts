export { autoAttach, isLikelyExplainPlan, upgradeDeclarativeElements } from './auto-attach';
export { analyzePlan, diagnosePlan } from './diagnostics';
export { formatForLLM, formatNodeForLLM } from './format-llm';
export { jsonToText, parsedToText } from './json-to-text';
export { buildDisplayTitle, parsePlan } from './parser';
export { PGPRISM_CSS } from './styles';
export type {
  AutoAttachOptions,
  AutoAttachResult,
  BufferGroup,
  BufferStats,
  Diagnostic,
  DiagnosticSeverity,
  FormatForLLMOptions,
  IoPrefetchStats,
  IoTimingStats,
  JitStats,
  JsonToTextOptions,
  MetricMode,
  NodeTypeSummary,
  ParsedExplain,
  PlanAnalysis,
  PlanNode,
  PlanningStats,
  RelationSummary,
  RenderOptions,
  SerializationStats,
  SortGroupStats,
  TempBufferGroup,
  ThemeMode,
  TriggerInfo,
  ViewMode,
  WalStats,
  WorkerStats,
} from './types';
export { renderPlan, type PlanHandle } from './ui/render';
export {
  PG_BLOCK_SIZE,
  blocksToBytes,
  formatBlocks,
  formatBytes,
  formatCompactCount,
  formatCount,
  formatFactor,
  formatKbAsIec,
  formatMs,
  quoteIdentifier,
} from './units';
export { PgPlanElement, registerElement } from './web-component';

import { autoAttach, upgradeDeclarativeElements } from './auto-attach';
import type { ThemeMode, ViewMode } from './types';
import { registerElement } from './web-component';

registerElement('pg-plan');

// Capture currentScript synchronously before DOMContentLoaded
if (typeof document !== 'undefined') {
  const curScript = document.currentScript as HTMLScriptElement | null;
  const shouldAutoAttach = Boolean(curScript?.hasAttribute('data-auto-attach'));
  const scriptMode = curScript?.getAttribute('data-mode');
  const scriptTheme = curScript?.getAttribute('data-theme') as ThemeMode | null;
  const scriptView = curScript?.getAttribute('data-view') as ViewMode | null;

  const boot = () => {
    upgradeDeclarativeElements(document);
    if (shouldAutoAttach) {
      autoAttach(document, {
        mode:
          scriptMode === 'replace' || scriptMode === 'toggle' || scriptMode === 'below'
            ? scriptMode
            : 'toggle',
        theme: scriptTheme ?? undefined,
        view: scriptView ?? undefined,
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
