export const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
export const DESIGN_CSS_PATH = 'apps/web-vite/src/styles/design-tokens.css';

const MAX_DIFFS_TO_PRINT = 80;

function toKebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function extractCssVariables(content) {
  return new Map(
    Array.from(content.matchAll(/^\s*(--[A-Za-z0-9-_]+)\s*:\s*([^;]+)\s*;/gm))
      .map((match) => [match[1], match[2].trim()]),
  );
}

function resolveReference(value) {
  if (typeof value !== 'string') {
    return String(value);
  }

  const referenceMatch = value.match(/^\{([\w.]+)\}$/);
  if (!referenceMatch) {
    return value;
  }

  return `var(--${referenceMatch[1].split('.').map(toKebab).join('-')})`;
}

function normalizeCssValue(value) {
  if (value === undefined) {
    return '<missing>';
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  return value.replace(/\s+/g, ' ').trim();
}

function pushExpected(expected, tokenPath, cssVarName, value) {
  expected.push({
    cssVarName,
    tokenPath,
    value: normalizeCssValue(resolveReference(value)),
  });
}

function collectExpectedRuntimeTokens(tokens) {
  const expected = [];

  for (const [key, value] of Object.entries(tokens.spacing ?? {})) {
    pushExpected(expected, `spacing.${key}`, `--spacing-${key}`, value);
  }

  for (const [key, value] of Object.entries(tokens.borderRadius ?? {})) {
    pushExpected(expected, `borderRadius.${key}`, `--border-radius-${key}`, value);
  }

  for (const [key, value] of Object.entries(tokens.shadow ?? {})) {
    pushExpected(expected, `shadow.${key}`, `--shadow-${key}`, value);
  }

  for (const [key, value] of Object.entries(tokens.transition ?? {})) {
    pushExpected(expected, `transition.${key}`, `--transition-${key}`, value);
  }

  for (const [key, value] of Object.entries(tokens.transitionDuration ?? {})) {
    pushExpected(expected, `transitionDuration.${key}`, `--transition-duration-${toKebab(key)}`, value);
  }

  for (const [key, value] of Object.entries(tokens.transitionEasing ?? {})) {
    pushExpected(expected, `transitionEasing.${key}`, `--transition-easing-${toKebab(key)}`, value);
  }

  for (const [key, value] of Object.entries(tokens.breakpoint ?? {})) {
    pushExpected(expected, `breakpoint.${key}`, `--breakpoint-${key}`, value);
  }

  const typography = tokens.typography ?? {};
  for (const [key, value] of Object.entries(typography.fontFamily ?? {})) {
    pushExpected(expected, `typography.fontFamily.${key}`, `--font-family-${toKebab(key)}`, value);
  }

  for (const [key, value] of Object.entries(typography.fontSize ?? {})) {
    pushExpected(expected, `typography.fontSize.${key}.value`, `--font-size-${toKebab(key)}`, value.value);
  }

  for (const [key, value] of Object.entries(typography.fontWeight ?? {})) {
    pushExpected(expected, `typography.fontWeight.${key}`, `--font-weight-${toKebab(key)}`, value);
  }

  for (const [key, value] of Object.entries(typography.lineHeight ?? {})) {
    pushExpected(expected, `typography.lineHeight.${key}`, `--line-height-${toKebab(key)}`, value);
  }

  for (const [key, value] of Object.entries(typography.letterSpacing ?? {})) {
    pushExpected(expected, `typography.letterSpacing.${key}`, `--letter-spacing-${toKebab(key)}`, value);
  }

  const component = tokens.component ?? {};
  for (const [key, value] of Object.entries(component.button?.height ?? {})) {
    pushExpected(expected, `component.button.height.${key}`, `--component-button-height-${toKebab(key)}`, value);
  }
  for (const [key, value] of Object.entries(component.button?.paddingX ?? {})) {
    pushExpected(expected, `component.button.paddingX.${key}`, `--component-button-padding-x-${toKebab(key)}`, value);
  }
  if (component.button?.borderRadius) {
    pushExpected(expected, 'component.button.borderRadius', '--component-button-border-radius', component.button.borderRadius);
  }

  if (component.input?.height) {
    pushExpected(expected, 'component.input.height', '--component-input-height', component.input.height);
  }
  if (component.input?.paddingX) {
    pushExpected(expected, 'component.input.paddingX', '--component-input-padding-x', component.input.paddingX);
  }
  if (component.input?.paddingY) {
    pushExpected(expected, 'component.input.paddingY', '--component-input-padding-y', component.input.paddingY);
  }
  if (component.input?.borderRadius) {
    pushExpected(expected, 'component.input.borderRadius', '--component-input-border-radius', component.input.borderRadius);
  }

  for (const [key, value] of Object.entries(component.control?.lineHeight ?? {})) {
    pushExpected(expected, `component.control.lineHeight.${key}`, `--component-control-line-height-${toKebab(key)}`, value);
  }

  if (component.card?.borderRadius) {
    pushExpected(expected, 'component.card.borderRadius', '--component-card-border-radius', component.card.borderRadius);
  }
  if (component.card?.padding) {
    pushExpected(expected, 'component.card.padding', '--component-card-padding', component.card.padding);
  }
  if (component.card?.shadow) {
    pushExpected(expected, 'component.card.shadow', '--component-card-shadow', component.card.shadow);
  }
  if (component.modal?.borderRadius) {
    pushExpected(expected, 'component.modal.borderRadius', '--component-modal-border-radius', component.modal.borderRadius);
  }
  if (component.modal?.shadow) {
    pushExpected(expected, 'component.modal.shadow', '--component-modal-shadow', component.modal.shadow);
  }

  const tableDetail = component.table?.detail;
  if (tableDetail?.header) {
    pushExpected(expected, 'component.table.detail.header.fontSize', '--component-table-detail-header-font-size', tableDetail.header.fontSize);
    pushExpected(expected, 'component.table.detail.header.fontWeight', '--component-table-detail-header-font-weight', tableDetail.header.fontWeight);
    pushExpected(expected, 'component.table.detail.header.lineHeight', '--component-table-detail-header-line-height', tableDetail.header.lineHeight);
    pushExpected(expected, 'component.table.detail.header.letterSpacing', '--component-table-detail-header-letter-spacing', tableDetail.header.letterSpacing);
  }
  if (tableDetail?.body) {
    pushExpected(expected, 'component.table.detail.body.fontSize', '--component-table-detail-body-font-size', tableDetail.body.fontSize);
    pushExpected(expected, 'component.table.detail.body.fontWeight', '--component-table-detail-body-font-weight', tableDetail.body.fontWeight);
    pushExpected(expected, 'component.table.detail.body.lineHeight', '--component-table-detail-body-line-height', tableDetail.body.lineHeight);
    pushExpected(expected, 'component.table.detail.body.letterSpacing', '--component-table-detail-body-letter-spacing', tableDetail.body.letterSpacing);
  }
  if (tableDetail?.link?.fontWeight) {
    pushExpected(expected, 'component.table.detail.link.fontWeight', '--component-table-detail-link-font-weight', tableDetail.link.fontWeight);
  }
  if (tableDetail?.numeric) {
    pushExpected(expected, 'component.table.detail.numeric.letterSpacing', '--component-table-detail-numeric-letter-spacing', tableDetail.numeric.letterSpacing);
  }

  return expected;
}

export function auditDesignRuntimeTokens({ cssSource, tokens }) {
  const cssVariables = extractCssVariables(cssSource);
  const expectedRuntimeTokens = collectExpectedRuntimeTokens(tokens);
  const diffs = [];

  for (const expectedToken of expectedRuntimeTokens) {
    const actualValue = normalizeCssValue(cssVariables.get(expectedToken.cssVarName));
    if (actualValue !== expectedToken.value) {
      diffs.push({
        ...expectedToken,
        actualValue: actualValue ?? '<missing>',
      });
    }
  }

  return {
    diffs,
    expectedRuntimeTokens,
  };
}

export function formatDesignRuntimeTokenFailure(diffs) {
  const lines = [
    `[design-runtime-token-sync] ${DESIGN_CSS_PATH} drifted from ${TOKEN_JSON_PATH}.`,
    '',
    'Runtime CSS variables must match DESIGN_TOKENS.json for non-color token families.',
    '',
  ];

  for (const diff of diffs.slice(0, MAX_DIFFS_TO_PRINT)) {
    lines.push(`${diff.tokenPath} -> ${diff.cssVarName}`);
    lines.push(`  JSON: ${diff.value}`);
    lines.push(`  CSS:  ${diff.actualValue}`);
    lines.push('');
  }
  if (diffs.length > MAX_DIFFS_TO_PRINT) {
    lines.push(`... ${diffs.length - MAX_DIFFS_TO_PRINT} more diff(s) omitted`);
  }

  return lines.join('\n');
}

export function summarizeDesignRuntimeTokens(expectedRuntimeTokens) {
  return `${expectedRuntimeTokens.length} non-color runtime token variables match ${TOKEN_JSON_PATH}.`;
}
