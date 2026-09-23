const PRODUCT_CSS_SNIPPETS = Object.freeze([
  '.tmallProductTrendVisual',
  '.tmallProductScaleMetricColumn',
  '.tmallProductRateMetricColumn',
  '.tmallProductMetricHeader',
  '.tmallProductMiniMomLine',
  '.tmallProductMiniHitArea',
  '.tmallProductAttributionVisual',
  '.tmallProductAttributionTable',
  '.tmallProductAttributionValue',
]);

const TRAFFIC_CSS_SNIPPETS = Object.freeze([
  '.tmallTrafficFlowVisual',
  '.tmallTrafficSourceRoleVisual',
  '.tmallTrafficProductSourceVisual',
  '.tmallTrafficDeltaVisual',
  '.tmallTrafficActionBoard',
]);

function requireIncludes(findings, filePath, source, snippet, message) {
  if (!source.includes(snippet)) findings.push(`${filePath}: ${message}`);
}

export function auditSpecialReportTmallCss({
  styleMapPath,
  styleMapSource,
  productCssPath,
  productCssSource,
  trafficCssPath,
  trafficCssSource,
}) {
  const findings = [];

  for (const modulePath of [
    'special-report-tmall-products.module.css',
    'special-report-tmall-traffic.module.css',
  ]) {
    requireIncludes(
      findings,
      styleMapPath,
      styleMapSource,
      modulePath,
      `Tmall CSS module ${modulePath} must stay wired into the special report style map`,
    );
  }
  for (const snippet of PRODUCT_CSS_SNIPPETS) {
    requireIncludes(
      findings,
      productCssPath,
      productCssSource,
      snippet,
      'Tmall product CSS must retain aligned table and mini-trend owners',
    );
  }
  for (const snippet of TRAFFIC_CSS_SNIPPETS) {
    requireIncludes(
      findings,
      trafficCssPath,
      trafficCssSource,
      snippet,
      'Tmall traffic CSS must retain each refined traffic visual owner',
    );
  }
  if (!/\.tmallProductMiniHitArea\s*\{[\s\S]*?fill:\s*transparent;[\s\S]*?pointer-events:\s*all;/.test(productCssSource)) {
    findings.push(`${productCssPath}: mini hit areas must stay transparent and receive pointer events`);
  }
  if (!/\.tmallProductMini(?:Mom|Line)Stroke\s*\{[\s\S]*?pointer-events:\s*none;/.test(productCssSource)) {
    findings.push(`${productCssPath}: decorative mini strokes must not intercept hover hit areas`);
  }
  for (const [snippet, message] of [
    [' * 0.', 'column widths must avoid unsupported calc multiplication'],
    ['overflow-y: auto', 'formal report figures must not require nested vertical scrolling'],
  ]) {
    if (productCssSource.includes(snippet)) findings.push(`${productCssPath}: ${message}`);
  }

  return findings;
}
