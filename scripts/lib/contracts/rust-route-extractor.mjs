const HTTP_METHODS = Object.freeze(['delete', 'get', 'patch', 'post', 'put']);

function findNextRouteCall(source, startIndex) {
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockCommentDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (char === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (char === '"') {
      quote = char;
      continue;
    }
    if (source.startsWith('.route(', index)) return index;
  }
  return -1;
}

function findMatchingParen(source, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unbalanced Rust route call at offset ${openIndex}.`);
}

function joinRoutePath(prefix, routePath) {
  const normalizedPrefix = `/${prefix}`.replace(/\/+/g, '/').replace(/\/$/, '');
  if (routePath === '/') return normalizedPrefix || '/';
  return `${normalizedPrefix}/${routePath.replace(/^\/+/, '')}`.replace(/\/+/g, '/');
}

export function extractRustRouteOperations(source, descriptor) {
  const operations = [];
  let cursor = 0;
  while (cursor < source.length) {
    const routeIndex = findNextRouteCall(source, cursor);
    if (routeIndex === -1) break;
    const openIndex = source.indexOf('(', routeIndex);
    const closeIndex = findMatchingParen(source, openIndex);
    const call = source.slice(openIndex + 1, closeIndex);
    const pathMatch = call.match(/^\s*"([^"\n]+)"\s*,/);
    if (!pathMatch) {
      throw new Error(`${descriptor.file}: route call at offset ${routeIndex} does not start with a string path.`);
    }
    const methods = [...call.matchAll(/\b(delete|get|patch|post|put)\s*\(/g)]
      .map((match) => match[1])
      .filter((method, index, values) => values.indexOf(method) === index)
      .sort((left, right) => HTTP_METHODS.indexOf(left) - HTTP_METHODS.indexOf(right));
    if (methods.length === 0) {
      throw new Error(`${descriptor.file}: ${pathMatch[1]} has no recognized HTTP method.`);
    }
    const path = joinRoutePath(descriptor.prefix, pathMatch[1]);
    for (const method of methods) {
      operations.push({ file: descriptor.file, method, path, tag: descriptor.tag });
    }
    cursor = closeIndex + 1;
  }
  return operations;
}

export function collectRustRouteOperations(descriptors, readFile) {
  const operations = descriptors.flatMap((descriptor) => (
    extractRustRouteOperations(readFile(descriptor.file), descriptor)
  ));
  const seen = new Set();
  for (const operation of operations) {
    const key = `${operation.method.toUpperCase()} ${operation.path}`;
    if (seen.has(key)) throw new Error(`Duplicate Rust API operation: ${key}.`);
    seen.add(key);
  }
  return operations.sort((left, right) => (
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
  ));
}
