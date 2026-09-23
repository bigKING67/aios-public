#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import {
  discoverAiosMigrations,
  summarizeAiosMigrations,
} from '../../lib/migrations/aios-migration-discovery.mjs';

const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const ledgerDdl = readFileSync('scripts/config/migrations/aios-schema-migrations.sql', 'utf8');
const failures = [];
const targetedTransactionalMigrations = [
  'backend/014',
  'backend/017',
  'warehouse/20260726_1600',
];
for (const snippet of [
  'public.aios_schema_migrations',
  'PRIMARY KEY (namespace, version)',
  "CHECK (namespace IN ('backend', 'warehouse'))",
  "checksum ~ '^[a-f0-9]{64}$'",
  'COMMENT ON TABLE public.aios_schema_migrations',
]) {
  if (!ledgerDdl.includes(snippet)) failures.push(`ledger DDL is missing ${JSON.stringify(snippet)}.`);
}
for (const identity of targetedTransactionalMigrations) {
  const [namespace, version] = identity.split('/');
  const record = records.find((candidate) => (
    candidate.namespace === namespace && candidate.version === version
  ));
  if (!record) {
    failures.push(`targeted migration ${identity} is missing.`);
  } else if (record.executionMode !== 'transactional') {
    failures.push(
      `targeted migration ${identity} must be transactional; got ${record.executionMode}.`,
    );
  }
}
if (failures.length) {
  console.error('[aios-migrations-filesystem] failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const summary = summarizeAiosMigrations(records);
  console.log(
    `[aios-migrations-filesystem] OK: backend=${summary.backend.total}, warehouse=${summary.warehouse.total}; `
    + `nontransactional=${(summary.backend.modes.nontransactional ?? 0) + (summary.warehouse.modes.nontransactional ?? 0)}; `
    + `targeted_transactional=${targetedTransactionalMigrations.length}.`,
  );
}
