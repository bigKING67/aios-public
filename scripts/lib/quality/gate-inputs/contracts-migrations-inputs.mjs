import {
  AIOS_GENERATED_TYPES_PATH,
  AIOS_OPENAPI_PATH,
  AIOS_RUST_ROUTE_SOURCES,
  AIOS_RUST_SCHEMA_SOURCES,
} from '../../../config/contracts/aios-api-contract.mjs';

const CONTRACT_GATE_INPUTS = Object.freeze([
  ...AIOS_RUST_ROUTE_SOURCES.map((descriptor) => descriptor.file),
  ...AIOS_RUST_SCHEMA_SOURCES.map((descriptor) => descriptor.file),
  'backend-rust/src/routes.rs',
  AIOS_OPENAPI_PATH,
  AIOS_GENERATED_TYPES_PATH,
  'apps/web-vite/src/lib/generated-api-contract.ts',
  'apps/web-vite/src/lib/request.ts',
  'apps/web-vite/src/lib/auth-session-recovery.ts',
  'apps/web-vite/src/hooks/use-auth.ts',
  'apps/web-vite/src/app/profile/_components/profile-page-client.tsx',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'docs/API_V2_CUTOVER_LEDGER.md',
  'scripts/config/contracts/**',
  'scripts/contracts/**',
  'scripts/lib/contracts/**',
]);

const MIGRATION_GATE_INPUTS = Object.freeze([
  'sql/migrations/**',
  'etl/groland_postgres/sql/migrations/**',
  'scripts/config/migrations/**',
  'scripts/migrations/**',
  'scripts/lib/migrations/**',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
]);

export function contractsMigrationsGateInputPatterns(name, context = {}) {
  const { checkGuardHelperInputs = [], scriptInputs = [], shared = [] } = context;
  if (name === 'verify:api-contract' || name === 'verify:api-contract-behavior') {
    return [...CONTRACT_GATE_INPUTS, ...scriptInputs, ...checkGuardHelperInputs, ...shared];
  }
  if (name === 'verify:migrations:aios'
    || name === 'verify:migrations:aios-identity-forward-cutover-behavior'
    || name === 'verify:migrations:aios-behavior'
    || name === 'verify:migrations:aios-ledger-bootstrap-behavior'
    || name === 'verify:migrations:aios-sample-inventory-forward-cutover-behavior'
    || name === 'verify:migrations:aios-sample-inventory-public-cutover-behavior'
    || name === 'verify:migrations:aios-sample-inventory-approval-stock-cutover-behavior'
    || name === 'verify:migrations:aios-agent-context-cutover-behavior'
    || name === 'verify:migrations:aios-taobao-goods-forward-cutover-behavior'
    || name === 'verify:migrations:aios-taobao-goods-schema-contract-forward-cutover-behavior') {
    return [...MIGRATION_GATE_INPUTS, ...scriptInputs, ...checkGuardHelperInputs, ...shared];
  }
  return null;
}
