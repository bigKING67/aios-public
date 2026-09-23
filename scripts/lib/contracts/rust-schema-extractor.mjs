function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unbalanced Rust struct body at offset ${openIndex}.`);
}

function unwrapGeneric(typeName, genericName) {
  const prefix = `${genericName}<`;
  return typeName.startsWith(prefix) && typeName.endsWith('>')
    ? typeName.slice(prefix.length, -1).trim()
    : null;
}

function splitTopLevelArguments(value) {
  const argumentsList = [];
  let startIndex = 0;
  let angleDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '<') angleDepth += 1;
    if (char === '>') angleDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;
    if (char === '(') parenthesisDepth += 1;
    if (char === ')') parenthesisDepth -= 1;
    if (char === ',' && angleDepth === 0 && bracketDepth === 0 && parenthesisDepth === 0) {
      argumentsList.push(value.slice(startIndex, index).trim());
      startIndex = index + 1;
    }
  }

  argumentsList.push(value.slice(startIndex).trim());
  return argumentsList;
}

function findFieldTypeEnd(source, startIndex) {
  let angleDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '<') angleDepth += 1;
    if (char === '>') angleDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;
    if (char === '(') parenthesisDepth += 1;
    if (char === ')') parenthesisDepth -= 1;
    if (char === ',' && angleDepth === 0 && bracketDepth === 0 && parenthesisDepth === 0) {
      return index;
    }
  }

  throw new Error(`Rust contract field starting at offset ${startIndex} is missing a trailing comma.`);
}

function renameRustField(fieldName, renameAll) {
  if (!renameAll || renameAll === 'snake_case') return fieldName;
  if (renameAll === 'camelCase') {
    return fieldName.replace(/_([a-z0-9])/g, (_match, char) => char.toUpperCase());
  }
  throw new Error(`Unsupported serde rename_all contract mode: ${renameAll}.`);
}

function rustTypeToSchema(rawType) {
  const typeName = rawType.replace(/\s+/g, ' ').trim();
  const optionalType = unwrapGeneric(typeName, 'Option');
  if (optionalType) {
    return { optional: true, schema: { anyOf: [rustTypeToSchema(optionalType).schema, { type: 'null' }] } };
  }
  const vectorType = unwrapGeneric(typeName, 'Vec');
  if (vectorType) {
    return { optional: false, schema: { type: 'array', items: rustTypeToSchema(vectorType).schema } };
  }
  const mapType = unwrapGeneric(typeName, 'BTreeMap') ?? unwrapGeneric(typeName, 'HashMap');
  if (mapType) {
    const [keyType, valueType, ...extraTypes] = splitTopLevelArguments(mapType);
    if (extraTypes.length > 0 || !keyType || !valueType || !['String', '&str'].includes(keyType)) {
      throw new Error(`Unsupported Rust contract map type: ${rawType}.`);
    }
    return {
      optional: false,
      schema: {
        type: 'object',
        additionalProperties: rustTypeToSchema(valueType).schema,
      },
    };
  }
  if (typeName === 'String' || typeName === '&str' || typeName === "&'static str") {
    return { optional: false, schema: { type: 'string' } };
  }
  if (typeName === 'Uuid') return { optional: false, schema: { type: 'string', format: 'uuid' } };
  if (typeName === 'bool') return { optional: false, schema: { type: 'boolean' } };
  if (typeName === 'Value' || typeName === 'serde_json::Value') return { optional: false, schema: {} };
  if (/^(?:i|u)(?:8|16|32|64|128|size)$/.test(typeName)) return { optional: false, schema: { type: 'integer' } };
  if (/^f(?:32|64)$/.test(typeName)) return { optional: false, schema: { type: 'number' } };
  const qualifiedType = /^(?:[a-z_][A-Za-z0-9_]*::)+([A-Z][A-Za-z0-9_]*)$/.exec(typeName);
  if (qualifiedType) {
    return { optional: false, schema: { $ref: `#/components/schemas/${qualifiedType[1]}` } };
  }
  if (/^[A-Z][A-Za-z0-9_]*$/.test(typeName)) {
    return { optional: false, schema: { $ref: `#/components/schemas/${typeName}` } };
  }
  throw new Error(`Unsupported Rust contract field type: ${rawType}.`);
}

export function extractRustStructSchema(source, structName, { optionalFields = false } = {}) {
  const marker = new RegExp(`\\bstruct\\s+${structName}\\b`, 'g').exec(source);
  if (!marker) throw new Error(`Rust contract struct ${structName} was not found.`);
  const declarationPrefix = source.slice(Math.max(0, marker.index - 1000), marker.index);
  const structAttributes = /((?:#\[[^\n]+\]\s*)*)\s*(?:pub(?:\([^)]*\))?\s+)?$/u
    .exec(declarationPrefix)?.[1] ?? '';
  const renameAll = /\brename_all\s*=\s*"([^"]+)"/u.exec(structAttributes)?.[1];
  const openIndex = source.indexOf('{', marker.index);
  const closeIndex = findMatchingBrace(source, openIndex);
  const body = source.slice(openIndex + 1, closeIndex);
  const properties = {};
  const required = [];
  const fieldPattern = /((?:\s*#\[[^\n]+\]\s*\n)*)\s*(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/g;
  for (let match = fieldPattern.exec(body); match; match = fieldPattern.exec(body)) {
    const [, attributes, fieldName] = match;
    const fieldTypeEnd = findFieldTypeEnd(body, fieldPattern.lastIndex);
    const fieldType = body.slice(fieldPattern.lastIndex, fieldTypeEnd).trim();
    fieldPattern.lastIndex = fieldTypeEnd + 1;
    const parsed = rustTypeToSchema(fieldType);
    const renamedField = /\brename\s*=\s*"([^"]+)"/u.exec(attributes)?.[1];
    const propertyName = renamedField ?? renameRustField(fieldName, renameAll);
    properties[propertyName] = parsed.schema;
    const skippedDuringSerialization = /skip_serializing_if\s*=/.test(attributes);
    const defaultedDuringDeserialization = /\bdefault\b/.test(attributes);
    const optionalRequestField = optionalFields && (parsed.optional || defaultedDuringDeserialization);
    if (!skippedDuringSerialization && !optionalRequestField) {
      required.push(propertyName);
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(`Rust contract struct ${structName} has no extractable fields.`);
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

export function collectRustStructSchemas(descriptors, readFile) {
  const schemas = {};
  for (const descriptor of descriptors) {
    const source = readFile(descriptor.file);
    for (const entry of descriptor.names) {
      const sourceName = typeof entry === 'string' ? entry : entry.source ?? entry.name;
      const schemaName = typeof entry === 'string' ? entry : entry.name ?? sourceName;
      if (schemas[schemaName]) throw new Error(`Duplicate Rust contract schema: ${schemaName}.`);
      schemas[schemaName] = extractRustStructSchema(source, sourceName, {
        optionalFields: typeof entry === 'object' && entry.request === true,
      });
    }
  }
  return schemas;
}
