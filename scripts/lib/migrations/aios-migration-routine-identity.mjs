const ARGUMENT_MODE_PATTERN = /^(INOUT|IN|OUT|VARIADIC)\b\s*/i;
const BUILTIN_TYPE_PREFIX_PATTERN = new RegExp([
  '^(?:bigint|bigserial|bit(?:\\s+varying)?|boolean|bool|box|bytea|char',
  '|character(?:\\s+varying)?|cidr|circle|date|decimal|double\\s+precision',
  '|inet|int|int2|int4|int8|integer|interval|json|jsonb|line|lseg|macaddr',
  '|macaddr8|money|numeric|oid|path|pg_lsn|point|polygon|real|record|regclass',
  '|regconfig|regdictionary|regnamespace|regoper|regoperator|regproc|regprocedure',
  '|regrole|regtype|smallint|smallserial|serial|text',
  '|time(?:stamp)?(?:\\s+(?:with|without)\\s+time\\s+zone)?',
  '|timetz|timestamptz|tsquery|tsvector|txid_snapshot|uuid|varbit|varchar|void|xml',
  '|anyarray|anycompatible|anycompatiblearray|anycompatiblemultirange',
  '|anycompatiblenonarray|anycompatiblerange|anyelement|anyenum|anymultirange',
  '|anynonarray|anyrange|cstring|internal)(?:\\b|\\s*\\()',
].join(''), 'i');

const TYPE_ALIASES = new Map([
  ['bool', 'boolean'],
  ['bpchar', 'character'],
  ['char', 'character'],
  ['decimal', 'numeric'],
  ['float4', 'real'],
  ['float8', 'double precision'],
  ['int', 'integer'],
  ['int2', 'smallint'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['pg_catalog.bool', 'boolean'],
  ['pg_catalog.bpchar', 'character'],
  ['pg_catalog.float4', 'real'],
  ['pg_catalog.float8', 'double precision'],
  ['pg_catalog.int2', 'smallint'],
  ['pg_catalog.int4', 'integer'],
  ['pg_catalog.int8', 'bigint'],
  ['pg_catalog.text', 'text'],
  ['pg_catalog.varchar', 'character varying'],
  ['time', 'time without time zone'],
  ['timestamp', 'timestamp without time zone'],
  ['timetz', 'time with time zone'],
  ['timestamptz', 'timestamp with time zone'],
  ['varbit', 'bit varying'],
  ['varchar', 'character varying'],
]);

function findClosingParenthesis(value, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(value) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ',' && depth === 0) {
      items.push(value.slice(start, index));
      start = index + 1;
    }
  }
  items.push(value.slice(start));
  return items;
}

function stripDefaultExpression(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (depth === 0 && value[index] === '=') return value.slice(0, index);
    else if (depth === 0 && /^default\b/i.test(value.slice(index))) {
      const previous = value[index - 1];
      if (!previous || /\s/.test(previous)) return value.slice(0, index);
    }
  }
  return value;
}

function removeTypeModifiers(value) {
  let output = '';
  let depth = 0;
  for (const character of value) {
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      continue;
    }
    if (depth === 0) output += character;
  }
  return output;
}

function canonicalizeType(value) {
  let normalized = removeTypeModifiers(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\[\s*\]/g, '[]');
  let arraySuffix = '';
  while (normalized.endsWith('[]')) {
    arraySuffix += '[]';
    normalized = normalized.slice(0, -2).trim();
  }
  return `${TYPE_ALIASES.get(normalized) ?? normalized}${arraySuffix}`;
}

function argumentType(declaration) {
  let normalized = stripDefaultExpression(declaration).trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  const mode = normalized.match(ARGUMENT_MODE_PATTERN)?.[1]?.toUpperCase() ?? null;
  if (mode) normalized = normalized.replace(ARGUMENT_MODE_PATTERN, '').trim();
  if (mode === 'OUT') return null;
  if (!normalized || normalized.includes('"')) return undefined;

  const namedArgument = normalized.match(/^([a-z_][a-z0-9_$]*)\s+(.+)$/i);
  if (namedArgument
    && !BUILTIN_TYPE_PREFIX_PATTERN.test(normalized)
    && !namedArgument[1].includes('.')) {
    normalized = namedArgument[2];
  }
  return canonicalizeType(normalized);
}

export function extractAiosRoutineIdentityArguments(statement, openIndex) {
  const closeIndex = findClosingParenthesis(statement, openIndex);
  if (closeIndex < 0) return null;
  const rawArguments = statement.slice(openIndex + 1, closeIndex).trim();
  if (!rawArguments) return '';

  const types = [];
  for (const declaration of splitTopLevel(rawArguments)) {
    const type = argumentType(declaration);
    if (type === undefined) return null;
    if (type) types.push(type);
  }
  return types.join(',');
}
