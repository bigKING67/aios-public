export function auditSpecialReportChartGallery({
  chartCatalogSource,
  chartGalleryBoard,
  chartGalleryDoc,
  chartGalleryFixtures,
  chartGalleryPreviewRenderers,
  candidateVisualsSource,
  designAuthority,
  expectedCandidateVisuals,
  expectedChartTemplates,
  expectedStaticVisuals,
  findings,
  paths,
  specialReportIndex,
}) {
  requireIncludes(
    findings,
    paths.designAuthority,
    designAuthority,
    'docs/SPECIAL_REPORT_CHART_GALLERY.md',
    'DESIGN.md must point special-report chart implementation details to the chart gallery',
  );
  requireIncludes(
    findings,
    paths.chartGalleryDoc,
    chartGalleryDoc,
    '# Special report chart gallery',
    'Chart gallery documentation must exist',
  );
  requireIncludes(
    findings,
    paths.specialReportIndex,
    specialReportIndex,
    'isDevelopmentMode',
    'Special report index must keep the chart reference board development-only',
  );
  requireIncludes(
    findings,
    paths.specialReportIndex,
    specialReportIndex,
    "import('./chart-options/gallery-reference-board')",
    'Special report index must lazy-load the development chart reference board',
  );
  requireIncludes(
    findings,
    paths.specialReportIndex,
    specialReportIndex,
    '<SpecialReportChartReferenceBoard />',
    'Special report index must still render the executable chart reference board in development',
  );
  requireIncludes(
    findings,
    paths.chartGalleryBoard,
    chartGalleryBoard,
    'SPECIAL_REPORT_CHART_GALLERY_FIXTURES.map',
    'Chart reference board must be generated from the typed gallery fixtures',
  );
  requireIncludes(
    findings,
    paths.chartGalleryBoard,
    chartGalleryBoard,
    'renderReferencePreview',
    'Chart reference board must delegate template-sensitive previews to the preview renderer module',
  );
  requireIncludes(
    findings,
    paths.chartGalleryPreviewRenderers,
    chartGalleryPreviewRenderers,
    'export function renderReferencePreview',
    'Chart reference preview renderer must expose the template-sensitive preview entrypoint',
  );
  for (const snippet of [
    'data-special-report-chart-gallery-board',
    'data-chart-reference-template',
    'data-chart-reference-fixture-id',
    'data-chart-reference-frame-kind',
    'data-chart-reference-mark-count',
    'data-chart-reference-label-count',
    'data-chart-reference-palette',
    'data-chart-reference-preview-kind',
    'data-chart-reference-question',
    'data-chart-reference-claim',
    'data-chart-reference-mobile-policy',
  ]) {
    requireIncludes(
      findings,
      paths.chartGalleryBoard,
      chartGalleryBoard,
      snippet,
      'Chart reference board must expose stable DOM handles for browser smoke',
    );
  }
  requireIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    'satisfies readonly SpecialReportChartGalleryFixture[]',
    'Chart gallery fixtures must stay type-checked against their contract',
  );
  requireIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    'interface SpecialReportChartReferenceFrame',
    'Chart gallery fixtures must expose a typed visual reference frame contract',
  );
  requireIncludes(
    findings,
    paths.chartGalleryDoc,
    chartGalleryDoc,
    '## Visual reference fixture contract',
    'Chart gallery docs must describe the visual reference fixture contract',
  );
  for (const snippet of [
    '`previewKind`',
    '`claim`',
    '`mobilePolicy`',
    '`referenceFrame.fixtureId`',
    '`referenceFrame.kind`',
    '`referenceFrame.frameSize`',
    '`referenceFrame.layout`, `marks`, `labels`, `caption`, and `cornerNote`',
  ]) {
    requireIncludes(
      findings,
      paths.chartGalleryDoc,
      chartGalleryDoc,
      snippet,
      'Chart gallery docs must keep the visual reference fixture fields auditable',
    );
  }
  for (const snippet of [
    '## Reference board preview grammar',
    'data-chart-reference-preview-kind',
    'data-chart-reference-question',
    'data-chart-reference-claim',
    'data-chart-reference-mobile-policy',
  ]) {
    requireIncludes(
      findings,
      paths.chartGalleryDoc,
      chartGalleryDoc,
      snippet,
      'Chart gallery docs must describe the executable reference board handles',
    );
  }
  auditScenarioFirstDecisionMatrix({
    chartGalleryDoc,
    chartGalleryDocPath: paths.chartGalleryDoc,
    findings,
  });
  auditCandidateVisualRegistry({
    candidateVisualsPath: paths.candidateVisuals,
    candidateVisualsSource,
    chartCatalogPath: paths.chartCatalog,
    chartCatalogSource,
    chartGalleryDoc,
    chartGalleryDocPath: paths.chartGalleryDoc,
    designAuthority,
    designAuthorityPath: paths.designAuthority,
    expectedCandidateVisuals,
    findings,
  });

  const fixtureTemplates = parseTemplateValues(chartGalleryFixtures);
  const fixtureBlocks = parseFixtureBlocks(chartGalleryFixtures);
  const fixtureBlockByTemplate = new Map(fixtureBlocks.map((entry) => [entry.template, entry.raw]));
  const duplicateFixtureTemplates = findDuplicates(fixtureTemplates);
  for (const duplicateTemplate of duplicateFixtureTemplates) {
    findings.push(`Chart gallery fixture template "${duplicateTemplate}" is duplicated.`);
  }

  for (const template of expectedChartTemplates) {
    requireIncludes(
      findings,
      paths.chartGalleryDoc,
      chartGalleryDoc,
      `\`${template}\``,
      `Chart gallery docs must include template "${template}"`,
    );
    requireIncludes(
      findings,
      paths.chartGalleryFixtures,
      chartGalleryFixtures,
      `template: '${template}'`,
      `Chart gallery fixtures must include template "${template}"`,
    );
    const fixtureBlock = fixtureBlockByTemplate.get(template);
    if (!fixtureBlock) {
      findings.push(`Chart gallery fixture template "${template}" is not parseable as an auditable fixture block.`);
      continue;
    }
    auditFixtureReferenceFrame({
      findings,
      fixtureBlock,
      fixturePath: paths.chartGalleryFixtures,
      template,
    });
  }

  for (const entry of parseCatalogEntries(chartCatalogSource, 'SPECIAL_REPORT_CHART_CATALOG')) {
    if (!fixtureTemplates.includes(entry.template)) {
      findings.push(`Chart catalog builder "${entry.builder}" uses template "${entry.template}" without a gallery fixture.`);
    }
    requireIncludes(
      findings,
      paths.chartGalleryFixtures,
      chartGalleryFixtures,
      entry.builder,
      `Chart gallery fixture usage must mention builder "${entry.builder}"`,
    );
  }

  for (const expected of expectedStaticVisuals) {
    requireIncludes(
      findings,
      paths.chartGalleryFixtures,
      chartGalleryFixtures,
      expected.name,
      `Chart gallery fixtures must reference static visual "${expected.name}"`,
    );
    requireIncludes(
      findings,
      paths.chartGalleryFixtures,
      chartGalleryFixtures,
      "renderer: 'dom'",
      'DOM static visuals must stay documented as DOM-rendered fixtures',
    );
  }

  requireIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    "template: 'connected-dot'",
    'Connected-dot template must have a gallery fixture even before production use',
  );
  requireIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    "usageStatus: 'available-unused'",
    'Connected-dot template must be explicitly marked available-unused until a production catalog entry uses it',
  );
  requireIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    'maxVisibleLegendCategories',
    'Chart gallery fixtures must state each template legend category budget',
  );
  for (const template of [
    'benchmark-bullet',
    'connected-dot',
    'delta-rank',
    'horizontal-composition',
    'lollipop',
    'quadrant-bubble',
    'ranked-bar',
    'tile-heatmap',
  ]) {
    requireIncludes(
      findings,
      paths.chartGalleryPreviewRenderers,
      chartGalleryPreviewRenderers,
      `case '${template}'`,
      `Chart reference board must render a template-sensitive preview for "${template}"`,
    );
    requireIncludes(
      findings,
      paths.chartGalleryDoc,
      chartGalleryDoc,
      `\`${template}\``,
      `Chart gallery docs must describe template-sensitive preview rules for "${template}"`,
    );
  }
  requireNotIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    'HeatmapChart',
    'Tile heatmap fixture must not imply ECharts heatmap registration',
  );
  requireNotIncludes(
    findings,
    paths.chartGalleryFixtures,
    chartGalleryFixtures,
    'VisualMapComponent',
    'Tile heatmap fixture must not imply ECharts visualMap registration',
  );
}

