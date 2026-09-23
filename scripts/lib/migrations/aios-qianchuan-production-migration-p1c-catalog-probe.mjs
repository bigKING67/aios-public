import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_P1C_CATALOG_MAPPINGS,
  qianchuanP1cCatalogMappingsForFamily,
} from './aios-qianchuan-production-migration-p1c-catalog-map.mjs';
import { validateQianchuanProductionMigrationP1cLineagePacket } from './aios-qianchuan-production-migration-p1c-lineage.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

const RELATIONS_SQL = `/* aios_qianchuan_p1c:relations */
WITH requested AS (SELECT unnest($1::text[]) AS qualified_name)
SELECT r.qualified_name, c.oid::text, n.nspname AS schema_name, c.relname AS relation_name,
       c.relkind::text AS relation_kind, pg_total_relation_size(c.oid)::text AS total_bytes,
       c.reltuples::bigint::text AS estimated_rows
FROM requested r
LEFT JOIN pg_class c ON c.oid = to_regclass(r.qualified_name)
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
ORDER BY r.qualified_name`;

const ROUTINES_SQL = `/* aios_qianchuan_p1c:routines */
WITH requested AS (SELECT unnest($1::text[]) AS signature)
SELECT r.signature, p.oid::text, n.nspname AS schema_name, p.proname AS routine_name,
       p.prokind::text AS routine_kind, pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       CASE WHEN p.oid IS NULL THEN NULL ELSE pg_get_functiondef(p.oid) END AS definition
FROM requested r
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(r.signature)
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
ORDER BY r.signature`;

const INDEXES_SQL = `/* aios_qianchuan_p1c:indexes */
WITH requested AS (SELECT unnest($1::text[]) AS qualified_name)
SELECT r.qualified_name, i.oid::text, ni.nspname AS schema_name, i.relname AS index_name,
       nt.nspname AS table_schema, t.relname AS table_name,
       CASE WHEN i.oid IS NULL THEN NULL ELSE pg_get_indexdef(i.oid) END AS definition
FROM requested r
LEFT JOIN pg_class i ON i.oid = to_regclass(r.qualified_name)
LEFT JOIN pg_namespace ni ON ni.oid = i.relnamespace
LEFT JOIN pg_index x ON x.indexrelid = i.oid
LEFT JOIN pg_class t ON t.oid = x.indrelid
LEFT JOIN pg_namespace nt ON nt.oid = t.relnamespace
ORDER BY r.qualified_name`;

const COLUMNS_SQL = `/* aios_qianchuan_p1c:columns */
WITH requested AS (SELECT unnest($1::text[]) AS qualified_name)
SELECT r.qualified_name, a.attnum, a.attname,
       format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull
FROM requested r
LEFT JOIN pg_class c ON c.oid = to_regclass(r.qualified_name)
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY r.qualified_name, a.attnum`;

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function qualifiedIdentifierSql(value) {
  const parts = value.split('.');
  if (parts.length !== 2 || parts.some((part) => !/^[a-z_][a-z0-9_$]*$/.test(part))) {
    throw new Error(`Unsafe P1C relation identifier: ${value}.`);
  }
  return parts.map((part) => `"${part}"`).join('.');
}

function rowCountsSql(relations) {
  const selects = relations.map((relation) => (
    `SELECT '${relation}'::text AS qualified_name, COUNT(*)::text AS row_count FROM ${qualifiedIdentifierSql(relation)}`
  ));
  return `/* aios_qianchuan_p1c:row_counts */\n${selects.join('\nUNION ALL\n')}`;
}

function indexBy(rows, field) {
  return new Map(rows.map((row) => [row[field], row]));
}

function assertLineageCatalogMappings(lineage) {
  for (const family of lineage.families) {
    const expected = qianchuanP1cCatalogMappingsForFamily(family.family);
    if (JSON.stringify(family.catalogMappings) !== JSON.stringify(expected)) {
      throw new Error(`${family.family} catalog mappings differ from the repository lineage contract.`);
    }
  }
}

function relationEvidence(mapping, rows) {
  const oldRow = mapping.old ? rows.get(mapping.old) : null;
  const currentRow = rows.get(mapping.current);
  return {
    ...mapping,
    oldPresent: mapping.old ? oldRow?.oid != null : null,
    currentPresent: currentRow?.oid != null,
    currentKind: currentRow?.relation_kind ?? null,
    currentTotalBytes: currentRow?.total_bytes ?? null,
    currentEstimatedRows: currentRow?.estimated_rows ?? null,
  };
}

