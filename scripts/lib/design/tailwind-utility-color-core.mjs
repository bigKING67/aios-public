const UTILITY_PREFIXES = [
  'text',
  'bg',
  'border',
  'ring',
  'outline',
  'decoration',
  'placeholder',
  'divide',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'caret',
  'accent',
];
const ARBITRARY_RAW_UTILITY_PREFIXES = [...UTILITY_PREFIXES, 'shadow'];
const DEFAULT_PALETTES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];
const DEFAULT_UTILITY_PATTERN = new RegExp(
  String.raw`\b(?:${UTILITY_PREFIXES.join('|')})-(?:${DEFAULT_PALETTES.join('|')})-[0-9]{2,3}(?:\/[0-9]{1,3})?\b` +
    String.raw`|\b(?:${UTILITY_PREFIXES.join('|')})-(?:white|black)(?:\/[0-9]{1,3})?\b`,
  'g',
);
const ARBITRARY_RAW_UTILITY_PATTERN = new RegExp(
  String.raw`\b(?:${ARBITRARY_RAW_UTILITY_PREFIXES.join('|')})-\[` +
    String.raw`[^\]]*(?:#[0-9A-Fa-f]{3,8}|(?:rgb|hsl)a?\([^)]*\))[^\]]*` +
    String.raw`\]`,
  'g',
);
const LEGACY_SEMANTIC_UTILITIES = [
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'text-success',
  'text-danger',
  'text-warning',
  'text-error',
  'text-info',
  'bg-bg-secondary',
];
const LEGACY_COMPATIBILITY_COLORS = [
  String.raw`primary-(?:50|100|200|300|400|500|600|700|800|900)`,
  String.raw`success-(?:50|500|600)`,
  String.raw`warning-(?:50|200|500|600|700)`,
  String.raw`error-(?:50|500|600)`,
  'info',
];
const LEGACY_SEMANTIC_UTILITY_PATTERN = new RegExp(
  String.raw`(?<![-.\w])(?:[a-z0-9-]+:)*(?:${LEGACY_SEMANTIC_UTILITIES.join('|')})\b`,
  'g',
);
const LEGACY_GLOBAL_UTILITY_DEFINITION_PATTERN = new RegExp(
  String.raw`(?<![-\w])\.(?:${LEGACY_SEMANTIC_UTILITIES.join('|')})\b`,
  'g',
);
const LEGACY_COMPATIBILITY_UTILITY_PATTERN = new RegExp(
  String.raw`(?<![-.\w])(?:[a-z0-9-]+:)*(?:${UTILITY_PREFIXES.join('|')})-(?:${LEGACY_COMPATIBILITY_COLORS.join('|')})\b`,
  'g',
);
const DEFAULT_UTILITY_EXACT_PATTERN = new RegExp(
  String.raw`^(?:${UTILITY_PREFIXES.join('|')})-(?:${DEFAULT_PALETTES.join('|')})-[0-9]{2,3}(?:\/[0-9]{1,3})?$` +
    String.raw`|^(?:${UTILITY_PREFIXES.join('|')})-(?:white|black)(?:\/[0-9]{1,3})?$`,
);
const COMMON_BARE_CLASS_TOKENS = new Set([
  'absolute',
  'block',
  'contents',
  'fixed',
  'flex',
  'grid',
  'hidden',
  'inline',
  'relative',
  'rounded',
  'shadow',
  'sr-only',
  'sticky',
  'truncate',
  'underline',
]);

export function isSupportedTailwindUtilityAllowlistKey(utility) {
  return DEFAULT_UTILITY_EXACT_PATTERN.test(utility);
}

export function stripTailwindUtilityComments(line, state) {
  let result = '';
  let index = 0;

  while (index < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', index);
      if (end === -1) {
        return result;
      }
      state.inBlockComment = false;
      index = end + 2;
      continue;
    }

    const blockStart = line.indexOf('/*', index);
    const lineStart = line.indexOf('//', index);
    const hasLineComment = lineStart !== -1;
    const hasBlockComment = blockStart !== -1;

    if (!hasLineComment && !hasBlockComment) {
      result += line.slice(index);
      return result;
    }

    if (hasLineComment && (!hasBlockComment || lineStart < blockStart)) {
      result += line.slice(index, lineStart);
      return result;
    }

    result += line.slice(index, blockStart);
    const blockEnd = line.indexOf('*/', blockStart + 2);
    if (blockEnd === -1) {
      state.inBlockComment = true;
      return result;
    }

    index = blockEnd + 2;
  }

  return result;
}

