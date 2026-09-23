const CATALOG_SQL = Object.freeze({
  column: `/* aios_migration_reconciliation:columns */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM information_schema.columns actual
         WHERE actual.table_schema = requested.schema_name
           AND actual.table_name = requested.relation_name
           AND actual.column_name = requested.object_name
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[], $4::TEXT[])
  AS requested(effect_key, schema_name, relation_name, object_name)
ORDER BY requested.effect_key`,
  constraint: `/* aios_migration_reconciliation:constraints */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_constraint actual
         JOIN pg_class relation ON relation.oid = actual.conrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = requested.schema_name
           AND relation.relname = requested.relation_name
           AND actual.conname = requested.object_name
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[], $4::TEXT[])
  AS requested(effect_key, schema_name, relation_name, object_name)
ORDER BY requested.effect_key`,
  extension: `/* aios_migration_reconciliation:extensions */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1 FROM pg_extension actual WHERE actual.extname = requested.object_name
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[]) AS requested(effect_key, object_name)
ORDER BY requested.effect_key`,
  index: `/* aios_migration_reconciliation:indexes */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_class actual
         JOIN pg_namespace namespace ON namespace.oid = actual.relnamespace
         WHERE namespace.nspname = requested.schema_name
           AND actual.relname = requested.object_name
           AND actual.relkind IN ('i', 'I')
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[])
  AS requested(effect_key, schema_name, object_name)
ORDER BY requested.effect_key`,
  relation: `/* aios_migration_reconciliation:relations */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_class actual
         JOIN pg_namespace namespace ON namespace.oid = actual.relnamespace
         WHERE namespace.nspname = requested.schema_name
           AND actual.relname = requested.object_name
           AND actual.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[])
  AS requested(effect_key, schema_name, object_name)
ORDER BY requested.effect_key`,
  routine: `/* aios_migration_reconciliation:routines */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_proc actual
         WHERE actual.oid = to_regprocedure(
           format('%I.%I(%s)', requested.schema_name, requested.object_name, requested.identity_arguments)
         )
           AND actual.prokind = CASE requested.routine_kind WHEN 'procedure' THEN 'p' ELSE 'f' END
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[], $4::TEXT[], $5::TEXT[])
  AS requested(effect_key, schema_name, object_name, routine_kind, identity_arguments)
ORDER BY requested.effect_key`,
  schema: `/* aios_migration_reconciliation:schemas */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1 FROM pg_namespace actual WHERE actual.nspname = requested.schema_name
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[]) AS requested(effect_key, schema_name)
ORDER BY requested.effect_key`,
  trigger: `/* aios_migration_reconciliation:triggers */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_trigger actual
         JOIN pg_class relation ON relation.oid = actual.tgrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = requested.schema_name
           AND relation.relname = requested.relation_name
           AND actual.tgname = requested.object_name
           AND NOT actual.tgisinternal
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[], $4::TEXT[])
  AS requested(effect_key, schema_name, relation_name, object_name)
ORDER BY requested.effect_key`,
  type: `/* aios_migration_reconciliation:types */
SELECT requested.effect_key,
       EXISTS (
         SELECT 1
         FROM pg_type actual
         JOIN pg_namespace namespace ON namespace.oid = actual.typnamespace
         WHERE namespace.nspname = requested.schema_name
           AND actual.typname = requested.object_name
       ) AS present
FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[])
  AS requested(effect_key, schema_name, object_name)
ORDER BY requested.effect_key`,
});

function uniqueEffects(effects) {
  return [...new Map(effects.map((effect) => [effect.key, effect])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));
}

function parametersFor(kind, effects) {
  const keys = effects.map((effect) => effect.key);
  if (kind === 'schema') return [keys, effects.map((effect) => effect.schema)];
  if (kind === 'extension') return [keys, effects.map((effect) => effect.name)];
  if (kind === 'column' || kind === 'constraint' || kind === 'trigger') {
    return [
      keys,
      effects.map((effect) => effect.schema),
      effects.map((effect) => effect.relation),
      effects.map((effect) => effect.name),
    ];
  }
  if (kind === 'routine') {
    return [
      keys,
      effects.map((effect) => effect.schema),
      effects.map((effect) => effect.name),
      effects.map((effect) => effect.routineKind),
      effects.map((effect) => effect.identityArguments),
    ];
  }
  return [
    keys,
    effects.map((effect) => effect.schema),
    effects.map((effect) => effect.name),
  ];
}

export async function queryAiosMigrationCatalogEffects(client, effects) {
  const presence = new Map();
  const byKind = new Map();
  for (const effect of uniqueEffects(effects)) {
    const items = byKind.get(effect.kind) ?? [];
    items.push(effect);
    byKind.set(effect.kind, items);
  }

  for (const kind of Object.keys(CATALOG_SQL)) {
    const items = byKind.get(kind) ?? [];
    if (!items.length) continue;
    const rows = (await client.query(CATALOG_SQL[kind], parametersFor(kind, items))).rows ?? [];
    for (const row of rows) presence.set(row.effect_key, row.present === true);
  }
  return presence;
}