function routineEvidence(mapping, rows) {
  const oldRow = mapping.old ? rows.get(mapping.old) : null;
  const currentRow = rows.get(mapping.current);
  const definition = currentRow?.definition ?? null;
  const definitionNeedlesPresent = mapping.currentDefinitionNeedles.map((needle) => ({
    needle,
    present: definition?.includes(needle) === true,
  }));
  return {
    ...mapping,
    oldPresent: mapping.old ? oldRow?.oid != null : null,
    currentPresent: currentRow?.oid != null,
    currentRoutineKind: currentRow?.routine_kind ?? null,
    currentDefinitionBytes: definition == null ? null : Buffer.byteLength(definition),
    currentDefinitionSha256: definition == null
      ? null
      : createHash('sha256').update(definition).digest('hex'),
    definitionNeedlesPresent,
    definitionMatches: currentRow?.oid != null
      && definitionNeedlesPresent.every((entry) => entry.present),
  };
}

function indexEvidence(mapping, rows) {
  const oldRow = mapping.old ? rows.get(mapping.old) : null;
  const currentRow = rows.get(mapping.current);
  const actualTable = currentRow?.oid == null
    ? null
    : `${currentRow.table_schema}.${currentRow.table_name}`;
  return {
    ...mapping,
    oldPresent: mapping.old ? oldRow?.oid != null : null,
    currentPresent: currentRow?.oid != null,
    currentDefinition: currentRow?.definition ?? null,
    actualTable,
    currentTableMatches: actualTable === mapping.currentTable,
  };
}

function familyStatus(family, relations, routines, indexes, columnsByRelation, rowCounts) {
  const familyRelations = relations.filter((entry) => entry.family === family);
  const familyRoutines = routines.filter((entry) => entry.family === family);
  const familyIndexes = indexes.filter((entry) => entry.family === family);
  const mappedObjects = familyRelations.length + familyRoutines.length + familyIndexes.length;
  if (mappedObjects === 0) {
    return {
      family,
      mappedObjects: 0,
      catalogTopologyComplete: null,
      dataShapeObserved: null,
    };
  }
  const oldRelationsAbsent = familyRelations.filter((entry) => entry.old).every((entry) => !entry.oldPresent);
  const oldRoutinesAbsent = familyRoutines.filter((entry) => entry.old).every((entry) => !entry.oldPresent);
  const oldIndexesAbsent = familyIndexes.filter((entry) => entry.old).every((entry) => !entry.oldPresent);
  const currentRelationsPresent = familyRelations.every((entry) => entry.currentPresent);
  const currentRoutinesPresent = familyRoutines.every((entry) => entry.currentPresent && entry.definitionMatches);
  const currentIndexesPresent = familyIndexes.every((entry) => (
    entry.currentPresent && entry.currentTableMatches
  ));
  const dataShapeObserved = familyRelations.every((entry) => (
    (columnsByRelation[entry.current]?.count ?? 0) > 0
    && rowCounts[entry.current] != null
  ));
  return {
    family,
    mappedObjects,
    oldRelationsAbsent,
    oldRoutinesAbsent,
    oldIndexesAbsent,
    currentRelationsPresent,
    currentRoutinesPresent,
    currentIndexesPresent,
    catalogTopologyComplete: oldRelationsAbsent
      && oldRoutinesAbsent
      && oldIndexesAbsent
      && currentRelationsPresent
      && currentRoutinesPresent
      && currentIndexesPresent,
    dataShapeObserved,
  };
}

