/**
 * Tailwind class map for the recruiting review page. Utilities reuse the shared
 * token aliases, so this page adds almost no CSS to the strict total-CSS budget.
 */
export const recruitingClasses = {
  pageHint: "mb-4 text-sm text-text-secondary break-words",
  tabular: "font-mono tabular-nums whitespace-nowrap",
  drawerLoading: "flex justify-center py-12",
  drawerLayout:
    "grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]",
  drawerMain: "flex min-w-0 flex-col gap-5",
  drawerSide: "flex min-w-0 flex-col gap-5 lg:sticky lg:top-0",
  drawerSection: "flex flex-col gap-2",
  drawerSectionTitle: "m-0 text-base font-semibold text-text-primary",
  answerText:
    "m-0 whitespace-pre-wrap rounded-md border border-border-color bg-bg-subtle px-4 py-3 font-sans text-base leading-relaxed text-text-primary break-words",
  answerCode:
    "m-0 max-h-96 overflow-auto whitespace-pre rounded-md border border-border-color bg-bg-subtle px-4 py-3 font-mono text-sm leading-relaxed text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
  reviewPanel: "flex flex-col gap-3",
  scoreSummary: "flex items-center justify-between gap-3",
  scoreTotal:
    "font-mono text-data-lg font-semibold leading-none text-text-primary",
  scoreMax: "font-mono text-sm text-text-tertiary",
  dimension: "border-t border-divider-color pt-2",
  dimensionHeader: "flex items-center justify-between gap-2",
  dimensionLabel: "text-sm font-medium text-text-primary",
  dimensionValue: "font-mono text-sm text-text-tertiary",
  dimensionGuidance: "m-0 text-xs text-text-tertiary",
  reviewMeta: "m-0 text-xs text-text-tertiary",
  disclosure: "rounded-md border border-border-color",
  disclosureSummary:
    "cursor-pointer px-3 py-2 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-brand-primary",
  disclosureBody: "px-3 pb-3",
  rubricList:
    "m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-text-secondary",
  rubricSignals: "m-0 space-y-1 text-sm leading-relaxed text-text-secondary",
  rubricSignalTerm: "font-medium text-text-primary",
} as const;
