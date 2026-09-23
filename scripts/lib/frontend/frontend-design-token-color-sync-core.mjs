/**
 * Checks high-risk color token mirrors for drift.
 *
 * Scope is intentionally narrow: high-risk semantic colors are repeated across
 * JSON, TS mirrors, CSS runtime tokens, and source helper files.
 * A mismatch here creates visible UI/chart drift.
 */

import {
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../shared/guard-utils.mjs';

const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
const TOKEN_TS_PATH = 'apps/web-vite/src/lib/design-tokens.ts';
const DESIGN_CSS_PATH = 'apps/web-vite/src/styles/design-tokens.css';
const PLATFORM_SOURCE_PATH = 'apps/web-vite/src/lib/platform-colors.ts';
const DOMAIN_SOURCE_PATH = 'apps/web-vite/src/lib/domain-taxonomy-colors.ts';
const SYNC_CONFIG_PATH = 'scripts/config/design/token-color-sync.config.json';

function fail(message) {
  throw new Error(message);
}

function normalizeColor(color, label) {
  if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
    fail(`${label} is not a hex color: ${String(color)}`);
  }
  return color.toUpperCase();
}

function readDesignTokensJson(repoRoot) {
  return readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
}

function readSyncConfig(repoRoot) {
  const config = readRequiredJsonFile(repoRoot, SYNC_CONFIG_PATH, fail);
  validateSyncConfig(config);
  return {
    ...config,
    domainTokenSpecs: expandDomainSpecs(config.domainTokenGroups),
  };
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${SYNC_CONFIG_PATH} ${label} must be a non-empty string array.`);
  }
}

function validateSyncConfig(config) {
  validateStringArray(config.statusKeys, 'statusKeys');
  validateStringArray(config.trendKeys, 'trendKeys');
  validateStringArray(config.platformKeys, 'platformKeys');
  validateStringArray(config.chartKeys, 'chartKeys');

  if (!config.chartCssVarByKey || typeof config.chartCssVarByKey !== 'object') {
    fail(`${SYNC_CONFIG_PATH} chartCssVarByKey must be an object.`);
  }
  for (const key of config.chartKeys) {
    if (typeof config.chartCssVarByKey[key] !== 'string' || !config.chartCssVarByKey[key].startsWith('--')) {
      fail(`${SYNC_CONFIG_PATH} chartCssVarByKey.${key} must be a CSS variable name.`);
    }
  }

  if (!Array.isArray(config.domainTokenGroups) || config.domainTokenGroups.length === 0) {
    fail(`${SYNC_CONFIG_PATH} domainTokenGroups must be a non-empty array.`);
  }
  for (const [index, groupSpec] of config.domainTokenGroups.entries()) {
    if (!groupSpec || typeof groupSpec.group !== 'string' || groupSpec.group.length === 0) {
      fail(`${SYNC_CONFIG_PATH} domainTokenGroups[${index}].group must be a non-empty string.`);
    }
    validateStringArray(groupSpec.keys, `domainTokenGroups[${index}].keys`);
    validateStringArray(groupSpec.props, `domainTokenGroups[${index}].props`);
  }
}

function readDesignTokensTsObject(content) {
  const match = content.match(/export\s+const\s+designTokens\s*=\s*([\s\S]*?)\s+as\s+const\s*;/m);
  if (!match) {
    fail(`${TOKEN_TS_PATH} missing designTokens object.`);
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`${TOKEN_TS_PATH} designTokens object parse failed: ${error.message}`);
  }
}

function expandDomainSpecs(groupSpecs) {
  return groupSpecs.flatMap(({ group, keys, props }) => (
    keys.flatMap((key) => props.map((prop) => ({ group, key, prop })))
  ));
}

function toKebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function getNestedValue(source, pathSegments, label) {
  let current = source;
  for (const segment of pathSegments) {
    current = current?.[segment];
  }
  if (current === undefined) {
    fail(`${label} missing ${pathSegments.join('.')}.`);
  }
  return current;
}

function extractTokenTsValue(content, group, key) {
  const valuePattern = new RegExp(`"${key}"\\s*:\\s*{\\s*"value"\\s*:\\s*"(#[0-9A-Fa-f]{3,8})"`, 'm');
  const valueMatch = content.match(valuePattern);
  if (!valueMatch) {
    fail(`${TOKEN_TS_PATH} missing color.${group}.${key}.value.`);
  }
  return valueMatch[1];
}

function extractCssVariableRawOptional(content, cssVarName) {
  const escapedName = cssVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`${escapedName}\\s*:\\s*([^;]+)\\s*;`));
  return match?.[1]?.trim();
}

function findCssVariableSource(content, cssVarName, filePath, fallbackSources = []) {
  const rawValue = extractCssVariableRawOptional(content, cssVarName);
  if (rawValue !== undefined) {
    return { filePath, rawValue };
  }

  for (const source of fallbackSources) {
    const fallbackValue = extractCssVariableRawOptional(source.content, cssVarName);
    if (fallbackValue !== undefined) {
      return { filePath: source.filePath, rawValue: fallbackValue };
    }
  }

  const fallbackPaths = fallbackSources.map((source) => source.filePath).join(', ');
  const scope = fallbackPaths ? `${filePath} or fallback source(s): ${fallbackPaths}` : filePath;
  fail(`${scope} missing ${cssVarName}.`);
}

function extractCssVariable(content, cssVarName, filePath, seen = new Set(), fallbackSources = []) {
  const source = findCssVariableSource(content, cssVarName, filePath, fallbackSources);
  const seenKey = `${source.filePath}:${cssVarName}`;
  if (seen.has(seenKey)) {
    fail(`${source.filePath} contains a circular CSS variable reference at ${cssVarName}.`);
  }
  seen.add(seenKey);

  const aliasMatch = source.rawValue.match(/^var\((--[a-zA-Z0-9-_]+)\)$/);
  if (aliasMatch) {
    return extractCssVariable(content, aliasMatch[1], filePath, seen, fallbackSources);
  }
  return source.rawValue;
}

function extractObjectLiteralValue(content, objectName, key, filePath) {
  const objectPattern = new RegExp(`export\\s+const\\s+${objectName}\\s*=\\s*{([\\s\\S]*?)}\\s+as\\s+const`, 'm');
  const objectMatch = content.match(objectPattern);
  if (!objectMatch) {
    fail(`${filePath} missing ${objectName}.`);
  }

  const valuePattern = new RegExp(`\\b${key}\\s*:\\s*['"](#[0-9A-Fa-f]{3,8})['"]`);
  const valueMatch = objectMatch[1].match(valuePattern);
  if (!valueMatch) {
    fail(`${filePath} missing ${objectName}.${key}.`);
  }
  return valueMatch[1];
}

function findMatchingBrace(content, openBraceIndex, filePath) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  fail(`${filePath} has an unclosed object block.`);
}

function extractNamedObjectBlock(content, name, filePath) {
  const nameMatch = content.match(new RegExp(`\\b${name}\\b\\s*:`));
  if (!nameMatch) {
    fail(`${filePath} missing object key ${name}.`);
  }
  const openBraceIndex = content.indexOf('{', nameMatch.index + nameMatch[0].length);
  if (openBraceIndex < 0) {
    fail(`${filePath} missing object block for ${name}.`);
  }
  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, filePath);
  return content.slice(openBraceIndex + 1, closeBraceIndex);
}

