#!/usr/bin/env node

import { existsSync } from 'node:fs';

import {
  assertAiosMigrationDatabaseBinding,
  BOUND_AIOS_MIGRATION_DESCRIPTOR_PATHS,
  DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH,
  readAiosMigrationDescriptor,
  resolveAiosMigrationDescriptorPath,
} from '../../lib/migrations/aios-migration-descriptor.mjs';
import {
  discoverAiosMigrations,
  summarizeAiosMigrations,
} from '../../lib/migrations/aios-migration-discovery.mjs';
import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const BQL_DESCRIPTOR_PATH = 'scripts/config/migrations/bql-aios-migrations.json';
const { assert, assertEqual, assertIncludes, reportError, reportOk } = createCheckGuard('bql-aios-migrations');

function bindingError(input) {
  try {
    assertAiosMigrationDatabaseBinding(input);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

try {
  const defaultDescriptor = readAiosMigrationDescriptor();
  const bqlDescriptor = readAiosMigrationDescriptor(BQL_DESCRIPTOR_PATH);
  assertIncludes(BOUND_AIOS_MIGRATION_DESCRIPTOR_PATHS.join(','), BQL_DESCRIPTOR_PATH, 'bql descriptor is registered as bound');
  assertEqual(bqlDescriptor.databaseName, 'bql_aios', 'bql descriptor binds bql_aios');
  assertEqual(defaultDescriptor.databaseName, undefined, 'default descriptor stays unbound');
  assert(
    bqlDescriptor.advisoryLockKey !== defaultDescriptor.advisoryLockKey,
    'bql descriptor uses its own advisory lock key',
  );
  for (const [namespace, config] of Object.entries(bqlDescriptor.namespaces)) {
    assert(existsSync(config.directory), `bql ${namespace} directory ${config.directory} exists`);
    assert(
      !Object.values(defaultDescriptor.namespaces).some((other) => other.directory === config.directory),
      `bql ${namespace} directory is not shared with the default descriptor`,
    );
  }

  const records = discoverAiosMigrations({ descriptor: bqlDescriptor });
  const baseline = records.find((record) => record.namespace === 'backend' && record.version === '001');
  assert(baseline, 'bql backend/001 baseline exists');
  assertEqual(baseline.executionMode, 'transactional', 'bql baseline runs inside the runner transaction');

  assertEqual(resolveAiosMigrationDescriptorPath({}), DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH, 'no env selects default');
  assertEqual(
    resolveAiosMigrationDescriptorPath({ AIOS_MIGRATION_DESCRIPTOR: BQL_DESCRIPTOR_PATH }),
    BQL_DESCRIPTOR_PATH,
    'env selects the registered bql descriptor',
  );
  let unregistered = '';
  try {
    resolveAiosMigrationDescriptorPath({ AIOS_MIGRATION_DESCRIPTOR: 'tmp/other.json' });
  } catch (error) {
    unregistered = error.message;
  }
  assertIncludes(unregistered, 'registered descriptor', 'unregistered descriptor paths are rejected');

  const boundDescriptors = [bqlDescriptor];
  assertEqual(bindingError({ descriptor: bqlDescriptor, databaseName: 'bql_aios', boundDescriptors }), '', 'bql on bql_aios');
  assertIncludes(
    bindingError({ descriptor: bqlDescriptor, databaseName: 'groland', boundDescriptors }),
    'bound to bql_aios',
    'bql descriptor refuses groland',
  );
  assertIncludes(
    bindingError({ descriptor: defaultDescriptor, databaseName: 'bql_aios', boundDescriptors }),
    'bound to its own migration descriptor',
    'default descriptor refuses bql_aios',
  );
  assertEqual(bindingError({ descriptor: defaultDescriptor, databaseName: 'groland', boundDescriptors }), '', 'default on groland');

  const summary = summarizeAiosMigrations(records);
  reportOk(`backend=${summary.backend?.total ?? 0}, warehouse=${summary.warehouse?.total ?? 0}; binding=bql_aios.`);
} catch (error) {
  reportError(error);
}
