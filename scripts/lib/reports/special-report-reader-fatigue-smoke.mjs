const FATIGUE_DESIGN_SNIPPETS = [
  'Use an answer-first pyramid',
  'one dominant figure',
  'no more than 5 highlighted numbers',
  'no more than 2 callouts',
  'no more than 1 secondary evidence table',
  'no more than 6 visible legend categories',
  'Footnotes and corner notes should be visually quiet',
];

export function auditSpecialReportReaderFatigue({
  files,
  findings,
  paths,
}) {
  const designAuthority = files[paths.designAuthority];
  for (const snippet of FATIGUE_DESIGN_SNIPPETS) {
    requireIncludes(
      findings,
      paths.designAuthority,
      designAuthority,
      snippet,
      'Static special report reader-fatigue authority drifted',
    );
  }

  const reportChartPanel = files[paths.reportChartPanel];
  const reportFigure = files[paths.reportFigure];
  const brandShared = files[paths.brandShared];

  for (const snippet of [
    'ariaLabel: string;',
    'chartBuilder: SpecialReportChartBuilderName;',
    'takeaway: string;',
    'title: string;',
    'topic: string;',
    'caption={caption}',
    'footnote={footnote}',
  ]) {
    requireIncludes(
      findings,
      paths.reportChartPanel,
      reportChartPanel,
      snippet,
      'Chart evidence panels must keep an explicit figure-reading contract',
    );
  }

  for (const snippet of [
    '<figure',
    '<figcaption',
    '<span className={styles.captionLabel}>备注：</span>',
    'aria-label="备注：来源与证据边界"',
    'const resolvedReadingNote = readingNote ?? caption',
    'const resolvedCornerNote = cornerNote ?? footnote',
  ]) {
    requireIncludes(
      findings,
      paths.reportFigure,
      reportFigure,
      snippet,
      'ReportFigure must keep quiet caption/corner-note hierarchy',
    );
  }

  requireIncludes(
    findings,
    paths.brandShared,
    brandShared,
    'const [lead, ...supportingItems] = items',
    'MetricStrip must keep one dominant highlighted number before supporting metrics',
  );

  auditChartEvidencePanelUsage(files, findings, paths);
  auditMetricStripBudgets(files, findings, paths);
  auditCalloutBudgets(files, findings, paths);
}

function auditChartEvidencePanelUsage(files, findings, paths) {
  const visualPaths = [
    paths.brandTotalSection,
    paths.tmallVisuals,
    paths.douyinVisuals,
  ];

  for (const filePath of visualPaths) {
    const source = files[filePath];
    for (const block of collectSelfClosingComponentBlocks(source, 'ChartEvidencePanel')) {
      const suppressesVisibleNotes = /\bshowReferenceReadingNote=\{false\}/.test(block);
      const requiredProps = suppressesVisibleNotes
        ? ['topic', 'title', 'ariaLabel', 'chartBuilder', 'takeaway']
        : ['topic', 'title', 'ariaLabel', 'chartBuilder', 'takeaway', 'caption', 'footnote'];

      for (const prop of requiredProps) {
        if (!new RegExp(`\\b${prop}=`).test(block)) {
          findings.push(`ChartEvidencePanel usage in ${filePath} must include ${prop}= so the chart is readable without hover.`);
        }
      }
    }

    for (const block of collectSelfClosingComponentBlocks(source, 'ChartEvidenceEmptyPanel')) {
      for (const prop of ['topic', 'title', 'ariaLabel', 'reason', 'footnote']) {
        if (!new RegExp(`\\b${prop}=`).test(block)) {
          findings.push(`ChartEvidenceEmptyPanel usage in ${filePath} must include ${prop}= so missing evidence remains explicit.`);
        }
      }
    }
  }
}

function auditMetricStripBudgets(files, findings, paths) {
  const metricPaths = [
    paths.tmallSection,
    paths.douyinSection,
  ];

  for (const filePath of metricPaths) {
    const source = files[filePath];
    for (const match of source.matchAll(/<MetricStrip\s+items=\{\[([\s\S]*?)\]\}\s*\/>/g)) {
      const itemCount = countOccurrences(match[1], 'label:');
      if (itemCount > 5) {
        findings.push(`MetricStrip in ${filePath} has ${itemCount} highlighted numbers; reader-fatigue budget is <= 5.`);
      }
    }
  }
}

function auditCalloutBudgets(files, findings, paths) {
  const calloutPaths = [
    paths.tmallSection,
    paths.douyinSection,
  ];

  for (const filePath of calloutPaths) {
    const calloutCount = countOccurrences(files[filePath], 'channelCallout');
    if (calloutCount > 2) {
      findings.push(`Section file ${filePath} has ${calloutCount} channel callouts; reader-fatigue budget is <= 2.`);
    }
  }
}

function collectSelfClosingComponentBlocks(source, componentName) {
  return [...source.matchAll(new RegExp(`<${componentName}\\b[\\s\\S]*?\\/?>`, 'g'))]
    .map((match) => match[0])
    .filter((block) => block.endsWith('/>'));
}

function requireIncludes(findings, filePath, source, needle, message) {
  if (!source.includes(needle)) {
    findings.push(`${message}: ${filePath} must include ${JSON.stringify(needle)}.`);
  }
}

function countOccurrences(source, needle) {
  if (!needle) {
    return 0;
  }
  return source.split(needle).length - 1;
}
