const COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g;
const CUSTOM_PROPERTY_PATTERN = /^\s*(--[\w-]+)\s*:/;
const MATERIAL_CUSTOM_PROPERTY_PATTERN = /^--(?:[\w-]+-)?material(?:-[\w-]+)+$/;

function isMaterialAlias(propertyName) {
  return MATERIAL_CUSTOM_PROPERTY_PATTERN.test(propertyName);
}

function stripCssComments(line, state) {
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

    const start = line.indexOf('/*', index);
    if (start === -1) {
      result += line.slice(index);
      return result;
    }

    result += line.slice(index, start);
    const end = line.indexOf('*/', start + 2);
    if (end === -1) {
      state.inBlockComment = true;
      return result;
    }
    index = end + 2;
  }

  return result;
}

function skipCssString(line, index) {
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

function startsUrlFunction(line, index) {
  return (
    line.slice(index, index + 4).toLowerCase() === 'url(' &&
    !/[A-Za-z0-9_-]/.test(line[index - 1] ?? '')
  );
}

function skipCssFunction(line, index) {
  let cursor = index;
  let depth = 0;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '"' || char === "'") {
      cursor = skipCssString(line, cursor);
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth <= 0) {
        return cursor + 1;
      }
    }

    cursor += 1;
  }

  return line.length;
}

function stripCssStringsAndUrls(line) {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '"' || char === "'") {
      cursor = skipCssString(line, cursor);
      continue;
    }
    if (startsUrlFunction(line, cursor)) {
      cursor = skipCssFunction(line, cursor);
      continue;
    }

    result += char;
    cursor += 1;
  }

  return result;
}

function hasRawColor(value) {
  COLOR_PATTERN.lastIndex = 0;
  return COLOR_PATTERN.test(value);
}

export function auditCssModuleRawColorLines(file, lines) {
  const violations = [];
  const commentState = { inBlockComment: false };
  let activeCustomProperty = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const cleanedLine = stripCssComments(line, commentState);
    const colorSurfaceLine = stripCssStringsAndUrls(cleanedLine);
    const customPropertyMatch = cleanedLine.match(CUSTOM_PROPERTY_PATTERN);

    if (customPropertyMatch) {
      activeCustomProperty = customPropertyMatch[1];
    }

    const rawColorFound = hasRawColor(colorSurfaceLine);
    if (rawColorFound) {
      const currentProperty = customPropertyMatch?.[1] ?? activeCustomProperty;
      const isMaterialCustomProperty = currentProperty ? isMaterialAlias(currentProperty) : false;

      if (!isMaterialCustomProperty) {
        violations.push({
          file,
          lineNumber,
          reason: currentProperty
            ? `raw color in non-material custom property ${currentProperty}`
            : 'raw color outside material alias',
          line: line.trim(),
        });
      }
    }

    if (activeCustomProperty && colorSurfaceLine.includes(';')) {
      activeCustomProperty = null;
    }
  });

  return violations;
}

export function auditCssModuleRawColorFiles(files, options = {}) {
  const { readLines } = options;
  return files.flatMap((file) => auditCssModuleRawColorLines(file, readLines(file)));
}

export function formatCssModuleRawColorFailure(violations) {
  const lines = [
    '[raw-color-audit] CSS Modules raw color violations found.',
    '[raw-color-audit] Raw colors are allowed only in --*-material-* custom-property definitions.',
    '',
  ];

  for (const violation of violations) {
    lines.push(`${violation.file}:${violation.lineNumber}: ${violation.reason}`);
    lines.push(`  ${violation.line}`);
  }

  return lines.join('\n');
}

export function summarizeCssModuleRawColorAudit(filesCount) {
  return `scanned ${filesCount} CSS Modules; no non-material raw colors found.`;
}
