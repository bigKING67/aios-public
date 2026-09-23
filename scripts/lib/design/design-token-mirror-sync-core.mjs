export const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
export const TOKEN_TS_PATH = 'apps/web-vite/src/lib/design-tokens.ts';
export const MAX_DIFFS_TO_PRINT = 50;

export function parseTsMirrorSource(content, tokenTsPath = TOKEN_TS_PATH) {
  const match = content.match(/export\s+const\s+designTokens\s*=\s*([\s\S]*?)\s+as\s+const\s*;/m);
  if (!match) {
    throw new Error(`${tokenTsPath} missing "export const designTokens = ... as const".`);
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${tokenTsPath} designTokens object parse failed: ${error.message}`);
  }
}

export function formatPath(pathSegments) {
  return pathSegments.length > 0 ? pathSegments.join('.') : '<root>';
}

export function describeValue(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== 'object') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  return `{object:${Object.keys(value).length}}`;
}

export function getType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

export function compareValues(expected, actual, pathSegments = [], diffs = []) {
  const expectedType = getType(expected);
  const actualType = getType(actual);

  if (expectedType !== actualType) {
    diffs.push({
      path: formatPath(pathSegments),
      reason: `type mismatch: JSON=${expectedType}, TS=${actualType}`,
      expected,
      actual,
    });
    return diffs;
  }

  if (expectedType !== 'object' && expectedType !== 'array') {
    if (expected !== actual) {
      diffs.push({
        path: formatPath(pathSegments),
        reason: 'value mismatch',
        expected,
        actual,
      });
    }
    return diffs;
  }

  if (expectedType === 'array') {
    if (expected.length !== actual.length) {
      diffs.push({
        path: formatPath(pathSegments),
        reason: `array length mismatch: JSON=${expected.length}, TS=${actual.length}`,
        expected,
        actual,
      });
    }
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (!(index in expected)) {
        diffs.push({
          path: formatPath([...pathSegments, String(index)]),
          reason: 'extra array item in TS mirror',
          expected: undefined,
          actual: actual[index],
        });
      } else if (!(index in actual)) {
        diffs.push({
          path: formatPath([...pathSegments, String(index)]),
          reason: 'missing array item in TS mirror',
          expected: expected[index],
          actual: undefined,
        });
      } else {
        compareValues(expected[index], actual[index], [...pathSegments, String(index)], diffs);
      }
    }
    return diffs;
  }

  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  const expectedKeySet = new Set(expectedKeys);
  const actualKeySet = new Set(actualKeys);

  for (const key of expectedKeys) {
    if (!actualKeySet.has(key)) {
      diffs.push({
        path: formatPath([...pathSegments, key]),
        reason: 'missing key in TS mirror',
        expected: expected[key],
        actual: undefined,
      });
      continue;
    }
    compareValues(expected[key], actual[key], [...pathSegments, key], diffs);
  }

  for (const key of actualKeys) {
    if (!expectedKeySet.has(key)) {
      diffs.push({
        path: formatPath([...pathSegments, key]),
        reason: 'extra key in TS mirror',
        expected: undefined,
        actual: actual[key],
      });
    }
  }

  return diffs;
}

export function countLeafValues(value) {
  const type = getType(value);
  if (type !== 'object' && type !== 'array') {
    return 1;
  }
  if (type === 'array') {
    return value.reduce((count, item) => count + countLeafValues(item), 0);
  }
  return Object.values(value).reduce((count, item) => count + countLeafValues(item), 0);
}

export function formatDesignTokenMirrorFailure({
  diffs,
  tokenJsonPath = TOKEN_JSON_PATH,
  tokenTsPath = TOKEN_TS_PATH,
  maxDiffsToPrint = MAX_DIFFS_TO_PRINT,
}) {
  const lines = [
    `[design-token-mirror-sync] ${tokenTsPath} is not synchronized with ${tokenJsonPath}.`,
    '',
  ];

  for (const diff of diffs.slice(0, maxDiffsToPrint)) {
    lines.push(
      diff.path,
      `  ${diff.reason}`,
      `  JSON: ${describeValue(diff.expected)}`,
      `  TS:   ${describeValue(diff.actual)}`,
      '',
    );
  }

  if (diffs.length > maxDiffsToPrint) {
    lines.push(`... ${diffs.length - maxDiffsToPrint} more diff(s) omitted.`);
  }

  return lines.join('\n');
}

export function auditDesignTokenMirrorSync({ jsonTokens, tsTokens }) {
  return {
    diffs: compareValues(jsonTokens, tsTokens),
    leafCount: countLeafValues(jsonTokens),
  };
}
