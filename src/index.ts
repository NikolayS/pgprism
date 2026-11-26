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
  PlanState,
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

import {
  autoAttach,
  bootstrapDocument,
  resolveAutoAttachScriptConfig,
  upgradeDeclarativeElements,
} from './auto-attach';
import { registerElement } from './web-component';

registerElement('pg-plan');

// Capture currentScript synchronously before DOMContentLoaded; when null (async / type="module"),
// resolveAutoAttachScriptConfig falls back to document.querySelector('script[data-auto-attach]').
if (typeof document !== 'undefined') {
  const sawCurrentScriptWithoutAttr = Boolean(
    document.currentScript && !document.currentScript.hasAttribute('data-auto-attach')
  );
  const capturedConfig = resolveAutoAttachScriptConfig(document);

  const boot = () => {
    if (sawCurrentScriptWithoutAttr) {
      upgradeDeclarativeElements(document);
      return;
    }
    bootstrapDocument(document, capturedConfig);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