function auditScenarioFirstDecisionMatrix({
  chartGalleryDoc,
  chartGalleryDocPath,
  findings,
}) {
  for (const snippet of [
    '## Scenario-first chart selection guide',
    'one analytical question gets one dominant visual',
    'table demotion ladder',
    'Ranking / ordered comparison',
    'Delta / before-after movement',
    'Trend over time',
    'Composition / share',
    'Flow / conversion path',
    'Distribution / long tail',
    'Correlation / quadrant',
    'Threshold / anomaly',
    'Heatmap / matrix scan',
    'Exact audit / ledger',
  ]) {
    requireIncludes(
      findings,
      chartGalleryDocPath,
      chartGalleryDoc,
      snippet,
      'Chart gallery docs must keep a scenario-first visual decision matrix',
    );
  }
}

function parseTemplateValues(source) {
  return [...source.matchAll(/\btemplate:\s*'([^']+)'/g)].map((match) => match[1]);
}

function auditCandidateVisualRegistry({
  candidateVisualsPath,
  candidateVisualsSource,
  chartCatalogPath,
  chartCatalogSource,
  chartGalleryDoc,
  chartGalleryDocPath,
  designAuthority,
  designAuthorityPath,
  expectedCandidateVisuals,
  findings,
}) {
  requireIncludes(
    findings,
    candidateVisualsPath,
    candidateVisualsSource,
    'SPECIAL_REPORT_CANDIDATE_VISUALS',
    'Candidate visual registry must expose a stable typed export',
  );
  requireIncludes(
    findings,
    candidateVisualsPath,
    candidateVisualsSource,
    'satisfies readonly SpecialReportCandidateVisualEntry[]',
    'Candidate visual registry must stay type-checked against its contract',
  );
  for (const snippet of [
    "status: 'candidate'",
    "productionCatalogStatus: 'not-approved'",
    'requiredBeforeProduction',
    'catalog or static-visual entry',
    'smoke expectation',
  ]) {
    requireIncludes(
      findings,
      candidateVisualsPath,
      candidateVisualsSource,
      snippet,
      'Candidate visual registry must make non-production status explicit',
    );
  }
  for (const snippet of [
    'Candidate visuals are planning entries only',
    'SPECIAL_REPORT_CANDIDATE_VISUALS',
    'not production-approved',
  ]) {
    requireIncludes(
      findings,
      chartGalleryDocPath,
      chartGalleryDoc,
      snippet,
      'Chart gallery docs must prevent candidates from being read as approved templates',
    );
  }
  requireIncludes(
    findings,
    designAuthorityPath,
    designAuthority,
    'SPECIAL_REPORT_CANDIDATE_VISUALS',
    'DESIGN.md must explain that candidate visual registries are planning aids only',
  );

  for (const visualName of expectedCandidateVisuals) {
    requireIncludes(
      findings,
      candidateVisualsPath,
      candidateVisualsSource,
      `name: '${visualName}'`,
      `Candidate visual registry must include "${visualName}"`,
    );
    requireIncludes(
      findings,
      chartGalleryDocPath,
      chartGalleryDoc,
      `\`${visualName}\``,
      `Chart gallery docs must document candidate visual "${visualName}"`,
    );
    requireNotIncludes(
      findings,
      chartCatalogPath,
      chartCatalogSource,
      `'${visualName}'`,
      `Candidate visual "${visualName}" must not be added to production chart/static catalogs before approval`,
    );
  }
}

