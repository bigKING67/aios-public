/**
 * Shared metadata for weekly behavior gate registry audits.
 *
 * The weekly behavior gates themselves are discovered dynamically because the
 * surface is large, but the registry/meta guards should still have one
 * canonical definition to avoid fixture and implementation drift.
 */

export const WEEKLY_BEHAVIOR_FILE_PATTERN = /^scripts\/checks\/weekly(?:-[a-z0-9-]+)?\/.+\.behavior\.mjs$/;

export const WEEKLY_BEHAVIOR_REGISTRY_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:weekly:behavior-gate-registry-behavior',
  command: 'node scripts/checks/weekly/behavior-gate-registry.behavior.mjs',
  file: 'scripts/checks/weekly/behavior-gate-registry.behavior.mjs',
  label: '[verify:ci] weekly behavior gate registry behavior',
});

export const WEEKLY_BEHAVIOR_REGISTRY_META_GATE = Object.freeze({
  name: 'verify:weekly:behavior-gate-registry',
  command: 'node scripts/checks/weekly/behavior-gate-registry.mjs',
  file: 'scripts/checks/weekly/behavior-gate-registry.mjs',
  label: '[verify:ci] weekly behavior gate registry',
});

export const WEEKLY_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GATE = Object.freeze({
  name: 'verify:weekly:behavior-guard-quality-behavior',
  command: 'node scripts/checks/weekly/behavior-guard-quality.behavior.mjs',
  file: 'scripts/checks/weekly/behavior-guard-quality.behavior.mjs',
  label: '[verify:ci] weekly behavior guard quality behavior',
});

export const WEEKLY_BEHAVIOR_GUARD_QUALITY_META_GATE = Object.freeze({
  name: 'verify:weekly:behavior-guard-quality',
  command: 'node scripts/checks/weekly/behavior-guard-quality.mjs',
  file: 'scripts/checks/weekly/behavior-guard-quality.mjs',
  label: '[verify:ci] weekly behavior guard quality',
});

export const WEEKLY_BEHAVIOR_META_GATES = Object.freeze([
  WEEKLY_BEHAVIOR_REGISTRY_META_GATE,
  WEEKLY_BEHAVIOR_GUARD_QUALITY_META_GATE,
]);

export const WEEKLY_BEHAVIOR_MANIFEST_GATES = Object.freeze([
  WEEKLY_BEHAVIOR_REGISTRY_BEHAVIOR_GATE,
  WEEKLY_BEHAVIOR_REGISTRY_META_GATE,
  WEEKLY_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GATE,
  WEEKLY_BEHAVIOR_GUARD_QUALITY_META_GATE,
]);

export const WEEKLY_BEHAVIOR_GATE_NAMES = Object.freeze([
  'verify:weekly:tsx-guard-utils',
  'verify:weekly:douyin-section-utils',
  'verify:weekly:funnel',
  'verify:weekly:metric-column-builders',
  'verify:weekly:overview-kpi',
  'verify:weekly:overview-kpi-section-adapter',
  'verify:weekly:overview-tab-content-adapter',
  'verify:weekly:overview-platform-breakdown',
  'verify:weekly:overview-platform-breakdown-section-adapter',
  'verify:weekly:overview-trend',
  'verify:weekly:overview-trend-section-adapter',
  'verify:weekly:overview-by-week-trend',
  'verify:weekly:overview-by-week-trend-section-adapter',
  'verify:weekly:platform-tab-attribution-overview-frame',
  'verify:weekly:platform-tab-funnel-overview-frame',
  'verify:weekly:platform-tab-quant-attribution-frame',
  'verify:weekly:platform-tab-content-adapters',
  'verify:weekly:platform-tab-douyin-attribution-section-adapter',
  'verify:weekly:platform-tab-douyin-attribution-section-props-contract',
  'verify:weekly:platform-tab-douyin-card-leaf-adapter',
  'verify:weekly:platform-tab-douyin-card-product-section',
  'verify:weekly:platform-tab-douyin-card-section-adapter',
  'verify:weekly:platform-tab-douyin-card-source-funnel-section',
  'verify:weekly:platform-tab-douyin-card-source-section',
  'verify:weekly:platform-tab-douyin-card-sections-routing',
  'verify:weekly:platform-tab-douyin-channel-leaf-adapter',
  'verify:weekly:platform-tab-douyin-section-adapter',
  'verify:weekly:platform-tab-douyin-section-list-adapter',
  'verify:weekly:platform-tab-douyin-live-leaf-adapter',
  'verify:weekly:platform-tab-douyin-live-section-adapter',
  'verify:weekly:platform-tab-douyin-live-funnel-section',
  'verify:weekly:platform-tab-douyin-live-session-section',
  'verify:weekly:platform-tab-douyin-live-sections-routing',
  'verify:weekly:platform-tab-douyin-section-list-routing',
  'verify:weekly:platform-tab-douyin-sections-layout',
  'verify:weekly:platform-tab-douyin-shortvideo-analysis-section',
  'verify:weekly:platform-tab-douyin-shortvideo-leaf-adapter',
  'verify:weekly:platform-tab-douyin-shortvideo-overview-section',
  'verify:weekly:platform-tab-douyin-shortvideo-section-adapter',
  'verify:weekly:platform-tab-douyin-shortvideo-sections-routing',
  'verify:weekly:platform-tab-kpi-section-adapter',
  'verify:weekly:platform-tab-tmall-attribution-section-adapter',
  'verify:weekly:platform-tab-tmall-channel-section',
  'verify:weekly:platform-tab-tmall-funnel-leaf-adapter',
  'verify:weekly:platform-tab-tmall-funnel-section-list-adapter',
  'verify:weekly:platform-tab-tmall-goods-section',
  'verify:weekly:platform-tab-tmall-leaf-adapter',
  'verify:weekly:platform-tab-trend-section-adapter',
  'verify:weekly:platform-tab-content-routing',
  'verify:weekly:platform-tab-render-state',
  'verify:weekly:primary-metrics',
  'verify:weekly:waterfall',
]);

