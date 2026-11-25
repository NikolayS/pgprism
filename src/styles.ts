export const PGPRISM_CSS = `
:host {
  display: block;
}
.pgp-root {
  --pgp-bg: #0b0e14;
  --pgp-surface: #11151d;
  --pgp-surface-2: #181e29;
  --pgp-ink: #f4f6f9;
  --pgp-ink-soft: #cbd5e1;
  --pgp-ink-faint: #8e9aaf;
  --pgp-line: #222938;
  --pgp-line-strong: #333d52;
  --pgp-accent: #ff7a33;
  --pgp-blue: #60a5fa;
  --pgp-ok: #34d399;
  --pgp-warn: #fbbf24;
  --pgp-danger: #f87171;
  --pgp-heat-1: rgba(251, 191, 36, 0.10);
  --pgp-heat-2: rgba(255, 122, 51, 0.16);
  --pgp-heat-3: rgba(248, 113, 113, 0.22);
  --pgp-sel: rgba(255, 122, 51, 0.10);
  --pgp-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  --pgp-mono: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  font-family: var(--pgp-sans);
  font-size: 13px;
  line-height: 1.45;
  color: var(--pgp-ink);
  background: var(--pgp-bg);
  border: 1px solid var(--pgp-line);
  border-radius: 4px;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.pgp-root[data-theme="light"] {
  --pgp-bg: #ffffff;
  --pgp-surface: #f8fafc;
  --pgp-surface-2: #f1f5f9;
  --pgp-ink: #0f172a;
  --pgp-ink-soft: #334155;
  --pgp-ink-faint: #64748b;
  --pgp-line: #e2e8f0;
  --pgp-line-strong: #cbd5e1;
  --pgp-accent: #ea580c;
  --pgp-blue: #1d4ed8;
  --pgp-ok: #047857;
  --pgp-warn: #b45309;
  --pgp-danger: #b91c1c;
  --pgp-heat-1: rgba(180, 83, 9, 0.08);
  --pgp-heat-2: rgba(234, 88, 12, 0.12);
  --pgp-heat-3: rgba(185, 28, 28, 0.16);
  --pgp-sel: rgba(234, 88, 12, 0.08);
}
.pgp-root *, .pgp-root *::before, .pgp-root *::after {
  box-sizing: border-box;
}
.pgp-root :focus-visible {
  outline: 1px solid var(--pgp-accent);
  outline-offset: 1px;
}
.pgp-mono {
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
}
.pgp-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
  padding: 12px 16px;
  background: var(--pgp-surface);
  border-bottom: 1px solid var(--pgp-line);
}
.pgp-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px 24px;
}
.pgp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pgp-stat-lbl {
  font-size: 11px;
  color: var(--pgp-ink-faint);
  font-weight: 500;
}
.pgp-stat-val {
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--pgp-ink);
}
.pgp-stat-sub {
  font-size: 11px;
  color: var(--pgp-ink-faint);
  font-weight: 400;
  margin-left: 5px;
}
.pgp-summary-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pgp-meta-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--pgp-line);
  font-size: 11.5px;
  color: var(--pgp-ink-soft);
  background: var(--pgp-bg);
}
.pgp-meta-item code {
  font-family: var(--pgp-mono);
  font-size: 11px;
  background: var(--pgp-surface-2);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--pgp-ink);
}
.pgp-diag {
  border-bottom: 1px solid var(--pgp-line);
  background: var(--pgp-bg);
}
.pgp-diag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 16px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--pgp-ink-soft);
  transition: background-color 80ms ease;
}
.pgp-diag-head:hover {
  background: var(--pgp-surface);
}
.pgp-diag-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 500;
  min-width: 0;
}
.pgp-diag-preview {
  color: var(--pgp-ink-faint);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 480px;
}
.pgp-diag-row .pgp-btn {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.pgp-diag-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--pgp-line);
}
.pgp-diag-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--pgp-line);
  font-size: 12px;
}
.pgp-diag-row:last-child {
  border-bottom: 0;
}
.pgp-diag-row:hover {
  background: var(--pgp-surface);
}
.pgp-diag-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.pgp-diag-txt {
  min-width: 0;
}
.pgp-diag-title {
  font-weight: 600;
  color: var(--pgp-ink);
}
.pgp-diag-detail {
  color: var(--pgp-ink-faint);
  margin-left: 6px;
}
.pgp-sev {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--pgp-line-strong);
  white-space: nowrap;
  flex-shrink: 0;
}
.pgp-sev-high {
  color: var(--pgp-danger);
  border-color: var(--pgp-danger);
}
.pgp-sev-med {
  color: var(--pgp-warn);
  border-color: var(--pgp-warn);
}
.pgp-sev-low {
  color: var(--pgp-blue);
  border-color: var(--pgp-blue);
}
.pgp-btn {
  appearance: none;
  background: transparent;
  border: 1px solid var(--pgp-line-strong);
  color: var(--pgp-ink-soft);
  font-family: var(--pgp-sans);
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1.25;
  white-space: nowrap;
  transition: background-color 80ms ease, border-color 80ms ease, color 80ms ease;
}
.pgp-btn:hover {
  color: var(--pgp-ink);
  border-color: var(--pgp-ink-soft);
}
.pgp-btn.active {
  background: var(--pgp-ink);
  color: var(--pgp-bg);
  border-color: var(--pgp-ink);
}
.pgp-btn-sm {
  font-size: 11px;
  padding: 2px 7px;
}
.pgp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  background: var(--pgp-bg);
  border-bottom: 1px solid var(--pgp-line);
}
.pgp-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.pgp-select, .pgp-input {
  background: var(--pgp-surface);
  border: 1px solid var(--pgp-line-strong);
  color: var(--pgp-ink);
  font-family: var(--pgp-sans);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 3px;
  outline: none;
}
.pgp-input {
  min-width: 155px;
}
.pgp-input:focus, .pgp-select:focus {
  border-color: var(--pgp-accent);
}
.pgp-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.pgp-workspace.with-insp {
  grid-template-columns: minmax(0, 1fr) 328px;
}
.pgp-workspace.with-insp .pgp-node-sub {
  display: none;
}
.pgp-workspace.with-insp .pgp-table .pgp-node-cell {
  min-width: 120px;
}
.pgp-workspace.with-insp .pgp-table th,
.pgp-workspace.with-insp .pgp-table td {
  padding: 5px 6px;
}
.pgp-workspace.with-insp .pgp-table .pgp-node-title {
  max-width: clamp(120px, 16vw, 200px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 1420px) {
  .pgp-workspace.with-insp .pgp-table th:nth-child(5),
  .pgp-workspace.with-insp .pgp-table td:nth-child(5),
  .pgp-workspace.with-insp .pgp-table th:nth-child(7),
  .pgp-workspace.with-insp .pgp-table td:nth-child(7) {
    display: none;
  }
}
@media (max-width: 900px) {
  .pgp-workspace.with-insp {
    grid-template-columns: minmax(0, 1fr);
  }
  .pgp-inspector {
    border-left: 0 !important;
    border-top: 1px solid var(--pgp-line);
  }
}
.pgp-main {
  min-width: 0;
  overflow: auto;
}
/* Compact Table View */
.pgp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pgp-table th, .pgp-table td {
  padding: 6px 9px;
  border-bottom: 1px solid var(--pgp-line);
  text-align: left;
  vertical-align: middle;
}
.pgp-table th:first-child, .pgp-table td:first-child {
  padding-left: 14px;
}
.pgp-table th:last-child, .pgp-table td:last-child {
  padding-right: 14px;
}
.pgp-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--pgp-surface);
  border-bottom: 1px solid var(--pgp-line-strong);
  color: var(--pgp-ink-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.pgp-table th.num, .pgp-table td.num {
  text-align: right;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pgp-table th.active-col {
  color: var(--pgp-ink);
  border-bottom-color: var(--pgp-accent);
}
.pgp-table tbody tr {
  cursor: pointer;
}
.pgp-table tbody tr:hover td {
  background: var(--pgp-surface);
}
.pgp-table tbody tr.selected td {
  background: var(--pgp-sel) !important;
}
.pgp-table tbody tr.selected td:first-child {
  color: var(--pgp-accent);
  font-weight: 700;
}
.pgp-table tbody tr.dimmed {
  opacity: 0.4;
}
.pgp-table tbody tr.never-exec {
  opacity: 0.56;
}
.pgp-subval {
  display: block;
  font-size: 10.5px;
  color: var(--pgp-ink-faint);
  font-weight: 400;
}
/* Aggregated breakdown panel */
.pgp-breakdown {
  border-bottom: 1px solid var(--pgp-line);
  background: var(--pgp-bg);
  padding: 10px 16px 12px;
}
.pgp-bd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 14px 20px;
}
.pgp-bd-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--pgp-ink-faint);
  margin-bottom: 6px;
}
.pgp-bd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  border: 1px solid var(--pgp-line);
}
.pgp-bd-table th, .pgp-bd-table td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--pgp-line);
  text-align: left;
}
.pgp-bd-table th {
  background: var(--pgp-surface);
  color: var(--pgp-ink-faint);
  font-size: 10.5px;
  font-weight: 600;
}
.pgp-bd-table th.num, .pgp-bd-table td.num {
  text-align: right;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pgp-bd-table tbody tr {
  cursor: pointer;
}
.pgp-bd-table tbody tr:hover td {
  background: var(--pgp-surface);
}
.pgp-bd-table tbody tr:last-child td {
  border-bottom: 0;
}
.pgp-node-cell {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 170px;
}
.pgp-depth-arrow {
  color: var(--pgp-ink-faint);
  font-family: var(--pgp-mono);
  font-size: 11px;
  flex-shrink: 0;
}
.pgp-fold-btn {
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--pgp-ink-faint);
  width: 16px;
  height: 16px;
  padding: 0;
  cursor: pointer;
  font-size: 10px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pgp-fold-btn:hover {
  color: var(--pgp-ink);
}
.pgp-fold-spacer {
  width: 16px;
  flex-shrink: 0;
}
.pgp-node-title {
  font-weight: 600;
  color: var(--pgp-ink);
}
.pgp-node-sub {
  color: var(--pgp-ink-faint);
  font-size: 11px;
  margin-left: 6px;
  font-family: var(--pgp-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.pgp-pill {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 500;
  padding: 0px 5px;
  border-radius: 3px;
  border: 1px solid var(--pgp-line-strong);
  color: var(--pgp-ink-soft);
  background: var(--pgp-surface);
  white-space: nowrap;
}
.pgp-pill-warn {
  color: var(--pgp-warn);
  border-color: var(--pgp-warn);
}
.pgp-pill-danger {
  color: var(--pgp-danger);
  border-color: var(--pgp-danger);
}
.pgp-pill-ok {
  color: var(--pgp-ok);
  border-color: var(--pgp-ok);
}
.pgp-pill-blue {
  color: var(--pgp-blue);
  border-color: var(--pgp-blue);
}
.pgp-bar-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.pgp-bar-track {
  width: 68px;
  height: 3px;
  background: var(--pgp-surface-2);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
}
.pgp-bar-fill {
  height: 100%;
  background: var(--pgp-accent);
}
.pgp-bar-fill.blue {
  background: var(--pgp-blue);
}
.pgp-heat-1 { background: var(--pgp-heat-1) !important; }
.pgp-heat-2 { background: var(--pgp-heat-2) !important; }
.pgp-heat-3 { background: var(--pgp-heat-3) !important; }
/* Interactive Tree View */
.pgp-tree-wrap {
  padding: 14px 16px;
  overflow: auto;
}
.pgp-tree-node {
  position: relative;
}
.pgp-tree-children {
  margin-left: 20px;
  padding-left: 14px;
  border-left: 1px solid var(--pgp-line-strong);
}
.pgp-tree-card {
  position: relative;
  border: 1px solid var(--pgp-line);
  border-radius: 4px;
  background: var(--pgp-surface);
  padding: 9px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 80ms ease, background-color 80ms ease;
}
.pgp-tree-children > .pgp-tree-node > .pgp-tree-card::before {
  content: "";
  position: absolute;
  left: -15px;
  top: 18px;
  width: 14px;
  height: 1px;
  background: var(--pgp-line-strong);
}
.pgp-tree-card:hover {
  border-color: var(--pgp-line-strong);
}
.pgp-tree-card.selected {
  border-color: var(--pgp-accent);
  background: var(--pgp-surface-2);
}
.pgp-tree-card.dimmed {
  opacity: 0.4;
}
.pgp-tree-card.never-exec {
  opacity: 0.56;
}
.pgp-tree-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.pgp-tree-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}
.pgp-tree-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  color: var(--pgp-ink-soft);
}
.pgp-tree-qual {
  margin-top: 4px;
  font-family: var(--pgp-mono);
  font-size: 11px;
  color: var(--pgp-ink-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pgp-tree-bar {
  margin-top: 7px;
  height: 5px;
  background: var(--pgp-bg);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
}
.pgp-tree-bar-self {
  height: 100%;
  background: var(--pgp-accent);
}
.pgp-tree-bar-child {
  height: 100%;
  background: var(--pgp-line-strong);
}
/* Flame / Waterfall View */
.pgp-flame-wrap {
  padding: 10px 16px 14px;
}
.pgp-flame-axis {
  display: grid;
  grid-template-columns: minmax(150px, 34%) minmax(120px, 1fr) minmax(96px, auto);
  gap: 10px;
  align-items: center;
  padding: 2px 4px 7px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--pgp-line-strong);
  font-size: 11px;
  font-weight: 600;
  color: var(--pgp-ink-faint);
}
.pgp-flame-ticks {
  display: flex;
  justify-content: space-between;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.pgp-flame-row {
  display: grid;
  grid-template-columns: minmax(150px, 34%) minmax(120px, 1fr) minmax(96px, auto);
  gap: 10px;
  align-items: center;
  padding: 6px 4px;
  border-bottom: 1px solid var(--pgp-line);
  cursor: pointer;
  font-size: 12px;
}
.pgp-flame-row:hover {
  background: var(--pgp-surface);
}
.pgp-flame-row.selected {
  background: var(--pgp-sel);
}
.pgp-flame-row.dimmed {
  opacity: 0.4;
}
.pgp-flame-row.never-exec {
  opacity: 0.56;
}
.pgp-flame-lbl {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.pgp-flame-lbl .pgp-node-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pgp-flame-track {
  position: relative;
  height: 16px;
  background: var(--pgp-surface);
  border: 1px solid var(--pgp-line);
  border-radius: 2px;
  overflow: hidden;
}
.pgp-flame-track::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--pgp-line);
  pointer-events: none;
}
.pgp-flame-incl {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: var(--pgp-line-strong);
  border-radius: 1px;
}
.pgp-flame-excl {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: var(--pgp-accent);
  border-radius: 1px;
}
.pgp-flame-val {
  text-align: right;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  white-space: nowrap;
}
/* Text / JSON View */
.pgp-code-wrap {
  padding: 12px 16px 16px;
}
.pgp-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11.5px;
  color: var(--pgp-ink-faint);
}
.pgp-pre {
  margin: 0;
  padding: 12px 14px;
  background: var(--pgp-surface);
  border: 1px solid var(--pgp-line);
  border-radius: 4px;
  font-family: var(--pgp-mono);
  font-size: 12px;
  line-height: 1.55;
  overflow-x: auto;
  color: var(--pgp-ink);
  white-space: pre;
}
.pgp-tok-node { color: var(--pgp-ink); font-weight: 600; }
.pgp-tok-cost { color: var(--pgp-ink-faint); }
.pgp-tok-act { color: var(--pgp-accent); }
.pgp-tok-buf { color: var(--pgp-blue); }
.pgp-tok-warn { color: var(--pgp-warn); }
/* Inspector Panel */
.pgp-inspector {
  border-left: 1px solid var(--pgp-line);
  background: var(--pgp-surface);
  padding: 14px 16px;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: 12px;
}
.pgp-inspector .pgp-btn {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pgp-insp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--pgp-line);
  margin-bottom: 12px;
}
.pgp-insp-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--pgp-ink);
  overflow-wrap: anywhere;
  word-break: normal;
}
.pgp-insp-sub {
  font-size: 11px;
  color: var(--pgp-ink-faint);
  margin-top: 2px;
}
.pgp-insp-sec {
  margin-bottom: 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--pgp-line);
}
.pgp-insp-sec:last-child {
  border-bottom: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}
.pgp-insp-sec-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--pgp-ink-faint);
  margin-bottom: 6px;
}
.pgp-kv {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 12px;
  align-items: baseline;
}
.pgp-k {
  color: var(--pgp-ink-faint);
  white-space: nowrap;
}
.pgp-v {
  text-align: right;
  font-family: var(--pgp-mono);
  font-variant-numeric: tabular-nums;
  color: var(--pgp-ink);
  word-break: break-word;
}
.pgp-expr {
  font-family: var(--pgp-mono);
  font-size: 11px;
  background: var(--pgp-bg);
  border: 1px solid var(--pgp-line);
  border-radius: 3px;
  padding: 6px 8px;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--pgp-ink-soft);
}
.pgp-worker-tbl {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--pgp-mono);
  font-size: 11px;
  margin-top: 4px;
}
.pgp-worker-tbl th, .pgp-worker-tbl td {
  padding: 3px 5px;
  border-bottom: 1px solid var(--pgp-line);
  text-align: right;
}
.pgp-worker-tbl th:first-child, .pgp-worker-tbl td:first-child {
  text-align: left;
}
@media (max-width: 600px) {
  .pgp-diag-preview { display: none; }
  .pgp-flame-axis, .pgp-flame-row {
    grid-template-columns: minmax(110px, 42%) minmax(70px, 1fr) auto;
    gap: 6px;
  }
}
.pgp-error {
  padding: 14px;
  color: var(--pgp-danger);
  font-family: var(--pgp-mono);
  font-size: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .pgp-root * { transition: none !important; }
}
`;