function extractConstObjectBlock(content, constName, filePath) {
  const constMatch = content.match(new RegExp(`export\\s+const\\s+${constName}\\s*=`));
  if (!constMatch) {
    fail(`${filePath} missing ${constName}.`);
  }
  const openBraceIndex = content.indexOf('{', constMatch.index + constMatch[0].length);
  if (openBraceIndex < 0) {
    fail(`${filePath} missing object block for ${constName}.`);
  }
  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, filePath);
  return content.slice(openBraceIndex + 1, closeBraceIndex);
}

function extractDomainSourceValue(content, group, key, prop) {
  const rootBlock = extractConstObjectBlock(content, 'DOMAIN_TAXONOMY_COLORS', DOMAIN_SOURCE_PATH);
  const groupBlock = extractNamedObjectBlock(rootBlock, group, DOMAIN_SOURCE_PATH);
  const keyBlock = extractNamedObjectBlock(groupBlock, key, DOMAIN_SOURCE_PATH);
  const valuePattern = new RegExp(`\\b${prop}\\s*:\\s*['"](#[0-9A-Fa-f]{3,8})['"]`);
  const valueMatch = keyBlock.match(valuePattern);
  if (!valueMatch) {
    fail(`${DOMAIN_SOURCE_PATH} missing DOMAIN_TAXONOMY_COLORS.${group}.${key}.${prop}.`);
  }
  return valueMatch[1];
}

