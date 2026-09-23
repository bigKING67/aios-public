/**
 * Verifies that Tailwind design-system color aliases stay token-backed.
 *
 * Tailwind is a consumption surface, not a raw token source. Color aliases must
 * point at runtime CSS variables from apps/web-vite/src/styles/design-tokens.css so utility
 * classes cannot quietly drift back to hardcoded legacy palette values.
 */

export const TAILWIND_CONFIG_PATH = 'tailwind.config.ts';
export const DESIGN_CSS_PATH = 'apps/web-vite/src/styles/design-tokens.css';
const COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g;
const COLOR_VALUE_PATTERN = /(?:(['"])([^'"\n]+)\1|([A-Za-z0-9_$-]+))\s*:\s*(['"])([^'"\n]*)\4/g;
const CSS_VAR_REF_PATTERN = /var\(\s*(--[A-Za-z0-9-_]+)/g;
const ALLOWED_COLOR_VALUES = new Set(['transparent', 'currentColor', 'inherit']);

export function stripCommentsPreserveLines(content) {
  let output = '';
  let index = 0;
  let quote = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 2;
        inBlockComment = false;
      } else {
        output += char === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 2;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    }

    output += char;
    index += 1;
  }

  return output;
}

export function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

export function findMatchingBrace(content, openBraceIndex, options = {}) {
  const { fail = (message) => { throw new Error(message); } } = options;
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

  fail(`${TAILWIND_CONFIG_PATH} has an unclosed colors object block.`);
}

export function extractTailwindColorsBlock(content, options = {}) {
  const { fail = (message) => { throw new Error(message); } } = options;
  const colorsMatch = content.match(/\bcolors\s*:/);
  if (!colorsMatch) {
    fail(`${TAILWIND_CONFIG_PATH} missing theme.extend.colors.`);
  }

  const openBraceIndex = content.indexOf('{', colorsMatch.index + colorsMatch[0].length);
  if (openBraceIndex < 0) {
    fail(`${TAILWIND_CONFIG_PATH} missing object block for theme.extend.colors.`);
  }

  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, { fail });
  return {
    content: content.slice(openBraceIndex + 1, closeBraceIndex),
    startIndex: openBraceIndex + 1,
  };
}

export function findTailwindRawColorLiterals(content) {
  const violations = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    COLOR_PATTERN.lastIndex = 0;
    for (const match of line.matchAll(COLOR_PATTERN)) {
      violations.push({
        lineNumber: index + 1,
        value: match[0],
        line: line.trim(),
      });
    }
  });

  return violations;
}

export function readDefinedCssVariables(designCssContent) {
  return new Set(
    Array.from(designCssContent.matchAll(/^\s*(--[A-Za-z0-9-_]+)\s*:/gm), (match) => match[1]),
  );
}

export function extractCssVarRefs(value) {
  CSS_VAR_REF_PATTERN.lastIndex = 0;
  return Array.from(value.matchAll(CSS_VAR_REF_PATTERN), (match) => match[1]);
}

export function isTokenBackedColorValue(value) {
  const normalized = value.trim();
  return ALLOWED_COLOR_VALUES.has(normalized) || /^var\(\s*--[A-Za-z0-9-_]+\s*(?:,[^)]+)?\)$/.test(normalized);
}

export function findTailwindColorAliasViolations(cleanedContent, definedCssVars, options = {}) {
  const colorsBlock = extractTailwindColorsBlock(cleanedContent, options);
  const violations = [];
  COLOR_VALUE_PATTERN.lastIndex = 0;

  for (const match of colorsBlock.content.matchAll(COLOR_VALUE_PATTERN)) {
    const key = match[2] ?? match[3];
    const value = match[5].trim();
    const absoluteIndex = colorsBlock.startIndex + match.index;
    const lineNumber = getLineNumber(cleanedContent, absoluteIndex);

    if (!isTokenBackedColorValue(value)) {
      violations.push({
        lineNumber,
        key,
        value,
        reason: 'color alias value must be a runtime CSS variable',
      });
      continue;
    }

    for (const cssVarName of extractCssVarRefs(value)) {
      if (!definedCssVars.has(cssVarName)) {
        violations.push({
          lineNumber,
          key,
          value,
          reason: `${cssVarName} is not defined in ${DESIGN_CSS_PATH}`,
        });
      }
    }
  }

  return violations;
}

export function auditTailwindTokenAliases(tailwindConfig, designCss, options = {}) {
  const cleanedConfig = stripCommentsPreserveLines(tailwindConfig);
  const definedCssVars = readDefinedCssVariables(designCss);

  return {
    aliasViolations: findTailwindColorAliasViolations(cleanedConfig, definedCssVars, options),
    rawColorViolations: findTailwindRawColorLiterals(cleanedConfig),
  };
}

export function hasTailwindTokenAliasViolations({ aliasViolations, rawColorViolations }) {
  return rawColorViolations.length > 0 || aliasViolations.length > 0;
}

export function formatTailwindTokenAliasFailure({
  aliasViolations,
  rawColorViolations,
}, options = {}) {
  const {
    designCssPath = DESIGN_CSS_PATH,
    tailwindConfigPath = TAILWIND_CONFIG_PATH,
  } = options;
  const lines = [`[tailwind-token-aliases] ${tailwindConfigPath} contains token alias violations.`, ''];

  if (rawColorViolations.length > 0) {
    lines.push('Raw color literals are forbidden in Tailwind config:');
    for (const violation of rawColorViolations) {
      lines.push(`${tailwindConfigPath}:${violation.lineNumber}: ${violation.value}`);
      lines.push(`  ${violation.line}`);
    }
    lines.push('');
  }

  if (aliasViolations.length > 0) {
    lines.push(`Color aliases must map to runtime CSS variables from ${designCssPath}:`);
    for (const violation of aliasViolations) {
      lines.push(`${tailwindConfigPath}:${violation.lineNumber}: ${violation.key} = ${JSON.stringify(violation.value)}`);
      lines.push(`  ${violation.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
