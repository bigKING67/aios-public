import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_PARSE_HELPER_DEFINITIONS,
  QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION,
  validateQianchuanParseHelperForwardContractPlan,
  validateQianchuanParseHelperForwardMigrationAsset,
} from './aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

const RELATIONS = Object.freeze([
  'ods.qianchuan_material_daily_report_raw',
  'dwd.marketing_content_ad_material_stats_di',
]);
const RESULT_TYPES = Object.freeze(new Map([
  ['public.marketing_content_parse_numeric(text)', 'numeric'],
  ['public.marketing_content_parse_bigint(text)', 'bigint'],
  ['public.marketing_content_parse_rate(text)', 'numeric'],
]));
const SEMANTIC_CHECK_IDS = Object.freeze([
  'numericCurrency',
  'numericWhitespace',
  'numericMissing',
  'numericInvalid',
  'bigintComma',
  'bigintInvalid',
  'ratePercent',
  'rateWholePercent',
  'rateDecimalRatio',
  'rateInvalid',
]);

const ROUTINES_SQL = `/* aios_qianchuan_parse_helper:routines */
SELECT
  requested.signature,
  routine.oid::TEXT AS oid,
  routine.prokind::TEXT AS routine_kind,
  language.lanname AS language_name,
  routine.provolatile::TEXT AS volatility_code,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_function_result(routine.oid) END AS result_type,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_functiondef(routine.oid) END AS definition
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(signature, position)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)
LEFT JOIN pg_language language ON language.oid = routine.prolang
ORDER BY requested.position`;

const DATA_SHAPE_SQL = `/* aios_qianchuan_parse_helper:data_shape */
SELECT
  (SELECT COUNT(*)::TEXT FROM ods.qianchuan_material_daily_report_raw) AS raw_rows,
  (SELECT COUNT(*)::TEXT FROM dwd.marketing_content_ad_material_stats_di) AS dwd_rows,
  (SELECT COUNT(*) FILTER (WHERE ad_platform = 'qianchuan')::TEXT
    FROM dwd.marketing_content_ad_material_stats_di) AS qianchuan_dwd_rows`;

const LOCKS_SQL = `/* aios_qianchuan_parse_helper:locks */
SELECT
  requested.qualified_name,
  relation.oid::TEXT AS oid,
  relation.relkind::TEXT AS relation_kind,
  COALESCE(locks.granted_locks, 0)::TEXT AS granted_locks,
  COALESCE(locks.waiting_locks, 0)::TEXT AS waiting_locks
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(qualified_name, position)
LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.qualified_name)
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE lock.granted)::BIGINT AS granted_locks,
    COUNT(*) FILTER (WHERE NOT lock.granted)::BIGINT AS waiting_locks
  FROM pg_locks lock
  WHERE lock.relation = relation.oid
) locks ON TRUE
ORDER BY requested.position`;

const SEMANTIC_SQL = `/* aios_qianchuan_parse_helper:semantics */
SELECT
  public.marketing_content_parse_numeric('1,234.50元') = 1234.50::NUMERIC AS numeric_currency,
  public.marketing_content_parse_numeric(' ￥ 2,345 ') = 2345::NUMERIC AS numeric_whitespace,
  public.marketing_content_parse_numeric('-') IS NULL AS numeric_missing,
  public.marketing_content_parse_numeric('invalid') IS NULL AS numeric_invalid,
  public.marketing_content_parse_bigint('1,234') = 1234::BIGINT AS bigint_comma,
  public.marketing_content_parse_bigint('invalid') IS NULL AS bigint_invalid,
  public.marketing_content_parse_rate('12.5%') = 0.125::NUMERIC AS rate_percent,
  public.marketing_content_parse_rate('12.5') = 0.125::NUMERIC AS rate_whole_percent,
  public.marketing_content_parse_rate('0.125') = 0.125::NUMERIC AS rate_decimal_ratio,
  public.marketing_content_parse_rate('invalid') IS NULL AS rate_invalid`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function assertState(state) {
  if (!['preinstall', 'postinstall'].includes(state)) {
    throw new Error('Parse-helper read-only probe state must be preinstall or postinstall.');
  }
}

function camelRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
    value,
  ]));
}

function routineEvidence(row, definition) {
  const source = row?.definition ?? null;
  return {
    signature: definition.signature,
    present: row?.oid != null,
    routineKind: row?.routine_kind ?? null,
    language: row?.language_name ?? null,
    volatilityCode: row?.volatility_code ?? null,
    volatility: row?.volatility_code === 'i' ? 'immutable' : null,
    resultType: row?.result_type ?? null,
    definitionBytes: source == null ? null : Buffer.byteLength(source),
    definitionSha256: source == null ? null : sha256(source),
    definitionNeedles: Object.fromEntries(definition.requiredTokens.map((token) => (
      [token, source?.includes(token) === true]
    ))),
  };
}