function collectPlatformSources(key, files) {
  return {
    [`${TOKEN_JSON_PATH}:color.platform.${key}`]: files.tokensJson.color.platform[key]?.value,
    [`${TOKEN_TS_PATH}:color.platform.${key}`]: extractTokenTsValue(files.tokenTs, 'platform', key),
    [`${DESIGN_CSS_PATH}:--platform-${key}`]: extractCssVariable(files.designCss, `--platform-${key}`, DESIGN_CSS_PATH),
    [`${PLATFORM_SOURCE_PATH}:PLATFORM_LEGEND_COLORS.${key}`]: extractObjectLiteralValue(
      files.platformSource,
      'PLATFORM_LEGEND_COLORS',
      key,
      PLATFORM_SOURCE_PATH,
    ),
  };
}

function collectStatusSources(key, files) {
  const kebabKey = toKebab(key);
  return {
    [`${TOKEN_JSON_PATH}:color.status.${key}`]: files.tokensJson.color.status[key]?.value,
    [`${TOKEN_TS_PATH}:color.status.${key}`]: files.tokensTs.color.status[key]?.value,
    [`${DESIGN_CSS_PATH}:--status-${kebabKey}`]: extractCssVariable(files.designCss, `--status-${kebabKey}`, DESIGN_CSS_PATH),
  };
}

function collectTrendSources(key, files) {
  const kebabKey = toKebab(key);
  return {
    [`${TOKEN_JSON_PATH}:color.trend.${key}`]: files.tokensJson.color.trend[key]?.value,
    [`${TOKEN_TS_PATH}:color.trend.${key}`]: files.tokensTs.color.trend[key]?.value,
    [`${DESIGN_CSS_PATH}:--trend-${kebabKey}`]: extractCssVariable(files.designCss, `--trend-${kebabKey}`, DESIGN_CSS_PATH),
  };
}

function collectChartSources(key, files, config) {
  const cssVarName = config.chartCssVarByKey[key];
  if (!cssVarName) {
    fail(`${SYNC_CONFIG_PATH} missing chartCssVarByKey.${key}.`);
  }
  return {
    [`${TOKEN_JSON_PATH}:color.chart.${key}`]: files.tokensJson.color.chart[key]?.value,
    [`${TOKEN_TS_PATH}:color.chart.${key}`]: extractTokenTsValue(files.tokenTs, 'chart', key),
    [`${DESIGN_CSS_PATH}:${cssVarName}`]: extractCssVariable(files.designCss, cssVarName, DESIGN_CSS_PATH),
    [`${DOMAIN_SOURCE_PATH}:CHART_SERIES_COLORS.${key}`]: extractObjectLiteralValue(
      files.domainSource,
      'CHART_SERIES_COLORS',
      key,
      DOMAIN_SOURCE_PATH,
    ),
  };
}