function parseFixtureBlocks(source) {
  return [...source.matchAll(/^ {2}\{\n {4}template:\s*'([^']+)',[\s\S]*?^ {2}\},/gm)]
    .map((match) => ({
      template: match[1],
      raw: match[0],
    }));
}

function parseCatalogEntries(source, name) {
  const blockMatch = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`));
  if (!blockMatch) {
    return [];
  }

  return [...blockMatch[1].matchAll(/\{([\s\S]*?)\}/g)].map((match) => {
    const raw = match[1];
    return {
      builder: readStringField(raw, 'builder'),
      template: readStringField(raw, 'template'),
    };
  }).filter((entry) => entry.builder && entry.template);
}

function readStringField(rawObjectText, fieldName) {
  const match = rawObjectText.match(new RegExp(`\\b${fieldName}:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...duplicates].sort();
}

function auditFixtureReferenceFrame({ findings, fixtureBlock, fixturePath, template }) {
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    new RegExp(`\\bpreviewKind:\\s*'${escapeRegex(template)}'`),
    `Chart gallery fixture "${template}" must keep a template-specific previewKind`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\bquestion:\s*'[^']{12,}'/,
    `Chart gallery fixture "${template}" must keep an auditable business question`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\bclaim:\s*'[^']{12,}'/,
    `Chart gallery fixture "${template}" must keep a visible evidence claim`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\bmobilePolicy:\s*'[^']{12,}'/,
    `Chart gallery fixture "${template}" must keep a mobile reference policy`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\buseWhen:\s*'[^']{12,}'/,
    `Chart gallery fixture "${template}" must keep an auditable useWhen rule`,
  );
  requireIncludes(
    findings,
    fixturePath,
    fixtureBlock,
    'referenceFrame: {',
    `Chart gallery fixture "${template}" must include a visual referenceFrame`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    new RegExp(`\\bfixtureId:\\s*'${escapeRegex(template)}-reference'`),
    `Chart gallery fixture "${template}" must keep a stable referenceFrame fixtureId`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\bkind:\s*'(?:svg-frame|dom-frame)'/,
    `Chart gallery fixture "${template}" must declare a referenceFrame kind`,
  );
  requireRegex(
    findings,
    fixturePath,
    fixtureBlock,
    /\bframeSize:\s*'\d+x\d+'/,
    `Chart gallery fixture "${template}" must declare a referenceFrame frameSize`,
  );
  requireIncludes(
    findings,
    fixturePath,
    fixtureBlock,
    "palette: 'white-gray-blue'",
    `Chart gallery fixture "${template}" must preserve the AIOS white/gray/blue palette`,
  );

  for (const fieldName of ['layout', 'caption', 'cornerNote']) {
    requireRegex(
      findings,
      fixturePath,
      fixtureBlock,
      new RegExp(`\\b${fieldName}:\\s*'[^']{16,}'`),
      `Chart gallery fixture "${template}" must define referenceFrame.${fieldName}`,
    );
  }
  for (const fieldName of ['marks', 'labels']) {
    requireRegex(
      findings,
      fixturePath,
      fixtureBlock,
      new RegExp(`\\b${fieldName}:\\s*\\[[\\s\\S]*?'[^']{6,}'[\\s\\S]*?\\]`),
      `Chart gallery fixture "${template}" must define non-empty referenceFrame.${fieldName}`,
    );
  }
}

function requireIncludes(findings, filePath, source, needle, message) {
  if (!source.includes(needle)) {
    findings.push(`${message}: ${filePath} must include ${JSON.stringify(needle)}.`);
  }
}

function requireNotIncludes(findings, filePath, source, needle, message) {
  if (source.includes(needle)) {
    findings.push(`${message}: ${filePath} must not include ${JSON.stringify(needle)}.`);
  }
}

function requireRegex(findings, filePath, source, pattern, message) {
  if (!pattern.test(source)) {
    findings.push(`${message}: ${filePath} must match ${pattern}.`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