function routineMatchesContract(routine) {
  return routine?.present === true
    && routine.routineKind === 'f'
    && routine.language === 'plpgsql'
    && routine.volatilityCode === 'i'
    && routine.volatility === 'immutable'
    && routine.resultType === RESULT_TYPES.get(routine.signature)
    && asCount(routine.definitionBytes, 'Parse-helper definition bytes') > 0
    && /^[a-f0-9]{64}$/.test(routine.definitionSha256 ?? '')
    && Object.values(routine.definitionNeedles ?? {}).every((value) => value === true);
}

function semanticEvidence(row) {
  const values = camelRow(row);
  return Object.fromEntries(SEMANTIC_CHECK_IDS.map((identity) => [identity, values[identity] === true]));
}

export function validateQianchuanParseHelperReadonlyProbeSources({
  forwardMigrationSql,
  plan,
  planArtifact,
  planSha256,
}) {
  assertPinnedMigrationReviewArtifact(planArtifact, planSha256, 'Parse-helper forward-contract plan');
  validateQianchuanParseHelperForwardContractPlan(plan);
  const forwardMigration = validateQianchuanParseHelperForwardMigrationAsset({
    forwardMigrationPath: QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path,
    forwardMigrationSql,
    historicalMigrationSql: plan.execution.forwardMigration.sql,
  });
  if (forwardMigration.sha256 !== plan.execution.forwardMigration.definitionSha256
    || forwardMigration.bytes !== plan.execution.forwardMigration.definitionBytes) {
    throw new Error('Parse-helper staged migration differs from the pinned forward-contract plan.');
  }
  return forwardMigration;
}

export async function runQianchuanParseHelperReadonlyProbe({
  client,
  forwardMigrationSql,
  now = () => new Date(),
  plan,
  planArtifact,
  planSha256,
  state = 'preinstall',
  statementTimeoutMs = 30000,
}) {
  assertState(state);
  const forwardMigration = validateQianchuanParseHelperReadonlyProbeSources({
    forwardMigrationSql,
    plan,
    planArtifact,
    planSha256,
  });
  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const routineRows = (await client.query(ROUTINES_SQL, [
      QIANCHUAN_PARSE_HELPER_DEFINITIONS.map((entry) => entry.signature),
    ])).rows;
    const shape = camelRow((await client.query(DATA_SHAPE_SQL)).rows[0]);
    const relationRows = (await client.query(LOCKS_SQL, [RELATIONS])).rows.map(camelRow);
    const semantics = state === 'postinstall'
      ? semanticEvidence((await client.query(SEMANTIC_SQL)).rows[0])
      : {};
    const routines = routineRows.map((row, index) => routineEvidence(
      row,
      QIANCHUAN_PARSE_HELPER_DEFINITIONS[index],
    ));
    const helpersPresent = routines.filter((routine) => routine.present).length;
    const exactCatalogHelpers = routines.filter(routineMatchesContract).length;
    const semanticChecksPassed = Object.values(semantics).filter(Boolean).length;
    const waitingLocks = relationRows.reduce((total, relation) => (
      total + asCount(relation.waitingLocks, `${relation.qualifiedName} waiting locks`)
    ), 0);
    const rawRows = asCount(shape.rawRows, 'Qianchuan raw rows');
    const dwdRows = asCount(shape.dwdRows, 'Marketing-content DWD rows');
    const qianchuanDwdRows = asCount(shape.qianchuanDwdRows, 'Qianchuan DWD rows');
    const postinstallReady = state === 'postinstall'
      && helpersPresent === QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
      && exactCatalogHelpers === QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
      && semanticChecksPassed === SEMANTIC_CHECK_IDS.length
      && rawRows === 0 && dwdRows === 0 && qianchuanDwdRows === 0
      && waitingLocks === 0;

    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_qianchuan_parse_helper_forward_migration_probe',
      requestedState: state,
      target: {
        historicalIdentity: plan.target.identity,
        forwardMigrationIdentity: forwardMigration.identity,
      },
      sourceArtifacts: {
        plan: planArtifact,
      },
      repositoryEvidence: {
        forwardMigration,
      },
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs,
        networkAccess: true,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        migrationApplyAuthorized: false,
        migrationLedgerVerified: false,
        runtimeTransitionAuthorized: false,
        ownerDecisionRecorded: false,
        deployAuthorized: false,
        arkInvoked: false,
      },
      summary: {
        helpersPresent,
        exactCatalogHelpers,
        semanticChecksPassed,
        semanticChecksTotal: Object.keys(semantics).length,
        rawRows,
        dwdRows,
        qianchuanDwdRows,
        waitingLocks,
        postinstallReady,
      },
      catalog: {
        routines,
        relations: relationRows,
      },
      semantics,
    };
  });
}

