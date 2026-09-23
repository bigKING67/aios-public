import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanCardRatioReadonlyProbe } from './aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';

const TARGET_IDENTITY = 'warehouse/20260609_2045';
const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';
const BATCH_SIZE = 500;
const FALLBACK_WINDOW_DAYS = 14;
const MEBIBYTE = 1024 * 1024;

const TABLES = Object.freeze([
  Object.freeze({
    cursor: ['date', 'shop_name', 'shop_id', 'product_id'],
    dateField: 'date',
    detail: false,
    odsTable: 'ods.douyin_trade_sale_card_raw',
    primaryKey: ['shop_name', 'shop_id', 'date', 'product_id'],
    ratioFields: [
      'card_click_rate_user',
      'card_avg_click_per_user',
      'new_customer_click_rate',
      'old_customer_click_rate',
      'card_avg_order_value',
      'card_click_to_pay_rate_user',
      'first_buy_new_rate',
      'rebuy_old_rate',
      'card_exposure_to_pay_rate_user',
      'card_exposure_to_pay_rate_count',
      'card_gpm',
      'card_click_rate_count',
      'card_click_to_pay_rate_count',
    ],
    table: 'ads.douyin_trade_sale_card',
    touchField: 'card_click_rate_user',
  }),
  Object.freeze({
    cursor: ['stat_date', 'shop_id', 'product_id', 'source_level1'],
    dateField: 'stat_date',
    detail: true,
    odsTable: 'ods.douyin_trade_sale_card_detail_raw',
    primaryKey: ['shop_id', 'stat_date', 'product_id', 'source_level1'],
    ratioFields: [
      'card_exposure_to_pay_rate_user',
      'card_click_rate_user',
      'card_click_to_pay_rate_user',
    ],
    table: 'ads.douyin_trade_sale_card_detail',
    touchField: 'card_click_rate_user',
  }),
]);

const REFRESH_ROUTINES = Object.freeze([
  'ads.refresh_douyin_trade_sale_card(date,date)',
  'ads.refresh_douyin_trade_sale_card_detail(date,date)',
  'ads.refresh_douyin_trade_sale_card_dashboard_incremental(integer,boolean)',
]);

const GUARD_FUNCTIONS = Object.freeze([
  'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
  'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
]);

const GUARD_TRIGGERS = Object.freeze([
  'ads.douyin_trade_sale_card.trg_recompute_douyin_trade_sale_card_ratio_fields',
  'ads.douyin_trade_sale_card_detail.trg_recompute_douyin_trade_sale_card_detail_ratio_fields',
]);

const PHASE_ORDER = Object.freeze([
  'preflight',
  'backup',
  'forward_guard',
  'canary_refresh',
  'batched_backfill',
  'postcondition',
]);

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function indexBy(values, field) {
  return new Map(values.map((value) => [value[field], value]));
}

function parseDateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date;
}

