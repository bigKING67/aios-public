import { readFileSync } from 'node:fs';

export const DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH =
  'scripts/config/migrations/aios-migrations.json';

// Descriptors bound to one database by name. The default descriptor is unbound and
// must never run against these databases (an empty one would take the whole series).
export const BOUND_AIOS_MIGRATION_DESCRIPTOR_PATHS = Object.freeze([
  'scripts/config/migrations/bql-aios-migrations.json',
]);

export function validateAiosMigrationDescriptor(descriptor) {
  if (descriptor?.schemaVersion !== 1) throw new Error('Migration descriptor schemaVersion must be 1.');
  if (descriptor.ledgerTable !== 'public.aios_schema_migrations') {
    throw new Error('Migration ledgerTable must be public.aios_schema_migrations.');
  }
  if (typeof descriptor.advisoryLockKey !== 'string' || !descriptor.advisoryLockKey.trim()) {
    throw new Error('Migration advisoryLockKey must be a non-empty string.');
  }
  if (descriptor.databaseName !== undefined
    && (typeof descriptor.databaseName !== 'string' || !/^[a-z][a-z0-9_]*$/u.test(descriptor.databaseName))) {
    throw new Error('Migration databaseName must be a lowercase identifier when present.');
  }
  const namespaceNames = Object.keys(descriptor.namespaces ?? {}).sort();
  if (namespaceNames.join(',') !== 'backend,warehouse') {
    throw new Error('Migration descriptor must define exactly backend and warehouse namespaces.');
  }
  for (const namespace of namespaceNames) {
    const config = descriptor.namespaces[namespace];
    if (typeof config.directory !== 'string' || !config.directory.trim()) {
      throw new Error(`Migration namespace ${namespace} must define directory.`);
    }
    const pattern = new RegExp(config.versionPattern);
    if (pattern.exec('invalid.sql')) throw new Error(`Migration namespace ${namespace} versionPattern is too broad.`);
    if (!Array.isArray(config.nonTransactionalVersions)) {
      throw new Error(`Migration namespace ${namespace} nonTransactionalVersions must be an array.`);
    }
  }
  return descriptor;
}

export function readAiosMigrationDescriptor(
  filePath = DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH,
) {
  return validateAiosMigrationDescriptor(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function resolveAiosMigrationDescriptorPath(env = process.env) {
  const requested = env.AIOS_MIGRATION_DESCRIPTOR?.trim();
  if (!requested) return DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH;
  if (requested !== DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH
    && !BOUND_AIOS_MIGRATION_DESCRIPTOR_PATHS.includes(requested)) {
    throw new Error(`AIOS_MIGRATION_DESCRIPTOR must be a registered descriptor; got ${requested}.`);
  }
  return requested;
}

// Fails unless the connected database and the descriptor agree: a bound descriptor
// only runs on its database, and a bound database only runs its own descriptor.
export function assertAiosMigrationDatabaseBinding({
  descriptor,
  databaseName,
  boundDescriptors = BOUND_AIOS_MIGRATION_DESCRIPTOR_PATHS.map((filePath) => readAiosMigrationDescriptor(filePath)),
}) {
  if (descriptor.databaseName) {
    if (descriptor.databaseName !== databaseName) {
      throw new Error(`Migration descriptor is bound to ${descriptor.databaseName}; connected to ${databaseName}.`);
    }
    return;
  }
  const owner = boundDescriptors.find((candidate) => candidate.databaseName === databaseName);
  if (owner) {
    throw new Error(`Database ${databaseName} is bound to its own migration descriptor; set AIOS_MIGRATION_DESCRIPTOR.`);
  }
}
