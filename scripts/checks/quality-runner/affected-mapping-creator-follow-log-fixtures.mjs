import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertCreatorFollowLogAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const csvFrontend = selectAffectedGates(registry, ['apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-csv.ts']);
  assertTrue(
    csvFrontend.names.includes('verify:frontend:creator-library-csv-contract'),
    'creator CSV frontend helper changes should select the cross-layer CSV/XLSX contract gate',
  );
  assertTrue(
    csvFrontend.names.includes('type-check'),
    'creator CSV frontend helper changes should keep frontend core checks selected',
  );

  const xlsxFrontendApi = selectAffectedGates(registry, ['apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts']);
  assertTrue(
    xlsxFrontendApi.names.includes('verify:frontend:creator-library-csv-contract'),
    'creator XLSX frontend adapter changes should select the cross-layer CSV/XLSX contract gate',
  );

  const xlsxBackendParser = selectAffectedGates(registry, ['backend-rust/src/marketing/creator_library_xlsx/parser.rs']);
  assertTrue(
    xlsxBackendParser.names.includes('verify:frontend:creator-library-csv-contract'),
    'creator XLSX backend parser changes should select the cross-layer CSV/XLSX contract gate',
  );
  assertTrue(
    xlsxBackendParser.names.includes('verify:backend:check'),
    'creator XLSX backend parser changes should keep backend checks selected',
  );

  const csvBackendTypes = selectAffectedGates(registry, ['backend-rust/src/marketing/types/constants.rs']);
  assertTrue(
    csvBackendTypes.names.includes('verify:frontend:creator-library-csv-contract'),
    'creator CSV backend constants changes should select the cross-layer CSV/XLSX contract gate',
  );
  assertTrue(
    csvBackendTypes.names.includes('verify:backend:check'),
    'creator CSV backend constants changes should keep backend checks selected',
  );

  const csvContractCore = selectAffectedGates(registry, ['scripts/lib/frontend/creator-library-csv-contract-core.mjs']);
  assertTrue(
    csvContractCore.names.includes('verify:frontend:creator-library-csv-contract'),
    'creator CSV contract core changes should select the CSV/XLSX contract gate',
  );
  assertTrue(
    csvContractCore.names.includes('verify:frontend:structure-gate-registry'),
    'creator CSV contract core changes should select frontend structure registry guard',
  );
  assertTrue(csvContractCore.names.includes('lint:scripts'), 'creator CSV contract core changes should keep script lint coverage');
  assertFalse(csvContractCore.names.includes('verify:backend:size'), 'creator CSV contract core should not fall back to backend size gate');

  const followLogContractCore = selectAffectedGates(registry, ['scripts/lib/frontend/creator-library-follow-log-contract-core.mjs']);
  assertTrue(
    followLogContractCore.names.includes('verify:frontend:creator-library-follow-log-contract'),
    'creator follow log contract core changes should select the follow log contract gate',
  );
  assertTrue(
    followLogContractCore.names.includes('verify:frontend:structure-gate-registry'),
    'creator follow log contract core changes should select frontend structure registry guard',
  );
  assertTrue(
    followLogContractCore.names.includes('lint:scripts'),
    'creator follow log contract core changes should keep script lint coverage',
  );
  assertFalse(
    followLogContractCore.names.includes('verify:backend:size'),
    'creator follow log contract core should not fall back to backend size gate',
  );

  const followLogBackend = selectAffectedGates(registry, ['backend-rust/src/marketing/repository_follow_logs/query.rs']);
  assertTrue(
    followLogBackend.names.includes('verify:frontend:creator-library-follow-log-contract'),
    'creator follow log backend query changes should select the cross-layer follow log contract gate',
  );
  assertTrue(
    followLogBackend.names.includes('verify:backend:check'),
    'creator follow log backend query changes should keep backend checks selected',
  );

  const followLogSchemaCompat = selectAffectedGates(registry, ['backend-rust/src/schema_compat/creator_library_follow_log/table.rs']);
  assertTrue(
    followLogSchemaCompat.names.includes('verify:frontend:creator-library-follow-log-contract'),
    'creator follow log schema compatibility changes should select the cross-layer follow log contract gate',
  );

  const followLogMigration = selectAffectedGates(registry, ['etl/groland_postgres/sql/migrations/20260512_1030__influencer_library_follow_log_minute_timestamp.sql']);
  assertTrue(
    followLogMigration.names.includes('verify:frontend:creator-library-follow-log-contract'),
    'creator follow log migration changes should select the cross-layer follow log contract gate',
  );
  assertTrue(
    followLogMigration.names.includes('verify:dataops-config:sync'),
    'creator follow log migration changes should keep dataops config drift selected',
  );

  const followLogModal = selectAffectedGates(registry, ['apps/web-vite/src/app/marketing/creator-library/_components/creator-library-follow-modal.tsx']);
  assertTrue(
    followLogModal.names.includes('verify:frontend:creator-library-follow-log-contract'),
    'creator follow modal changes should select the cross-layer follow log contract gate',
  );
  assertTrue(
    followLogModal.names.includes('type-check'),
    'creator follow modal changes should keep frontend core checks selected',
  );
}
