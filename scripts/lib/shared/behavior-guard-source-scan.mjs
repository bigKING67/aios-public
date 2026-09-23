export function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

export function tokenAt(source, index, token) {
  if (!source.startsWith(token, index)) {
    return false;
  }

  const before = source[index - 1] ?? '';
  const after = source[index + token.length] ?? '';
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

export function skipQuoted(source, index, quote) {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return cursor + 1;
    }
    cursor += 1;
  }
  return source.length;
}

export function skipLineComment(source, index) {
  const lineEnd = source.indexOf('\n', index + 2);
  return lineEnd === -1 ? source.length : lineEnd + 1;
}

export function skipBlockComment(source, index) {
  const blockEnd = source.indexOf('*/', index + 2);
  return blockEnd === -1 ? source.length : blockEnd + 2;
}

export function forEachCodeToken(source, token, callback) {
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(source, index, char);
      continue;
    }

    if (tokenAt(source, index, token) && callback(index)) {
      return true;
    }

    index += 1;
  }

  return false;
}

export function readStatement(source, startIndex) {
  let cursor = startIndex;
  while (cursor < source.length) {
    const char = source[cursor];
    const next = source[cursor + 1];

    if (char === '/' && next === '/') {
      cursor = skipLineComment(source, cursor);
      continue;
    }
    if (char === '/' && next === '*') {
      cursor = skipBlockComment(source, cursor);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      cursor = skipQuoted(source, cursor, char);
      continue;
    }
    if (char === ';') {
      return source.slice(startIndex, cursor + 1);
    }
    if (char === '\n' && !/^\s*import\b/.test(source.slice(startIndex, cursor))) {
      return source.slice(startIndex, cursor);
    }

    cursor += 1;
  }

  return source.slice(startIndex);
}

export function hasStaticImportFrom(source, moduleMatcher) {
  return forEachCodeToken(source, 'import', (startIndex) => {
    const statement = readStatement(source, startIndex);
    const fromMatch = statement.match(/\bfrom\s*(['"])([^'"]+)\1/);
    const sideEffectMatch = statement.match(/^import\s*(['"])([^'"]+)\1/);
    const moduleName = fromMatch?.[2] ?? sideEffectMatch?.[2];
    return Boolean(moduleName && moduleMatcher(moduleName));
  });
}

export function hasRequireFrom(source, moduleMatcher) {
  return forEachCodeToken(source, 'require', (startIndex) => {
    const snippet = source.slice(startIndex, startIndex + 240);
    const match = snippet.match(/^require\s*\(\s*(['"])([^'"]+)\1\s*\)/);
    return Boolean(match && moduleMatcher(match[2]));
  });
}

export function hasCallExpression(source, token) {
  return forEachCodeToken(source, token, (startIndex) => {
    const rest = source.slice(startIndex + token.length);
    return /^\s*\(/.test(rest);
  });
}

export function hasCodeToken(source, token) {
  return forEachCodeToken(source, token, () => true);
}

export function hasSourceIncludesCall(source) {
  return forEachCodeToken(source, 'source', (startIndex) => {
    const rest = source.slice(startIndex + 'source'.length);
    return /^\s*\.\s*includes\s*\(/.test(rest);
  });
}

export function hasProcessExecSpawn(source) {
  return forEachCodeToken(source, 'spawnSync', (startIndex) => {
    const snippet = source.slice(startIndex, startIndex + 420);
    return /^spawnSync\s*\(\s*process\.execPath\s*,\s*\[/.test(snippet);
  });
}

export function importsOrRequires(source, moduleMatcher) {
  return hasStaticImportFrom(source, moduleMatcher) || hasRequireFrom(source, moduleMatcher);
}

export function stripCommentsAndStrings(source) {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const nextIndex = skipLineComment(source, index);
      output += '\n'.repeat(source.slice(index, nextIndex).split('\n').length - 1);
      index = nextIndex;
      continue;
    }

    if (char === '/' && next === '*') {
      const nextIndex = skipBlockComment(source, index);
      output += '\n'.repeat(source.slice(index, nextIndex).split('\n').length - 1);
      index = nextIndex;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const nextIndex = skipQuoted(source, index, char);
      output += '\n'.repeat(source.slice(index, nextIndex).split('\n').length - 1);
      index = nextIndex;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}
