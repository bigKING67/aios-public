import { readFileSync } from 'node:fs';

import { extractAiosRoutineIdentityArguments } from './aios-migration-routine-identity.mjs';
import { normalizeAiosPostgresIdentifier } from './aios-postgres-identifier.mjs';

const IDENTIFIER = '[a-z_][a-z0-9_$]*';
const QUALIFIED_IDENTIFIER = `(${IDENTIFIER})\\.(${IDENTIFIER})`;
const RELATION_DEPENDENT_EFFECT_KINDS = new Set(['column', 'constraint', 'index', 'trigger']);

function addUnsupported(target, signal) {
  if (!target.includes(signal)) target.push(signal);
}

function maskSql(sql) {
  const chars = [...sql];
  const output = [...chars];
  let index = 0;

  const mask = (start, end) => {
    for (let cursor = start; cursor < end; cursor += 1) {
      if (output[cursor] !== '\n' && output[cursor] !== '\r') output[cursor] = ' ';
    }
  };

  while (index < chars.length) {
    if (chars[index] === '-' && chars[index + 1] === '-') {
      const start = index;
      index += 2;
      while (index < chars.length && chars[index] !== '\n') index += 1;
      mask(start, index);
      continue;
    }
    if (chars[index] === '/' && chars[index + 1] === '*') {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < chars.length && depth > 0) {
        if (chars[index] === '/' && chars[index + 1] === '*') {
          depth += 1;
          index += 2;
        } else if (chars[index] === '*' && chars[index + 1] === '/') {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      mask(start, index);
      continue;
    }
    if (chars[index] === "'") {
      const start = index;
      index += 1;
      while (index < chars.length) {
        if (chars[index] === "'" && chars[index + 1] === "'") index += 2;
        else if (chars[index] === "'") {
          index += 1;
          break;
        } else index += 1;
      }
      mask(start, index);
      continue;
    }
    if (chars[index] === '$') {
      const remaining = chars.slice(index).join('');
      const tag = remaining.match(/^\$[a-z_][a-z0-9_]*\$|^\$\$/i)?.[0];
      if (tag) {
        const start = index;
        index += tag.length;
        const tail = chars.slice(index).join('');
        const closingOffset = tail.indexOf(tag);
        index = closingOffset === -1 ? chars.length : index + closingOffset + tag.length;
        mask(start, index);
        continue;
      }
    }
    index += 1;
  }

  return output.join('');
}

function relationParts(match) {
  return match ? { schema: match[1], relation: match[2] } : null;
}

function effectKey(effect) {
  if (effect.kind === 'schema') return `schema:${effect.schema}`;
  if (effect.kind === 'extension') return `extension:${effect.name}`;
  if (effect.kind === 'column') {
    return `column:${effect.schema}.${effect.relation}.${effect.name}`;
  }
  if (effect.kind === 'constraint' || effect.kind === 'trigger') {
    return `${effect.kind}:${effect.schema}.${effect.relation}.${effect.name}`;
  }
  if (effect.kind === 'routine') {
    return `routine:${effect.routineKind}:${effect.schema}.${effect.name}(${effect.identityArguments})`;
  }
  return `${effect.kind}:${effect.schema}.${effect.name}`;
}

function addEffect(effects, effect) {
  const normalizedIdentity = { ...effect };
  for (const field of ['name', 'relation', 'schema']) {
    if (normalizedIdentity[field]) {
      normalizedIdentity[field] = normalizeAiosPostgresIdentifier(normalizedIdentity[field]);
    }
  }
  const normalized = { ...normalizedIdentity, key: effectKey(normalizedIdentity) };
  const previousIndex = effects.findIndex((candidate) => candidate.key === normalized.key);
  if (previousIndex >= 0) effects.splice(previousIndex, 1);
  effects.push(normalized);
}

function addQualifiedRelationEffect(effects, unsupported, match, expectedPresent, relationType) {
  const parts = relationParts(match);
  if (!parts) {
    addUnsupported(unsupported, 'unqualified_object');
    return;
  }
  addEffect(effects, {
    expectedPresent,
    kind: 'relation',
    name: parts.relation,
    relationType,
    schema: parts.schema,
  });
}

function parseAlterTable(statement, effects, unsupported) {
  const tableMatch = statement.match(new RegExp(`^ALTER\\s+TABLE(?:\\s+IF\\s+EXISTS)?(?:\\s+ONLY)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  const table = relationParts(tableMatch);
  if (!table) {
    addUnsupported(unsupported, 'unqualified_object');
    return;
  }
  if (/\bRENAME\b/i.test(statement)) addUnsupported(unsupported, 'rename');

  const addColumn = /\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!CONSTRAINT\b)([a-z_][a-z0-9_$]*)/gi;
  const dropColumn = /\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_$]*)/gi;
  const addConstraint = /\bADD\s+CONSTRAINT\s+([a-z_][a-z0-9_$]*)/gi;
  const dropConstraint = /\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_$]*)/gi;
  for (const match of statement.matchAll(addColumn)) {
    addEffect(effects, { ...table, expectedPresent: true, kind: 'column', name: match[1] });
  }
  for (const match of statement.matchAll(dropColumn)) {
    addEffect(effects, { ...table, expectedPresent: false, kind: 'column', name: match[1] });
  }
  for (const match of statement.matchAll(addConstraint)) {
    addEffect(effects, { ...table, expectedPresent: true, kind: 'constraint', name: match[1] });
  }
  for (const match of statement.matchAll(dropConstraint)) {
    addEffect(effects, { ...table, expectedPresent: false, kind: 'constraint', name: match[1] });
  }
}

function parseCreateIndex(statement, effects, unsupported) {
  const match = statement.match(new RegExp(
    `^CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(${IDENTIFIER})(?:\\s+ON)\\s+${QUALIFIED_IDENTIFIER}\\b`,
    'i',
  ));
  if (!match) {
    addUnsupported(unsupported, 'unprobeable_index');
    return;
  }
  addEffect(effects, {
    expectedPresent: true,
    kind: 'index',
    name: match[1],
    relation: match[3],
    schema: match[2],
  });
}

function parseDropRelations(statement, effects, unsupported) {
  const match = statement.match(/^DROP\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE)(?:\s+IF\s+EXISTS)?\s+([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$/i);
  if (!match) return false;
  const relationType = match[1].toLowerCase().replace(/\s+/g, '_');
  for (const item of match[2].split(',')) {
    const relationMatch = item.trim().match(new RegExp(`^${QUALIFIED_IDENTIFIER}\\b`, 'i'));
    if (!relationMatch) addUnsupported(unsupported, 'unqualified_object');
    else addQualifiedRelationEffect(effects, unsupported, relationMatch, false, relationType);
  }
  return true;
}

function parseStatement(statement, effects, unsupported) {
  const normalized = statement.trim();
  if (!normalized) return;

  let match = normalized.match(new RegExp(`^CREATE\\s+SCHEMA(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(${IDENTIFIER})\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: true, kind: 'schema', schema: match[1] });
  match = normalized.match(new RegExp(`^DROP\\s+SCHEMA(?:\\s+IF\\s+EXISTS)?\\s+(${IDENTIFIER})\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: false, kind: 'schema', schema: match[1] });

  match = normalized.match(new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+)?TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addQualifiedRelationEffect(effects, unsupported, match, true, 'table');
  match = normalized.match(new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addQualifiedRelationEffect(effects, unsupported, match, true, 'view');
  match = normalized.match(new RegExp(`^CREATE\\s+MATERIALIZED\\s+VIEW(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addQualifiedRelationEffect(effects, unsupported, match, true, 'materialized_view');
  match = normalized.match(new RegExp(`^CREATE\\s+SEQUENCE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addQualifiedRelationEffect(effects, unsupported, match, true, 'sequence');
  if (parseDropRelations(normalized, effects, unsupported)) return;

  if (/^ALTER\s+TABLE\b/i.test(normalized)) return parseAlterTable(normalized, effects, unsupported);
  if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(normalized)) {
    return parseCreateIndex(normalized, effects, unsupported);
  }

  match = normalized.match(new RegExp(`^DROP\\s+INDEX(?:\\s+CONCURRENTLY)?(?:\\s+IF\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: false, kind: 'index', name: match[2], schema: match[1] });

  match = normalized.match(new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(FUNCTION|PROCEDURE)\\s+${QUALIFIED_IDENTIFIER}\\s*\\(`, 'i'));
  if (match) {
    const identityArguments = extractAiosRoutineIdentityArguments(
      normalized,
      match[0].lastIndexOf('('),
    );
    if (identityArguments === null) {
      addUnsupported(unsupported, 'routine_signature_unparsed');
      return;
    }
    return addEffect(effects, {
      expectedPresent: true,
      identityArguments,
      kind: 'routine',
      name: match[3],
      routineKind: match[1].toLowerCase(),
      schema: match[2],
    });
  }
  match = normalized.match(new RegExp(`^DROP\\s+(FUNCTION|PROCEDURE)(?:\\s+IF\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\s*\\(`, 'i'));
  if (match) {
    const identityArguments = extractAiosRoutineIdentityArguments(
      normalized,
      match[0].lastIndexOf('('),
    );
    if (identityArguments === null) {
      addUnsupported(unsupported, 'routine_signature_unparsed');
      return;
    }
    return addEffect(effects, {
      expectedPresent: false,
      identityArguments,
      kind: 'routine',
      name: match[3],
      routineKind: match[1].toLowerCase(),
      schema: match[2],
    });
  }

  match = normalized.match(new RegExp(`^CREATE\\s+TRIGGER\\s+(${IDENTIFIER})[\\s\\S]+?\\bON\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) {
    return addEffect(effects, {
      expectedPresent: true,
      kind: 'trigger',
      name: match[1],
      relation: match[3],
      schema: match[2],
    });
  }
  match = normalized.match(new RegExp(`^DROP\\s+TRIGGER(?:\\s+IF\\s+EXISTS)?\\s+(${IDENTIFIER})\\s+ON\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) {
    return addEffect(effects, {
      expectedPresent: false,
      kind: 'trigger',
      name: match[1],
      relation: match[3],
      schema: match[2],
    });
  }

  match = normalized.match(new RegExp(`^CREATE\\s+TYPE\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: true, kind: 'type', name: match[2], schema: match[1] });
  match = normalized.match(new RegExp(`^DROP\\s+TYPE(?:\\s+IF\\s+EXISTS)?\\s+${QUALIFIED_IDENTIFIER}\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: false, kind: 'type', name: match[2], schema: match[1] });

  match = normalized.match(new RegExp(`^CREATE\\s+EXTENSION(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(${IDENTIFIER})\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: true, kind: 'extension', name: match[1] });
  match = normalized.match(new RegExp(`^DROP\\s+EXTENSION(?:\\s+IF\\s+EXISTS)?\\s+(${IDENTIFIER})\\b`, 'i'));
  if (match) return addEffect(effects, { expectedPresent: false, kind: 'extension', name: match[1] });

  if (/^(?:CREATE|ALTER|DROP)\b/i.test(normalized)) addUnsupported(unsupported, 'unsupported_ddl');
}

export function extractAiosMigrationStaticEvidence(content) {
  const sql = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  const masked = maskSql(sql);
  const statements = masked.split(';').map((statement) => statement.trim()).filter(Boolean);
  const effects = [];
  const unsupportedSignals = [];
  const proceduralBody = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b|\bDO\s+\$/i.test(sql);
  const dynamicSql = /\bEXECUTE\b/i.test(sql);
  const rename = /\bRENAME\s+(?:COLUMN\s+)?(?:TO\s+)?/i.test(masked);
  const dml = statements.some((statement) => (
    /^(?:INSERT|UPDATE|DELETE|MERGE|COPY|CALL|PERFORM)\b/i.test(statement)
    || /^WITH\b[\s\S]*\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(statement)
  ));

  if (proceduralBody) addUnsupported(unsupportedSignals, 'procedural_body');
  if (dynamicSql) addUnsupported(unsupportedSignals, 'dynamic_sql');
  if (/\bDO\s+\$/i.test(sql)) addUnsupported(unsupportedSignals, 'do_block');
  if (rename) addUnsupported(unsupportedSignals, 'rename');
  if (dml) addUnsupported(unsupportedSignals, 'dml_or_backfill');
  if (/"[^"\n]+"/.test(masked)) addUnsupported(unsupportedSignals, 'quoted_identifier');

  for (const statement of statements) parseStatement(statement, effects, unsupportedSignals);

  return {
    catalogEffects: effects,
    signals: {
      commentsOnly: masked.trim() === '',
      ddl: statements.some((statement) => /^(?:CREATE|ALTER|DROP)\b/i.test(statement)),
      dml,
      dynamicSql,
      proceduralBody,
      rename,
    },
    unsupportedSignals: unsupportedSignals.sort(),
  };
}

export function analyzeAiosMigrationStaticEvidence(records, { readFile = readFileSync } = {}) {
  const analyses = records.map((record) => ({
    ...record,
    ...extractAiosMigrationStaticEvidence(readFile(record.relativePath)),
  }));

  const latestByNamespaceAndEffect = new Map();
  const latestExplicitRelationDrop = new Map();
  for (let index = analyses.length - 1; index >= 0; index -= 1) {
    const analysis = analyses[index];
    analysis.catalogEffects = analysis.catalogEffects.map((effect) => {
      const ownerKey = `${analysis.namespace}:${effect.key}`;
      const exactOwner = latestByNamespaceAndEffect.get(ownerKey);
      const relationKey = RELATION_DEPENDENT_EFFECT_KINDS.has(effect.kind)
        && effect.schema
        && effect.relation
        ? `${analysis.namespace}:${effect.schema}.${effect.relation}`
        : null;
      const relationDropOwner = relationKey
        ? latestExplicitRelationDrop.get(relationKey)
        : null;
      const laterOwner = !exactOwner || (relationDropOwner?.index ?? -1) > exactOwner.index
        ? relationDropOwner ?? exactOwner
        : exactOwner;
      if (!exactOwner) {
        latestByNamespaceAndEffect.set(ownerKey, { index, version: analysis.version });
      }
      return { ...effect, supersededBy: laterOwner?.version ?? null };
    });

    for (const effect of analysis.catalogEffects) {
      if (
        effect.kind !== 'relation'
        || effect.expectedPresent !== false
        || effect.relationType !== 'table'
      ) continue;
      const relationKey = `${analysis.namespace}:${effect.schema}.${effect.name}`;
      if (!latestExplicitRelationDrop.has(relationKey)) {
        latestExplicitRelationDrop.set(relationKey, { index, version: analysis.version });
      }
    }
  }
  return analyses;
}