export function extractMultilineTemplateSurfaces(line, state) {
  const surfaces = [];
  let workingLine = line;

  if (state.inClassTemplate) {
    const end = workingLine.indexOf('`');
    const templatePart = end === -1 ? workingLine : workingLine.slice(0, end);
    if (templatePart.trim()) {
      surfaces.push(templatePart);
    }
    if (end === -1) {
      return { line: '', surfaces };
    }
    state.inClassTemplate = false;
    workingLine = workingLine.slice(end + 1);
  }

  const classTemplateStart = workingLine.search(/\bclassName\s*=\s*\{\s*`/);
  if (classTemplateStart === -1) {
    return { line: workingLine, surfaces };
  }

  const templateStart = workingLine.indexOf('`', classTemplateStart);
  const beforeTemplate = workingLine.slice(0, templateStart);
  const afterTemplateStart = workingLine.slice(templateStart + 1);
  const templateEnd = afterTemplateStart.indexOf('`');

  if (templateEnd === -1) {
    if (afterTemplateStart.trim()) {
      surfaces.push(afterTemplateStart);
    }
    state.inClassTemplate = true;
    return { line: beforeTemplate, surfaces };
  }

  const templateBody = afterTemplateStart.slice(0, templateEnd);
  if (templateBody.trim()) {
    surfaces.push(templateBody);
  }

  return {
    line: `${beforeTemplate} ${afterTemplateStart.slice(templateEnd + 1)}`,
    surfaces,
  };
}

export function skipQuotedString(line, index) {
  const quote = line[index];
  let cursor = index + 1;

  while (cursor < line.length) {
    if (line[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (line[cursor] === quote) {
      return cursor + 1;
    }
    cursor += 1;
  }

  return line.length;
}

export function extractStringLiterals(line) {
  const literals = [];
  let cursor = 0;

  while (cursor < line.length) {
    const char = line[cursor];
    if (char !== '"' && char !== "'" && char !== '`') {
      cursor += 1;
      continue;
    }

    const end = skipQuotedString(line, cursor);
    literals.push(line.slice(cursor + 1, end - 1));
    cursor = end;
  }

  return literals;
}

export function stripVariantPrefixes(token) {
  const parts = token.split(':');
  return parts[parts.length - 1] ?? token;
}

export function isUtilityLikeToken(token) {
  const normalized = stripVariantPrefixes(token.trim().replace(/^!/, ''));
  if (!normalized) {
    return false;
  }
  return (
    COMMON_BARE_CLASS_TOKENS.has(normalized) ||
    normalized.includes('-') ||
    normalized.includes('[') ||
    normalized.includes('/')
  );
}

export function isClassLikeLiteral(literal) {
  const tokens = literal.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }
  return tokens.every(isUtilityLikeToken);
}

export function isClassContextLine(line) {
  return /\b(?:class|className|classNames|classes|clsx|cn|cva|twMerge)\b/.test(line);
}

export function classLiteralSurfaces(line, file) {
  if (file.endsWith('.css')) {
    const cssSurface = line.replace(/content\s*:\s*(['"`]).*?\1\s*;?/g, '');
    const selectorSurface = cssSurface.includes('{')
      ? Array.from(cssSurface.matchAll(LEGACY_GLOBAL_UTILITY_DEFINITION_PATTERN), (match) => match[0]).join(' ')
      : '';
    return [selectorSurface, ...extractStringLiterals(cssSurface).filter(isClassLikeLiteral)];
  }

  const surfaces = [];
  const stringLiterals = extractStringLiterals(line);
  const hasClassContext = isClassContextLine(line);

  for (const literal of stringLiterals) {
    if (hasClassContext || isClassLikeLiteral(literal)) {
      surfaces.push(literal);
    }
  }

  return surfaces;
}

export function findTailwindColorUtilities(line) {
  DEFAULT_UTILITY_PATTERN.lastIndex = 0;
  ARBITRARY_RAW_UTILITY_PATTERN.lastIndex = 0;
  LEGACY_SEMANTIC_UTILITY_PATTERN.lastIndex = 0;
  LEGACY_GLOBAL_UTILITY_DEFINITION_PATTERN.lastIndex = 0;
  LEGACY_COMPATIBILITY_UTILITY_PATTERN.lastIndex = 0;

  return [
    ...Array.from(line.matchAll(DEFAULT_UTILITY_PATTERN), (match) => match[0]),
    ...Array.from(line.matchAll(ARBITRARY_RAW_UTILITY_PATTERN), (match) => match[0]),
    ...Array.from(line.matchAll(LEGACY_SEMANTIC_UTILITY_PATTERN), (match) => match[0]),
    ...Array.from(line.matchAll(LEGACY_GLOBAL_UTILITY_DEFINITION_PATTERN), (match) => match[0]),
    ...Array.from(line.matchAll(LEGACY_COMPATIBILITY_UTILITY_PATTERN), (match) => match[0]),
  ];
}

export function countTailwindColorUtilitiesInLines(file, lines) {
  const commentState = { inBlockComment: false, inClassTemplate: false };
  const counts = new Map();

  lines.forEach((line) => {
    const cleanedLine = stripTailwindUtilityComments(line, commentState);
    const { line: singleLineSurface, surfaces: multilineSurfaces } = extractMultilineTemplateSurfaces(
      cleanedLine,
      commentState,
    );
    for (const surface of [...classLiteralSurfaces(singleLineSurface, file), ...multilineSurfaces]) {
      for (const utility of findTailwindColorUtilities(surface)) {
        counts.set(utility, (counts.get(utility) ?? 0) + 1);
      }
    }
  });

  return counts;
}

export function countTailwindColorUtilitiesInSource(file, source) {
  return countTailwindColorUtilitiesInLines(file, source.split('\n'));
}

export function countTailwindColorUtilitiesInFiles(files) {
  const actual = new Map();
  for (const [file, source] of files) {
    const counts = countTailwindColorUtilitiesInSource(file, source);
    if (counts.size > 0) {
      actual.set(file, counts);
    }
  }
  return actual;
}

export function compareTailwindUtilityCounts(actual, allowed) {
  const violations = [];

  for (const [file, actualCounts] of actual) {
    const allowedCounts = allowed.get(file);
    if (!allowedCounts) {
      for (const [utility, count] of actualCounts) {
        violations.push({
          type: 'new',
          file,
          utility,
          actual: count,
          allowed: 0,
        });
      }
      continue;
    }

    for (const [utility, count] of actualCounts) {
      const allowedCount = allowedCounts.get(utility) ?? 0;
      if (count > allowedCount) {
        violations.push({
          type: 'increased',
          file,
          utility,
          actual: count,
          allowed: allowedCount,
        });
      }
    }
  }

  for (const [file, allowedCounts] of allowed) {
    const actualCounts = actual.get(file);
    if (!actualCounts) {
      for (const [utility, allowedCount] of allowedCounts) {
        violations.push({
          type: 'stale',
          file,
          utility,
          actual: 0,
          allowed: allowedCount,
        });
      }
      continue;
    }

    for (const [utility, allowedCount] of allowedCounts) {
      const actualCount = actualCounts.get(utility) ?? 0;
      if (actualCount < allowedCount) {
        violations.push({
          type: 'stale',
          file,
          utility,
          actual: actualCount,
          allowed: allowedCount,
        });
      }
    }
  }

  return violations.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    return left.utility.localeCompare(right.utility);
  });
}

export function countTailwindUtilityOccurrences(countMap) {
  return Array.from(countMap.values()).reduce((total, counts) => {
    return total + Array.from(counts.values()).reduce((subtotal, count) => subtotal + count, 0);
  }, 0);
}