function shiftDate(value, days) {
  const date = parseDateOnly(value, 'latest observed source date');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertImpactEvidence(probe) {
  const impactByTable = indexBy(probe.impact, 'table_name');
  const tables = TABLES.map((contract) => {
    const ads = impactByTable.get(contract.table);
    const ods = impactByTable.get(contract.odsTable);
    if (!ads || !ods || !Array.isArray(ads.daily_mismatches) || !Array.isArray(ods.daily_mismatches)) {
      throw new Error(`Card-ratio probe is missing impact evidence for ${contract.table}.`);
    }
    const adsRows = asCount(ads.rows, `${contract.table} rows`);
    const odsRows = asCount(ods.rows, `${contract.odsTable} rows`);
    const adsMismatchRows = asCount(ads.mismatch_rows, `${contract.table} mismatch rows`);
    const odsMismatchRows = asCount(ods.mismatch_rows, `${contract.odsTable} mismatch rows`);
    if (adsRows !== odsRows || adsMismatchRows !== odsMismatchRows || adsMismatchRows < 1) {
      throw new Error(`${contract.table} no longer mirrors the observed ODS formula drift.`);
    }
    parseDateOnly(ads.max_date, `${contract.table} max date`);
    return {
      ...contract,
      dailyMismatches: ads.daily_mismatches.map((row) => ({
        date: parseDateOnly(row.date, `${contract.table} daily mismatch date`).toISOString().slice(0, 10),
        mismatchRows: asCount(row.mismatchRows, `${contract.table} daily mismatch rows`),
      })),
      estimatedBackupBytes: asCount(
        ads.estimated_backup_bytes,
        `${contract.table} estimated backup bytes`,
      ),
      maxDate: ads.max_date,
      mismatchRows: adsMismatchRows,
      rows: adsRows,
    };
  });
  const observedAdsMismatchRows = tables.reduce((sum, table) => sum + table.mismatchRows, 0);
  if (observedAdsMismatchRows !== asCount(probe.summary.adsMismatchRows, 'ADS mismatch rows')
    || observedAdsMismatchRows !== asCount(probe.summary.odsMismatchRows, 'ODS mismatch rows')) {
    throw new Error('Card-ratio probe mismatch totals differ from the per-table impact evidence.');
  }
  return tables;
}

function assertParityEvidence(probe) {
  const parityByShape = indexBy(probe.parity, 'shape');
  return ['main', 'detail'].map((shape) => {
    const row = parityByShape.get(shape);
    if (!row) throw new Error(`Card-ratio probe is missing ${shape} parity evidence.`);
    const normalized = {
      baseMetricMismatchRows: asCount(row.base_metric_mismatch_rows, `${shape} base metric mismatches`),
      extraTargetRows: asCount(row.extra_target_rows, `${shape} extra target rows`),
      missingTargetRows: asCount(row.missing_target_rows, `${shape} missing target rows`),
      shape,
      sourceRows: asCount(row.source_rows, `${shape} source rows`),
      targetRows: asCount(row.target_rows, `${shape} target rows`),
    };
    if (normalized.sourceRows !== normalized.targetRows
      || normalized.missingTargetRows !== 0
      || normalized.extraTargetRows !== 0
      || normalized.baseMetricMismatchRows !== 0) {
      throw new Error(`${shape} ODS-to-ADS base-metric parity is not clean enough for forward repair.`);
    }
    return normalized;
  });
}

function assertRuntimeEvidence(probe) {
  const routineBySignature = indexBy(probe.catalog?.routines ?? [], 'signature');
  const refreshRoutines = REFRESH_ROUTINES.map((signature) => {
    const routine = routineBySignature.get(signature);
    if (!routine?.present || !/^[a-f0-9]{64}$/.test(routine.definitionSha256 ?? '')) {
      throw new Error(`Refresh routine ${signature} is absent or lacks pinned definition evidence.`);
    }
    return {
      definitionBytes: asCount(routine.definitionBytes, `${signature} definition bytes`),
      definitionSha256: routine.definitionSha256,
      signature,
    };
  });
  if (GUARD_FUNCTIONS.some((signature) => routineBySignature.get(signature)?.present)) {
    throw new Error('Card-ratio guard functions are already present; refresh the repair evidence.');
  }
  const triggerNames = new Set((probe.catalog?.triggers ?? []).map((trigger) => (
    `${trigger.table_name}.${trigger.trigger_name}`
  )));
  if (GUARD_TRIGGERS.some((identity) => triggerNames.has(identity))) {
    throw new Error('Card-ratio guard triggers are already present; refresh the repair evidence.');
  }
  return refreshRoutines;
}

function selectCanary(tables, activeWindowStart) {
  const candidates = new Map();
  for (const table of tables) {
    for (const row of table.dailyMismatches) {
      if (row.date >= activeWindowStart || row.mismatchRows < 1) continue;
      const candidate = candidates.get(row.date) ?? { byTable: {}, date: row.date, totalRows: 0 };
      candidate.byTable[table.table] = row.mismatchRows;
      candidate.totalRows += row.mismatchRows;
      candidates.set(row.date, candidate);
    }
  }
  const eligible = [...candidates.values()]
    .filter((candidate) => TABLES.every((table) => candidate.byTable[table.table] > 0))
    .sort((left, right) => left.totalRows - right.totalRows || left.date.localeCompare(right.date));
  if (eligible.length === 0) {
    throw new Error('No shared low-volume canary date exists outside the active refresh window.');
  }
  return eligible[0];
}

function buildTablePlan(table, canary) {
  return {
    canaryMismatchRows: canary.byTable[table.table],
    cursor: [...table.cursor],
    dateField: table.dateField,
    estimatedBatches: Math.ceil(table.mismatchRows / BATCH_SIZE),
    mismatchRows: table.mismatchRows,
    odsTable: table.odsTable,
    primaryKey: [...table.primaryKey],
    ratioFields: [...table.ratioFields],
    rows: table.rows,
    table: table.table,
    touchUpdate: {
      field: table.touchField,
      strategy: 'set_field_to_itself_to_invoke_canonical_before_update_guard',
    },
  };
}

export function buildQianchuanCardRatioRepairPlan({
  now = () => new Date(),
  probe,
  probeArtifact,
  probeSha256,
}) {
  assertPinnedMigrationReviewArtifact(probeArtifact, probeSha256, 'Card-ratio readiness probe');
  validateQianchuanCardRatioReadonlyProbe(probe);
  if (probe.target?.identity !== TARGET_IDENTITY || probe.target?.checksum !== TARGET_CHECKSUM) {
    throw new Error('Card-ratio readiness probe target differs from the repair-plan contract.');
  }
  if (asCount(probe.summary.waitingLocks, 'waiting locks') !== 0) {
    throw new Error('Card-ratio readiness probe observed waiting relation locks.');
  }
  const tables = assertImpactEvidence(probe);
  const parity = assertParityEvidence(probe);
  const refreshRoutines = assertRuntimeEvidence(probe);
  const latestSourceDate = tables.map((table) => table.maxDate).sort().at(-1);
  const activeWindowStart = shiftDate(latestSourceDate, -(FALLBACK_WINDOW_DAYS - 1));
  const canary = selectCanary(tables, activeWindowStart);
  const tablePlans = tables.map((table) => buildTablePlan(table, canary));
  const rawBackupPayloadBytes = tables.reduce((sum, table) => sum + table.estimatedBackupBytes, 0);
  const recommendedBackupCapacityBytes = Math.max(
    8 * MEBIBYTE,
    Math.ceil(rawBackupPayloadBytes * 2),
  );

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'offline_card_ratio_forward_repair_plan',
    target: { ...probe.target },
    sourceArtifact: probeArtifact,
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      repairExecutionAuthorized: false,
      backupCreated: false,
      ownerDecisionRecorded: false,
      deployAuthorized: false,
      arkInvoked: false,
      historicalMigrationReplayRecommended: false,
      newForwardMigrationRequired: true,
    },
    decision: {
      repairPlanReady: true,
      recommendedStrategy: 'forward_guard_then_canary_refresh_then_batched_backfill',
      rationale: 'ODS and ADS row/base metrics are in parity, stored ratios drift equally, and the refresh path mirrors ODS into ADS without the missing recompute guards.',
    },
    observed: {
      snapshotAt: probe.generatedAt,
      fallbackWindowDays: FALLBACK_WINDOW_DAYS,
      activeRefreshWindow: {
        end: latestSourceDate,
        start: activeWindowStart,
      },
      adsMismatchRows: asCount(probe.summary.adsMismatchRows, 'ADS mismatch rows'),
      odsMismatchRows: asCount(probe.summary.odsMismatchRows, 'ODS mismatch rows'),
      waitingLocks: 0,
      parity,
      refreshRoutines,
    },
    execution: {
      phaseOrder: [...PHASE_ORDER],
      preflight: {
        repeatReadOnlyProbe: true,
        abortOnWaitingLocks: true,
        requireHeadAndArtifactPins: true,
        requireExplicitProductionWriteAuthorization: true,
      },
      backup: {
        created: false,
        exactMismatchedRowsOnly: true,
        estimatedRows: asCount(probe.summary.adsMismatchRows, 'ADS mismatch rows'),
        rawPayloadBytes: rawBackupPayloadBytes,
        recommendedCapacityBytes: recommendedBackupCapacityBytes,
        evidenceColumns: ['backup_run_id', 'backed_up_at', 'source_xmin', 'updated_at'],
        includePerTable: tablePlans.map((table) => ({
          primaryKey: table.primaryKey,
          ratioFields: table.ratioFields,
          table: table.table,
        })),
        retainUntilOwnerSignoff: true,
      },
      forwardGuard: {
        ddlOnlyMigration: true,
        historicalMigrationReplay: false,
        functions: [...GUARD_FUNCTIONS],
        triggers: [...GUARD_TRIGGERS],
        lockTimeoutMs: 5000,
        statementTimeoutMs: 30000,
        fullTableDmlAllowed: false,
        postcondition: 'functions and enabled triggers are present before any canary or backfill write',
      },
      canary: {
        date: canary.date,
        mismatchRows: canary.totalRows,
        mismatchRowsByTable: canary.byTable,
        outsideActiveRefreshWindow: true,
        strategy: 'call_existing_date_window_refresh_procedures_after_guard_installation',
        commitOnlyAfter: [
          'row counts match the pre-canary snapshot',
          'base-metric parity remains zero-drift',
          'ADS formula mismatch rows for the canary date are zero',
        ],
      },
      batching: {
        maxRowsPerTransaction: BATCH_SIZE,
        expectedBatches: tablePlans.reduce((sum, table) => sum + table.estimatedBatches, 0),
        lockTimeoutMs: 2000,
        statementTimeoutMs: 30000,
        maxDeadlockOrSerializationRetries: 3,
        sleepBetweenBatchesMs: 100,
        transaction: 'one ordered cursor batch per transaction',
        skipLocked: false,
        tables: tablePlans,
      },
      postcondition: {
        adsFormulaMismatchRows: 0,
        sourceTargetRowCountDelta: 0,
        missingTargetRows: 0,
        extraTargetRows: 0,
        baseMetricMismatchRows: 0,
        functionsPresent: GUARD_FUNCTIONS.length,
        enabledTriggersPresent: GUARD_TRIGGERS.length,
        repeatIncrementalRefreshSmoke: true,
      },
    },
    rollback: {
      separateForwardRollbackArtifactRequired: true,
      guardRemovalFirst: true,
      restoreFromBackupInBatches: true,
      batchSize: BATCH_SIZE,
      order: [
        'stop the repair runner and coordinate the goods-card refresh deployment',
        'remove the two recompute triggers before restoring historical ratio values',
        'remove the two recompute functions after their triggers are absent',
        'restore ratio values from the pinned backup with short ordered transactions',
        'verify every restored ratio value against the backup and retain the backup',
      ],
      neverMutateHistoricalMigrationOrLedger: true,
    },
    authorizationBoundaries: {
      backupAndRepairRequireNewProductionWriteAuthorization: true,
      migrationApplyRequiresNewProductionWriteAuthorization: true,
      prefectPauseOrDeploymentChangeRequiresSeparateAuthorization: true,
      applicationDeployRequiresSeparateAuthorization: true,
      arkRequiresSeparateAuthorization: true,
    },
  };
}

