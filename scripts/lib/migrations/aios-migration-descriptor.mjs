import { readFileSync } from 'node:fs';

export const DEFAULT_AIOS_MIGRATION_DESCRIPTOR_PATH =
  'scripts/config/migrations/aios-migrations.json';

export function validateAiosMigrationDescriptor(descriptor) {
  if (descriptor?.schemaVersion !== 1) throw new Error('Migration descriptor schemaVersion must be 1.');
  if (descriptor.ledgerTable !== 'public.aios_schema_migrations') {
    throw new Error('Migration ledgerTable must be public.aios_schema_migrations.');
  }
  if (typeof descriptor.advisoryLockKey !== 'string' || !descriptor.advisoryLockKey.trim()) {
    throw new Error('Migration advisoryLockKey must be a non-empty string.');
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