function collectDomainSources(spec, files) {
  const { group, key, prop } = spec;
  const cssVarName = `--domain-${toKebab(group)}-${toKebab(key)}-${toKebab(prop)}`;
  return {
    [`${TOKEN_JSON_PATH}:color.domainTaxonomy.${group}.${key}.${prop}`]: getNestedValue(
      files.tokensJson.color.domainTaxonomy,
      [group, key, prop],
      TOKEN_JSON_PATH,
    ),
    [`${TOKEN_TS_PATH}:color.domainTaxonomy.${group}.${key}.${prop}`]: getNestedValue(
      files.tokensTs.color.domainTaxonomy,
      [group, key, prop],
      TOKEN_TS_PATH,
    ),
    [`${DESIGN_CSS_PATH}:${cssVarName}`]: extractCssVariable(files.designCss, cssVarName, DESIGN_CSS_PATH),
    [`${DOMAIN_SOURCE_PATH}:DOMAIN_TAXONOMY_COLORS.${group}.${key}.${prop}`]: extractDomainSourceValue(
      files.domainSource,
      group,
      key,
      prop,
    ),
  };
}

function verifyTokenFamily(familyName, key, sources) {
  const entries = Object.entries(sources).map(([source, color]) => [
    source,
    normalizeColor(color, `${familyName}.${key} ${source}`),
  ]);

  const uniqueValues = Array.from(new Set(entries.map(([, color]) => color)));
  if (uniqueValues.length <= 1) {
    return [];
  }

  return [
    {
      familyName,
      key,
      entries,
    },
  ];
}

function formatViolations(violations) {
  const lines = ['[design-token-color-sync] Token color drift detected.', ''];
  for (const violation of violations) {
    lines.push(`${violation.familyName}.${violation.key}`);
    for (const [source, color] of violation.entries) {
      lines.push(`  ${color}  ${source}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function checkDesignTokenColorSync(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const config = readSyncConfig(repoRoot);
  const files = {
    tokensJson: readDesignTokensJson(repoRoot),
    tokenTs: readRequiredFile(repoRoot, TOKEN_TS_PATH, fail),
    designCss: readRequiredFile(repoRoot, DESIGN_CSS_PATH, fail),
    platformSource: readRequiredFile(repoRoot, PLATFORM_SOURCE_PATH, fail),
    domainSource: readRequiredFile(repoRoot, DOMAIN_SOURCE_PATH, fail),
  };
  files.tokensTs = readDesignTokensTsObject(files.tokenTs);

  const violations = [];

  for (const key of config.statusKeys) {
    violations.push(...verifyTokenFamily('status', key, collectStatusSources(key, files)));
  }

  for (const key of config.trendKeys) {
    violations.push(...verifyTokenFamily('trend', key, collectTrendSources(key, files)));
  }

  for (const key of config.platformKeys) {
    violations.push(...verifyTokenFamily('platform', key, collectPlatformSources(key, files)));
  }

  for (const key of config.chartKeys) {
    violations.push(...verifyTokenFamily('chart', key, collectChartSources(key, files, config)));
  }

  for (const spec of config.domainTokenSpecs) {
    violations.push(
      ...verifyTokenFamily(
        `domainTaxonomy.${spec.group}`,
        `${spec.key}.${spec.prop}`,
        collectDomainSources(spec, files),
      ),
    );
  }

  if (violations.length > 0) {
    return {
      message: '',
      status: 1,
      stderr: formatViolations(violations),
    };
  }

  return {
    message: `${config.statusKeys.length} status colors, ${config.trendKeys.length} trend colors, `
      + `${config.platformKeys.length} platform colors, ${config.chartKeys.length} chart series colors, `
      + `and ${config.domainTokenSpecs.length} domain taxonomy colors are synchronized.`,
    status: 0,
    stderr: '',
  };
}
