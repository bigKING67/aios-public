import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanProductionMigrationP1dReadonlyProbe } from './aios-qianchuan-production-migration-p1d-readonly-probe.mjs';

const TARGET_IDENTITY = 'warehouse/20260525_1730';
const TARGET_CHECKSUM = '9b5e08a572a47505fa5e1215f7136e839834344d3170a20f4b259c1c17ed61ff';
const TARGET_SOURCE = 'etl/groland_postgres/sql/migrations/20260525_1730__add_marketing_content_report_parse_helpers.sql';
const RUNTIME_SOURCE = 'etl/groland_postgres/scripts/marketing_content_assets/qianchuan_reports.py';
const FORWARD_MIGRATION_BASENAME = 'ensure_marketing_content_report_parse_helpers';
export const QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION = Object.freeze({
  identity: 'warehouse/20260725_2300',
  path: 'etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql',
});
const PHASE_ORDER = Object.freeze([
  'preflight',
  'forward_migration',
  'readonly_postcheck',
  'runtime_transition',
  'dormant_path_smoke',
]);
const HELPER_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: 'marketing_content_parse_numeric',
    signature: 'public.marketing_content_parse_numeric(text)',
    requiredTokens: Object.freeze([
      "regexp_replace(COALESCE(value, ''), '[,%￥¥元\\s]', '', 'g')",
      'RETURN normalized::NUMERIC;',
      'EXCEPTION WHEN others THEN',
    ]),
  }),
  Object.freeze({
    name: 'marketing_content_parse_bigint',
    signature: 'public.marketing_content_parse_bigint(text)',
    requiredTokens: Object.freeze([
      'parsed := public.marketing_content_parse_numeric(value);',
      'RETURN parsed::BIGINT;',
    ]),
  }),
  Object.freeze({
    name: 'marketing_content_parse_rate',
    signature: 'public.marketing_content_parse_rate(text)',
    requiredTokens: Object.freeze([
      "regexp_replace(COALESCE(value, ''), '[,%\\s]', '', 'g')",
      "IF position('%' in COALESCE(value, '')) > 0 OR parsed > 1 THEN",
      'RETURN parsed / 100;',
    ]),
  }),
]);
export const QIANCHUAN_PARSE_HELPER_DEFINITIONS = HELPER_DEFINITIONS;
const REQUIRED_RUNTIME_CALLSITES = Object.freeze([
  'public.marketing_content_parse_bigint(raw.raw_impressions)',
  'public.marketing_content_parse_rate(raw.raw_ctr)',
  'public.marketing_content_parse_numeric(raw.raw_cost)',
]);

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

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function extractHelperDefinition(sql, helper) {
  const pattern = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${regexEscape(helper.name)}\\(value TEXT\\)[\\s\\S]*?\\n\\$\\$;`,
    'i',
  );
  const definition = sql.match(pattern)?.[0] ?? null;
  if (!definition) throw new Error(`Parse-helper SQL is missing ${helper.signature}.`);
  for (const token of helper.requiredTokens) {
    if (!definition.includes(token)) {
      throw new Error(`Parse-helper SQL ${helper.signature} is missing required token ${token}.`);
    }
  }
  if (!definition.includes('LANGUAGE plpgsql') || !definition.includes('IMMUTABLE')) {
    throw new Error(`Parse-helper SQL ${helper.signature} must remain immutable PL/pgSQL.`);
  }
  return {
    signature: helper.signature,
    bytes: Buffer.byteLength(definition),
    sha256: sha256(definition),
  };
}

export function validateQianchuanParseHelperForwardMigrationSql(sql) {
  if (typeof sql !== 'string' || Buffer.byteLength(sql) < 1000) {
    throw new Error('Parse-helper forward migration SQL is missing or unexpectedly small.');
  }
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)
    || /\b(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+|CALL\s+|COPY\s+)\b/i.test(sql)
    || /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i.test(sql)) {
    throw new Error('Parse-helper forward migration SQL must remain function-only DDL.');
  }
  const createCount = exactMatches(
    sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.marketing_content_parse_[a-z]+\s*\(/gi,
  );
  if (createCount !== HELPER_DEFINITIONS.length) {
    throw new Error('Parse-helper forward migration SQL must define exactly three helpers.');
  }
  const functions = HELPER_DEFINITIONS.map((helper) => extractHelperDefinition(sql, helper));
  return {
    bytes: Buffer.byteLength(sql),
    sha256: sha256(sql),
    functions,
  };
}

export function validateQianchuanParseHelperForwardMigrationAsset({
  forwardMigrationPath,
  forwardMigrationSql,
  historicalMigrationSql,
}) {
  if (forwardMigrationPath !== QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path) {
    throw new Error('Parse-helper forward migration path differs from the staged repository identity.');
  }
  const historical = validateQianchuanParseHelperForwardMigrationSql(historicalMigrationSql);
  const forward = validateQianchuanParseHelperForwardMigrationSql(forwardMigrationSql);
  if (historical.sha256 !== TARGET_CHECKSUM
    || forward.sha256 !== historical.sha256
    || forward.bytes !== historical.bytes
    || JSON.stringify(forward.functions) !== JSON.stringify(historical.functions)) {
    throw new Error('Parse-helper forward migration must preserve the exact reviewed function-only SQL.');
  }
  return {
    identity: QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.identity,
    path: QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path,
    bytes: forward.bytes,
    sha256: forward.sha256,
    functions: forward.functions,
  };
}

export function validateQianchuanParseHelperRuntimeSelfDdlSource(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) < 10000) {
    throw new Error('Qianchuan report runtime source is missing or unexpectedly small.');
  }
  const selfProvisioningCallCount = exactMatches(source, /_ensure_parse_functions\(conn\)/g);
  const selfProvisioningDefinitionCount = exactMatches(
    source,
    /def _ensure_parse_functions\(conn: Any\) -> None:/g,
  );
  const runtimeDdlFunctionCount = exactMatches(
    source,
    /CREATE OR REPLACE FUNCTION public\.marketing_content_parse_[a-z]+\(value TEXT\)/g,
  );
  if (selfProvisioningCallCount !== 1 || selfProvisioningDefinitionCount !== 1
    || runtimeDdlFunctionCount !== HELPER_DEFINITIONS.length) {
    throw new Error('Qianchuan report runtime no longer matches the pinned self-DDL boundary.');
  }
  for (const token of REQUIRED_RUNTIME_CALLSITES) {
    if (!source.includes(token)) {
      throw new Error(`Qianchuan report runtime is missing parse-helper callsite ${token}.`);
    }
  }
  return {
    path: RUNTIME_SOURCE,
    bytes: Buffer.byteLength(source),
    sha256: sha256(source),
    selfProvisioningCallCount,
    selfProvisioningDefinitionCount,
    runtimeDdlFunctionCount,
    dwdHelperCallsitesPreserved: true,
  };
}

function validateObservedBoundary(probe) {
  validateQianchuanProductionMigrationP1dReadonlyProbe(probe);
  const entry = probe.entryEvidence.find((value) => value.family === 'qianchuan_parse_helpers');
  const routineBySignature = new Map((probe.catalog?.routines ?? []).map((routine) => (
    [routine.signature, routine]
  )));
  const helpersPresent = HELPER_DEFINITIONS.filter((helper) => (
    routineBySignature.get(helper.signature)?.present === true
  )).length;
  const rawRows = asCount(probe.dataShapes?.qianchuanParse?.rawRows, 'Qianchuan raw rows');
  const dwdRows = asCount(probe.dataShapes?.qianchuanParse?.dwdRows, 'Qianchuan DWD rows');
  const qianchuanDwdRows = asCount(
    probe.dataShapes?.qianchuanParse?.qianchuanDwdRows,
    'Qianchuan scoped DWD rows',
  );
  if (!entry || entry.evidenceState !== 'missing_runtime_contract_on_dormant_data_path'
    || entry.decision !== null || entry.reviewer !== null
    || JSON.stringify(entry.entries) !== JSON.stringify([TARGET_IDENTITY])
    || helpersPresent !== 0 || rawRows !== 0 || dwdRows !== 0 || qianchuanDwdRows !== 0) {
    throw new Error('P1D probe differs from the dormant parse-helper forward-contract boundary.');
  }
  return { dwdRows, helpersPresent, qianchuanDwdRows, rawRows };
}

export function buildQianchuanParseHelperForwardContractPlan({
  historicalMigrationSql,
  now = () => new Date(),
  probe,
  probeArtifact,
  probeSha256,
  runtimeSource,
}) {
  assertPinnedMigrationReviewArtifact(probeArtifact, probeSha256, 'P1D owner-review probe');
  const observed = validateObservedBoundary(probe);
  const migration = validateQianchuanParseHelperForwardMigrationSql(historicalMigrationSql);
  if (migration.sha256 !== TARGET_CHECKSUM) {
    throw new Error(`${TARGET_IDENTITY} repository checksum differs from the pinned source.`);
  }
  const runtime = validateQianchuanParseHelperRuntimeSelfDdlSource(runtimeSource);

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'offline_qianchuan_parse_helper_forward_contract_plan',
    target: {
      identity: TARGET_IDENTITY,
      checksum: TARGET_CHECKSUM,
      source: TARGET_SOURCE,
    },
    sourceArtifact: probeArtifact,
    repositoryEvidence: {
      historicalMigration: {
        path: TARGET_SOURCE,
        bytes: migration.bytes,
        sha256: migration.sha256,
      },
      runtime,
    },
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      migrationApplyAuthorized: false,
      runtimeTransitionAuthorized: false,
      ownerDecisionRecorded: false,
      deployAuthorized: false,
      arkInvoked: false,
      historicalMigrationReplayRecommended: false,
    },
    decision: {
      forwardContractPlanReady: true,
      recommendedStrategy: 'forward_migration_then_readonly_postcheck_then_remove_runtime_self_ddl',
      rationale: 'The three helpers are absent on a dormant zero-row path, while current Python still creates and commits them at runtime before DWD writes.',
    },
    observed: {
      snapshotAt: probe.generatedAt,
      helpersPresent: observed.helpersPresent,
      rawRows: observed.rawRows,
      dwdRows: observed.dwdRows,
      qianchuanDwdRows: observed.qianchuanDwdRows,
      currentRuntimeSelfDdl: true,
    },
    execution: {
      phaseOrder: [...PHASE_ORDER],
      preflight: {
        repeatP1dReadOnlyProbe: true,
        requireExactArtifactSha256: probeArtifact.sha256,
        requireCleanPushedMainAndShaParity: true,
        requireExplicitProductionSchemaWriteAuthorization: true,
        abortIfAnyHelperAlreadyExists: true,
        abortIfRawOrDwdRowsBecomeNonzero: true,
      },
      forwardMigration: {
        newTimestampedMigrationRequired: true,
        migrationBasename: FORWARD_MIGRATION_BASENAME,
        historicalMigrationReplay: false,
        functionOnlyDdl: true,
        sql: historicalMigrationSql,
        definitionBytes: migration.bytes,
        definitionSha256: migration.sha256,
        functions: migration.functions,
        lockTimeoutMs: 5000,
        statementTimeoutMs: 30000,
        tableDmlAllowed: false,
        commitByCallerOnly: true,
      },
      readonlyPostcheck: {
        independentProcessRequired: true,
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        helpersPresent: HELPER_DEFINITIONS.length,
        routineKind: 'f',
        language: 'plpgsql',
        volatility: 'immutable',
        semanticChecks: [
          'numeric strips commas, currency markers and whitespace; invalid input returns null',
          'bigint delegates to numeric and returns bigint or null',
          'rate accepts percent text, whole-number percent and decimal ratio inputs',
        ],
      },
      runtimeTransition: {
        applyOnlyAfterReadonlyPostcheck: true,
        source: RUNTIME_SOURCE,
        sourceSha256: runtime.sha256,
        removeCall: '_ensure_parse_functions(conn)',
        removeDefinition: 'def _ensure_parse_functions(conn: Any) -> None:',
        removeRuntimeDdlFunctions: HELPER_DEFINITIONS.length,
        preserveDwdHelperCallsites: true,
        eliminateOutOfBandCommit: true,
        applicationDeployRequiresSeparateAuthorization: true,
      },
      dormantPathSmoke: {
        runAfterMigrationAndRuntimeTransition: true,
        fixtureOrDryRunFirst: true,
        productionImportAuthorized: false,
        expectedRawRowsBeforeActivation: 0,
        expectedQianchuanDwdRowsBeforeActivation: 0,
      },
    },
    rollback: {
      separateForwardRollbackArtifactRequired: true,
      dataRestoreRequired: false,
      functionRemovalDefault: false,
      functionRemovalRequiresDependencyProofAndSeparateAuthorization: true,
      applicationRollbackMayLeaveFunctionsInstalled: true,
      neverRestoreRuntimeSelfDdlAsFallback: true,
      order: [
        'stop activation of the dormant qianchuan report path',
        'roll back application code only if required while leaving compatible helper functions installed',
        'prove all function dependencies before any separately authorized function removal',
      ],
      neverMutateHistoricalMigrationOrLedger: true,
    },
    authorizationBoundaries: {
      forwardMigrationApplyRequiresProductionSchemaWriteAuthorization: true,
      runtimeSelfDdlRemovalRequiresReviewedPostcheck: true,
      applicationDeployRequiresSeparateAuthorization: true,
      ownerDecisionRequiresSeparateAcceptance: true,
      arkRequiresSeparateAuthorization: true,
    },
  };
}

export function validateQianchuanParseHelperForwardContractPlan(plan) {
  if (plan?.schemaVersion !== 1
    || plan.mode !== 'offline_qianchuan_parse_helper_forward_contract_plan'
    || plan.target?.identity !== TARGET_IDENTITY
    || plan.target?.checksum !== TARGET_CHECKSUM
    || plan.target?.source !== TARGET_SOURCE
    || plan.decision?.forwardContractPlanReady !== true
    || plan.decision?.recommendedStrategy
      !== 'forward_migration_then_readonly_postcheck_then_remove_runtime_self_ddl') {
    throw new Error('Parse-helper forward-contract plan structure is invalid.');
  }
  if (plan.policy?.networkAccess !== false
    || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.migrationApplyAuthorized !== false
    || plan.policy?.runtimeTransitionAuthorized !== false
    || plan.policy?.ownerDecisionRecorded !== false
    || plan.policy?.deployAuthorized !== false
    || plan.policy?.arkInvoked !== false
    || plan.policy?.historicalMigrationReplayRecommended !== false) {
    throw new Error('Parse-helper forward-contract plan policy is unsafe.');
  }
  const migration = validateQianchuanParseHelperForwardMigrationSql(
    plan.execution?.forwardMigration?.sql,
  );
  const runtime = plan.repositoryEvidence?.runtime;
  if (!/^[a-f0-9]{64}$/.test(plan.sourceArtifact?.sha256 ?? '')
    || migration.sha256 !== TARGET_CHECKSUM
    || plan.repositoryEvidence?.historicalMigration?.sha256 !== migration.sha256
    || plan.repositoryEvidence?.historicalMigration?.bytes !== migration.bytes
    || runtime?.path !== RUNTIME_SOURCE
    || !/^[a-f0-9]{64}$/.test(runtime?.sha256 ?? '')
    || runtime?.selfProvisioningCallCount !== 1
    || runtime?.selfProvisioningDefinitionCount !== 1
    || runtime?.runtimeDdlFunctionCount !== HELPER_DEFINITIONS.length
    || JSON.stringify(plan.execution?.phaseOrder) !== JSON.stringify(PHASE_ORDER)
    || plan.observed?.helpersPresent !== 0
    || plan.observed?.rawRows !== 0
    || plan.observed?.dwdRows !== 0
    || plan.observed?.qianchuanDwdRows !== 0
    || plan.execution?.forwardMigration?.definitionSha256 !== migration.sha256
    || plan.execution?.forwardMigration?.definitionBytes !== migration.bytes
    || JSON.stringify(plan.execution?.forwardMigration?.functions) !== JSON.stringify(migration.functions)
    || plan.execution?.forwardMigration?.historicalMigrationReplay !== false
    || plan.execution?.forwardMigration?.functionOnlyDdl !== true
    || plan.execution?.forwardMigration?.tableDmlAllowed !== false
    || plan.execution?.readonlyPostcheck?.helpersPresent !== HELPER_DEFINITIONS.length
    || plan.execution?.readonlyPostcheck?.semanticChecks?.length !== HELPER_DEFINITIONS.length
    || plan.execution?.preflight?.requireExactArtifactSha256 !== plan.sourceArtifact.sha256
    || plan.execution?.runtimeTransition?.applyOnlyAfterReadonlyPostcheck !== true
    || plan.execution?.runtimeTransition?.sourceSha256 !== runtime.sha256
    || plan.execution?.runtimeTransition?.removeRuntimeDdlFunctions !== HELPER_DEFINITIONS.length
    || plan.execution?.runtimeTransition?.preserveDwdHelperCallsites !== true
    || plan.execution?.runtimeTransition?.eliminateOutOfBandCommit !== true
    || plan.execution?.dormantPathSmoke?.productionImportAuthorized !== false
    || plan.rollback?.dataRestoreRequired !== false
    || plan.rollback?.functionRemovalDefault !== false
    || plan.rollback?.neverRestoreRuntimeSelfDdlAsFallback !== true
    || plan.authorizationBoundaries?.ownerDecisionRequiresSeparateAcceptance !== true
    || plan.authorizationBoundaries?.applicationDeployRequiresSeparateAuthorization !== true
    || plan.authorizationBoundaries?.arkRequiresSeparateAuthorization !== true) {
    throw new Error('Parse-helper forward-contract execution or rollback boundary is incomplete.');
  }
  return plan;
}