export async function runQianchuanProductionMigrationP1cCatalogProbe({
  client,
  lineage,
  lineageArtifact,
  lineageSha256,
  now = () => new Date(),
  statementTimeoutMs = 15000,
}) {
  validateQianchuanProductionMigrationP1cLineagePacket(lineage);
  assertPinnedMigrationReviewArtifact(lineageArtifact, lineageSha256, 'P1C lineage packet');
  assertLineageCatalogMappings(lineage);

  const relationNames = uniqueSorted(QIANCHUAN_P1C_CATALOG_MAPPINGS.relations
    .flatMap((mapping) => [mapping.old, mapping.current]));
  const routineNames = uniqueSorted(QIANCHUAN_P1C_CATALOG_MAPPINGS.routines
    .flatMap((mapping) => [mapping.old, mapping.current]));
  const indexNames = uniqueSorted(QIANCHUAN_P1C_CATALOG_MAPPINGS.indexes
    .flatMap((mapping) => [mapping.old, mapping.current]));
  const currentRelations = uniqueSorted(QIANCHUAN_P1C_CATALOG_MAPPINGS.relations
    .map((mapping) => mapping.current));

  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const relationRows = (await client.query(RELATIONS_SQL, [relationNames])).rows;
    const routineRows = (await client.query(ROUTINES_SQL, [routineNames])).rows;
    const indexRows = (await client.query(INDEXES_SQL, [indexNames])).rows;
    const presentCurrentRelations = relationRows
      .filter((row) => currentRelations.includes(row.qualified_name) && row.oid != null)
      .map((row) => row.qualified_name);
    const columnRows = (await client.query(COLUMNS_SQL, [presentCurrentRelations])).rows;
    const rowCountRows = presentCurrentRelations.length > 0
      ? (await client.query(rowCountsSql(presentCurrentRelations))).rows
      : [];

    const relationRowsByName = indexBy(relationRows, 'qualified_name');
    const routineRowsByName = indexBy(routineRows, 'signature');
    const indexRowsByName = indexBy(indexRows, 'qualified_name');
    const relations = QIANCHUAN_P1C_CATALOG_MAPPINGS.relations.map((mapping) => (
      relationEvidence(mapping, relationRowsByName)
    ));
    const routines = QIANCHUAN_P1C_CATALOG_MAPPINGS.routines.map((mapping) => (
      routineEvidence(mapping, routineRowsByName)
    ));
    const indexes = QIANCHUAN_P1C_CATALOG_MAPPINGS.indexes.map((mapping) => (
      indexEvidence(mapping, indexRowsByName)
    ));
    const columnsByRelation = Object.fromEntries(presentCurrentRelations.map((relation) => {
      const columns = columnRows
        .filter((row) => row.qualified_name === relation && row.attname != null)
        .map(({ attnum, attname, data_type: dataType, attnotnull }) => ({
          position: Number(attnum),
          name: attname,
          dataType,
          notNull: attnotnull === true,
        }));
      return [relation, { count: columns.length, columns }];
    }));
    const rowCounts = Object.fromEntries(rowCountRows.map((row) => (
      [row.qualified_name, row.row_count]
    )));
    const familyStatuses = lineage.families.map((family) => familyStatus(
      family.family,
      relations,
      routines,
      indexes,
      columnsByRelation,
      rowCounts,
    ));
    const mappedFamilyStatuses = familyStatuses.filter((status) => status.mappedObjects > 0);

    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_p1c_catalog_probe',
      sourceArtifact: lineageArtifact,
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs,
        networkAccess: true,
        authoritativeClassificationChanged: false,
        reviewerChanged: false,
        ownerDecisionRecorded: false,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        deployAuthorized: false,
      },
      summary: {
        mappedFamilies: mappedFamilyStatuses.length,
        catalogTopologyCompleteFamilies: mappedFamilyStatuses.filter((status) => (
          status.catalogTopologyComplete
        )).length,
        dataShapeObservedFamilies: mappedFamilyStatuses.filter((status) => (
          status.dataShapeObserved
        )).length,
        ownerDecisionReady: false,
      },
      familyStatuses,
      relations,
      routines,
      indexes,
      columnsByRelation,
      rowCounts,
    };
  });
}

export function validateQianchuanProductionMigrationP1cCatalogProbe(result) {
  if (result?.schemaVersion !== 1 || result.mode !== 'live_readonly_p1c_catalog_probe'
    || !Array.isArray(result.familyStatuses)
    || !Array.isArray(result.relations)
    || !Array.isArray(result.routines)
    || !Array.isArray(result.indexes)) {
    throw new Error('P1C catalog probe structure is invalid.');
  }
  if (result.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || result.policy?.productionWritesAuthorized !== false
    || result.policy?.ledgerWritesAuthorized !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.summary?.ownerDecisionReady !== false) {
    throw new Error('P1C catalog probe policy is unsafe.');
  }
  return result;
}
