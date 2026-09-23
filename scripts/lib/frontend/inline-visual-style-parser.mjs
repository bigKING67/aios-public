import {
  createLineStartOffsets,
  lineNumberForOffset,
  readRepoFile,
} from '../shared/guard-utils.mjs';

const VISUAL_STYLE_PROPERTY_PATTERN =
  /(?:^|[,{]\s*)(color|background|backgroundColor|borderColor|boxShadow|fontSize|fontWeight|lineHeight|letterSpacing)\s*:/m;

function skipQuotedString(text, index) {
  const quote = text[index];
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (text[cursor] === quote) {
      return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}

function readBalancedExpression(text, openBraceIndex) {
  let depth = 0;
  let cursor = openBraceIndex;

  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '"' || char === "'" || char === '`') {
      cursor = skipQuotedString(text, cursor);
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          expression: text.slice(openBraceIndex + 1, cursor),
          endIndex: cursor,
        };
      }
    }

    cursor += 1;
  }

  return null;
}

function skipLineComment(text, index) {
  const lineEnd = text.indexOf('\n', index + 2);
  return lineEnd === -1 ? text.length : lineEnd + 1;
}

function skipBlockComment(text, index) {
  const blockEnd = text.indexOf('*/', index + 2);
  return blockEnd === -1 ? text.length : blockEnd + 2;
}

function findNextCodeToken(text, token, startIndex) {
  let cursor = startIndex;

  while (cursor < text.length) {
    const char = text[cursor];
    const next = text[cursor + 1];

    if (char === '/' && next === '/') {
      cursor = skipLineComment(text, cursor);
      continue;
    }
    if (char === '/' && next === '*') {
      cursor = skipBlockComment(text, cursor);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      cursor = skipQuotedString(text, cursor);
      continue;
    }
    if (
      text.startsWith(token, cursor) &&
      !/[A-Za-z0-9_$]/.test(text[cursor - 1] ?? '') &&
      !/[A-Za-z0-9_$]/.test(text[cursor + token.length] ?? '')
    ) {
      return cursor;
    }

    cursor += 1;
  }

  return -1;
}

function findStyleExpressionOpenBrace(text, styleIndex) {
  let cursor = styleIndex + 'style'.length;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  if (text[cursor] !== '=') {
    return null;
  }
  cursor += 1;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return text[cursor] === '{' ? cursor : null;
}

export function auditInlineVisualStyleFile(repoRoot, file) {
  const text = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(text);
  const findings = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const styleIndex = findNextCodeToken(text, 'style', searchIndex);
    if (styleIndex === -1) {
      break;
    }

    const openBraceIndex = findStyleExpressionOpenBrace(text, styleIndex);
    if (openBraceIndex === null) {
      searchIndex = styleIndex + 'style'.length;
      continue;
    }

    const balanced = readBalancedExpression(text, openBraceIndex);
    if (!balanced) {
      searchIndex = openBraceIndex + 1;
      continue;
    }

    if (!VISUAL_STYLE_PROPERTY_PATTERN.test(balanced.expression)) {
      searchIndex = balanced.endIndex + 1;
      continue;
    }

    const lineNumber = lineNumberForOffset(lineStartOffsets, styleIndex);
    const lineEnd = text.indexOf('\n', styleIndex);
    findings.push({
      file,
      lineNumber,
      line: text.slice(styleIndex, lineEnd === -1 ? text.length : lineEnd).trim(),
    });

    searchIndex = balanced.endIndex + 1;
  }

  return findings;
}