export const WEEKLY_BEHAVIOR_LABELS = Object.freeze({
  'verify:weekly:tsx-guard-utils': '[verify:ci] weekly TSX guard utils behavior',
  'verify:weekly:douyin-section-utils': '[verify:ci] weekly Douyin section utils behavior',
  'verify:weekly:funnel': '[verify:ci] weekly funnel behavior',
  'verify:weekly:metric-column-builders': '[verify:ci] weekly metric column builders behavior',
  'verify:weekly:overview-kpi': '[verify:ci] weekly overview KPI behavior',
  'verify:weekly:overview-kpi-section-adapter': '[verify:ci] weekly overview KPI section adapter behavior',
  'verify:weekly:overview-tab-content-adapter': '[verify:ci] weekly overview tab content-adapter behavior',
  'verify:weekly:overview-platform-breakdown': '[verify:ci] weekly overview platform breakdown behavior',
  'verify:weekly:overview-platform-breakdown-section-adapter': '[verify:ci] weekly overview platform breakdown section adapter behavior',
  'verify:weekly:overview-trend': '[verify:ci] weekly overview trend behavior',
  'verify:weekly:overview-trend-section-adapter': '[verify:ci] weekly overview trend section adapter behavior',
  'verify:weekly:overview-by-week-trend': '[verify:ci] weekly overview by-week trend behavior',
  'verify:weekly:overview-by-week-trend-section-adapter': '[verify:ci] weekly overview by-week trend section adapter behavior',
  'verify:weekly:platform-tab-attribution-overview-frame': '[verify:ci] weekly platform tab attribution overview frame behavior',
  'verify:weekly:platform-tab-funnel-overview-frame': '[verify:ci] weekly platform tab funnel overview frame behavior',
  'verify:weekly:platform-tab-quant-attribution-frame': '[verify:ci] weekly platform tab quant attribution frame behavior',
  'verify:weekly:platform-tab-content-adapters': '[verify:ci] weekly platform tab content-adapters behavior',
  'verify:weekly:platform-tab-douyin-attribution-section-adapter': '[verify:ci] weekly platform tab Douyin attribution section adapter behavior',
  'verify:weekly:platform-tab-douyin-attribution-section-props-contract': '[verify:ci] weekly platform tab Douyin attribution section props-contract behavior',
  'verify:weekly:platform-tab-douyin-card-leaf-adapter': '[verify:ci] weekly platform tab Douyin card leaf-adapter behavior',
  'verify:weekly:platform-tab-douyin-card-product-section': '[verify:ci] weekly platform tab Douyin card-product-section behavior',
  'verify:weekly:platform-tab-douyin-card-section-adapter': '[verify:ci] weekly platform tab Douyin card-section adapter behavior',
  'verify:weekly:platform-tab-douyin-card-source-funnel-section': '[verify:ci] weekly platform tab Douyin card-source-funnel-section behavior',
  'verify:weekly:platform-tab-douyin-card-source-section': '[verify:ci] weekly platform tab Douyin card-source-section behavior',
  'verify:weekly:platform-tab-douyin-card-sections-routing': '[verify:ci] weekly platform tab Douyin card-sections routing behavior',
  'verify:weekly:platform-tab-douyin-channel-leaf-adapter': '[verify:ci] weekly platform tab Douyin channel leaf-adapter behavior',
  'verify:weekly:platform-tab-douyin-section-adapter': '[verify:ci] weekly platform tab Douyin section adapter behavior',
  'verify:weekly:platform-tab-douyin-section-list-adapter': '[verify:ci] weekly platform tab Douyin section-list adapter behavior',
  'verify:weekly:platform-tab-douyin-live-leaf-adapter': '[verify:ci] weekly platform tab Douyin live leaf-adapter behavior',
  'verify:weekly:platform-tab-douyin-live-section-adapter': '[verify:ci] weekly platform tab Douyin live-section adapter behavior',
  'verify:weekly:platform-tab-douyin-live-funnel-section': '[verify:ci] weekly platform tab Douyin live-funnel-section behavior',
  'verify:weekly:platform-tab-douyin-live-session-section': '[verify:ci] weekly platform tab Douyin live-session-section behavior',
  'verify:weekly:platform-tab-douyin-live-sections-routing': '[verify:ci] weekly platform tab Douyin live-sections routing behavior',
  'verify:weekly:platform-tab-douyin-section-list-routing': '[verify:ci] weekly platform tab Douyin section-list routing behavior',
  'verify:weekly:platform-tab-douyin-sections-layout': '[verify:ci] weekly platform tab Douyin sections layout behavior',
  'verify:weekly:platform-tab-douyin-shortvideo-analysis-section': '[verify:ci] weekly platform tab Douyin shortvideo analysis section behavior',
  'verify:weekly:platform-tab-douyin-shortvideo-leaf-adapter': '[verify:ci] weekly platform tab Douyin shortvideo leaf-adapter behavior',
  'verify:weekly:platform-tab-douyin-shortvideo-overview-section': '[verify:ci] weekly platform tab Douyin shortvideo overview section behavior',
  'verify:weekly:platform-tab-douyin-shortvideo-section-adapter': '[verify:ci] weekly platform tab Douyin shortvideo-section adapter behavior',
  'verify:weekly:platform-tab-douyin-shortvideo-sections-routing': '[verify:ci] weekly platform tab Douyin shortvideo-sections routing behavior',
  'verify:weekly:platform-tab-kpi-section-adapter': '[verify:ci] weekly platform tab KPI section adapter behavior',
  'verify:weekly:platform-tab-tmall-attribution-section-adapter': '[verify:ci] weekly platform tab Tmall attribution section adapter behavior',
  'verify:weekly:platform-tab-tmall-channel-section': '[verify:ci] weekly platform tab Tmall channel-section behavior',
  'verify:weekly:platform-tab-tmall-funnel-leaf-adapter': '[verify:ci] weekly platform tab Tmall funnel leaf-adapter behavior',
  'verify:weekly:platform-tab-tmall-funnel-section-list-adapter': '[verify:ci] weekly platform tab Tmall funnel section-list adapter behavior',
  'verify:weekly:platform-tab-tmall-goods-section': '[verify:ci] weekly platform tab Tmall goods-section behavior',
  'verify:weekly:platform-tab-tmall-leaf-adapter': '[verify:ci] weekly platform tab Tmall leaf-adapter behavior',
  'verify:weekly:platform-tab-trend-section-adapter': '[verify:ci] weekly platform tab trend-section adapter behavior',
  'verify:weekly:platform-tab-content-routing': '[verify:ci] weekly platform tab content-routing behavior',
  'verify:weekly:platform-tab-render-state': '[verify:ci] weekly platform tab render-state behavior',
  'verify:weekly:primary-metrics': '[verify:ci] weekly primary metrics behavior',
  'verify:weekly:waterfall': '[verify:ci] weekly waterfall behavior',
});

export const WEEKLY_BEHAVIOR_EXPECTED_GATES = Object.freeze(
  WEEKLY_BEHAVIOR_GATE_NAMES.map((name) => Object.freeze({
    name,
    label: WEEKLY_BEHAVIOR_LABELS[name],
  })),
);
