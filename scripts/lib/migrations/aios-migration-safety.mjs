const DATABASE_URI_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi;
const SENSITIVE_PARAM_PATTERN = /([?&](?:password|pass|pwd|token|secret)=)[^&#\s]*/gi;
const AIOS_MIGRATION_COMMAND_OPTIONS = Object.freeze({
  apply: Object.freeze(['--confirm-apply', '--only']),
  baseline: Object.freeze(['--confirm-baseline']),
  plan: Object.freeze([]),
  verify: Object.freeze(['--require-clean']),
});

export function validateAiosMigrationIdentity(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid migration identity ${JSON.stringify(value)}; expected <namespace>/<version>.`);
  }
  return value;
}

export function parseAiosMigrationArgs(args) {
  const [command, ...options] = args;
  if (!command || command === '--help' || command === '-h') return { help: true };
  const allowed = AIOS_MIGRATION_COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`Unsupported migration command: ${command}.`);
  const parsed = {
    command,
    confirmed: false,
    requireNoPending: false,
  };
  const unknown = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (!allowed.includes(option)) {
      unknown.push(option);
      continue;
    }
    if (option === '--only') {
      if (parsed.targetIdentity) throw new Error('Migration option --only may be provided only once.');
      const targetIdentity = options[index + 1];
      if (!targetIdentity || targetIdentity.startsWith('--')) {
        throw new Error('Migration option --only requires <namespace>/<version>.');
      }
      parsed.targetIdentity = validateAiosMigrationIdentity(targetIdentity);
      index += 1;
      continue;
    }
    if (option === `--confirm-${command}`) parsed.confirmed = true;
    if (option === '--require-clean') parsed.requireNoPending = true;
  }
  if (unknown.length) throw new Error(`Unknown migration option(s) for ${command}: ${unknown.join(', ')}.`);
  return parsed;
}

export function redactMigrationText(value) {
  return String(value ?? '')
    .replace(DATABASE_URI_PATTERN, '[redacted-database-url]')
    .replace(SENSITIVE_PARAM_PATTERN, '$1[redacted]');
}

export function assertMigrationWriteAcknowledged({ command, confirmed, writeAck }) {
  if (command !== 'baseline' && command !== 'apply') return;
  if (!confirmed || writeAck !== command) {
    throw new Error(
      `${command} requires --confirm-${command} and AIOS_MIGRATION_WRITE_ACK=${command}.`,
    );
  }
}