function validateEnvelope(result) {
  if (result?.schemaVersion !== 1
    || result.mode !== 'live_readonly_qianchuan_parse_helper_forward_migration_probe'
    || !['preinstall', 'postinstall'].includes(result.requestedState)
    || result.target?.historicalIdentity !== 'warehouse/20260525_1730'
    || result.target?.forwardMigrationIdentity !== QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.identity
    || !Array.isArray(result.catalog?.routines)
    || !Array.isArray(result.catalog?.relations)) {
    throw new Error('Parse-helper read-only probe structure is invalid.');
  }
  if (result.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || !Number.isSafeInteger(result.policy?.statementTimeoutMs)
    || result.policy.statementTimeoutMs < 1000 || result.policy.statementTimeoutMs > 120000
    || result.policy?.networkAccess !== true
    || result.policy?.productionWritesAuthorized !== false
    || result.policy?.ledgerWritesAuthorized !== false
    || result.policy?.migrationApplyAuthorized !== false
    || result.policy?.migrationLedgerVerified !== false
    || result.policy?.runtimeTransitionAuthorized !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.arkInvoked !== false) {
    throw new Error('Parse-helper read-only probe policy is unsafe.');
  }
  assertPinnedMigrationReviewArtifact(
    result.sourceArtifacts?.plan,
    result.sourceArtifacts?.plan?.sha256,
    'Parse-helper plan artifact',
  );
  const migration = result.repositoryEvidence?.forwardMigration;
  if (migration?.identity !== QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.identity
    || migration?.path !== QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path
    || migration?.sha256 !== '9b5e08a572a47505fa5e1215f7136e839834344d3170a20f4b259c1c17ed61ff'
    || asCount(migration?.bytes, 'Parse-helper migration bytes') < 1000
    || migration?.functions?.length !== QIANCHUAN_PARSE_HELPER_DEFINITIONS.length) {
    throw new Error('Parse-helper staged migration evidence is invalid.');
  }
}

function validateDormantAndLockEvidence(result) {
  if (asCount(result.summary?.rawRows, 'Qianchuan raw rows') !== 0
    || asCount(result.summary?.dwdRows, 'Marketing-content DWD rows') !== 0
    || asCount(result.summary?.qianchuanDwdRows, 'Qianchuan DWD rows') !== 0
    || asCount(result.summary?.waitingLocks, 'Waiting locks') !== 0
    || result.catalog.relations.length !== RELATIONS.length
    || result.catalog.relations.some((relation) => (
      !RELATIONS.includes(relation.qualifiedName)
      || asCount(relation.waitingLocks, `${relation.qualifiedName} waiting locks`) !== 0
    ))) {
    throw new Error('Parse-helper dormant data-shape or lock evidence is incomplete.');
  }
}

export function validateQianchuanParseHelperPreinstallReadonlyProbe(result) {
  validateEnvelope(result);
  validateDormantAndLockEvidence(result);
  if (result.requestedState !== 'preinstall'
    || result.catalog.routines.length !== QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
    || result.catalog.routines.some((routine) => routine.present !== false)
    || result.summary?.helpersPresent !== 0
    || result.summary?.exactCatalogHelpers !== 0
    || result.summary?.semanticChecksPassed !== 0
    || result.summary?.semanticChecksTotal !== 0
    || Object.keys(result.semantics ?? {}).length !== 0
    || result.summary?.postinstallReady !== false) {
    throw new Error('Parse-helper preinstall evidence is incomplete.');
  }
  return result;
}

export function validateQianchuanParseHelperPostinstallReadonlyProbe(result) {
  validateEnvelope(result);
  validateDormantAndLockEvidence(result);
  if (result.requestedState !== 'postinstall'
    || result.catalog.routines.length !== QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
    || result.catalog.routines.some((routine) => !routineMatchesContract(routine))
    || result.summary?.helpersPresent !== QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
    || result.summary?.exactCatalogHelpers !== QIANCHUAN_PARSE_HELPER_DEFINITIONS.length
    || result.summary?.semanticChecksPassed !== SEMANTIC_CHECK_IDS.length
    || result.summary?.semanticChecksTotal !== SEMANTIC_CHECK_IDS.length
    || JSON.stringify(Object.keys(result.semantics ?? {})) !== JSON.stringify(SEMANTIC_CHECK_IDS)
    || Object.values(result.semantics).some((value) => value !== true)
    || result.summary?.postinstallReady !== true) {
    throw new Error('Parse-helper postinstall evidence is incomplete.');
  }
  return result;
}