export function validateQianchuanCardRatioRepairPlan(plan) {
  if (plan?.schemaVersion !== 1
    || plan.mode !== 'offline_card_ratio_forward_repair_plan'
    || plan.target?.identity !== TARGET_IDENTITY
    || plan.target?.checksum !== TARGET_CHECKSUM
    || plan.decision?.repairPlanReady !== true
    || plan.decision?.recommendedStrategy !== 'forward_guard_then_canary_refresh_then_batched_backfill') {
    throw new Error('Card-ratio repair plan structure is invalid.');
  }
  if (plan.policy?.networkAccess !== false
    || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.repairExecutionAuthorized !== false
    || plan.policy?.backupCreated !== false
    || plan.policy?.ownerDecisionRecorded !== false
    || plan.policy?.deployAuthorized !== false
    || plan.policy?.arkInvoked !== false
    || plan.policy?.historicalMigrationReplayRecommended !== false
    || plan.policy?.newForwardMigrationRequired !== true) {
    throw new Error('Card-ratio repair plan policy is unsafe.');
  }
  if (JSON.stringify(plan.execution?.phaseOrder) !== JSON.stringify(PHASE_ORDER)
    || plan.execution?.batching?.maxRowsPerTransaction !== BATCH_SIZE
    || plan.execution?.batching?.skipLocked !== false
    || plan.execution?.canary?.outsideActiveRefreshWindow !== true
    || plan.execution?.backup?.created !== false
    || plan.rollback?.guardRemovalFirst !== true
    || plan.authorizationBoundaries?.applicationDeployRequiresSeparateAuthorization !== true
    || plan.authorizationBoundaries?.arkRequiresSeparateAuthorization !== true) {
    throw new Error('Card-ratio repair plan execution or rollback boundary is incomplete.');
  }
  return plan;
}
