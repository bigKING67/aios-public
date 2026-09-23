import process from 'node:process';

import {
  defaultParallelism,
} from './quality-scheduler.mjs';

const MAX_BENCHMARK_RUNS = 10;

export const KNOWN_RUN_MODES = Object.freeze(new Set([
  'affected',
  'quick',
  'prepush',
  'ci',
  'frontend',
  'backend',
  'runtime',
  'release',
]));

export function printUsage(output = process.stderr) {
  output.write(`${[
    'Usage:',
    '  node scripts/quality-runner.mjs run <affected|quick|prepush|ci|frontend|backend|runtime|release> [--list] [--compact] [--json] [--verbose] [--no-cache] [--parallel N] [--base REF] [--head REF] [--changed-files a,b] [--remote-cache-path DIR|--remote-cache-url URL] [--remote-cache-mode read|readwrite]',
    '  node scripts/quality-runner.mjs gate <gate-name> [--list] [--compact] [--json] [--verbose] [--no-cache] [--parallel N] [--remote-cache-path DIR|--remote-cache-url URL] [--remote-cache-mode read|readwrite]',
    '  node scripts/quality-runner.mjs list [mode] [--compact]',
    '  node scripts/quality-runner.mjs explain affected [--summary] [--why GATE] [--base REF] [--head REF] [--changed-files a,b]',
    '  node scripts/quality-runner.mjs benchmark <gate-name> [--runs N] [--json] [--verbose]',
    '  node scripts/quality-runner.mjs bench <gate-name> [--runs N] [--json] [--verbose]',
    '  node scripts/quality-runner.mjs remote-cache doctor [--json] [--remote-cache-path DIR|--remote-cache-url URL] [--remote-cache-mode read|readwrite]',
    '  node scripts/quality-runner.mjs remote-cache env [--json] [--health-only] [--remote-cache-path DIR|--remote-cache-url URL] [--remote-cache-mode read|readwrite]',
    '  node scripts/quality-runner.mjs remote-cache activate [--json] [--health-only] [--remote-cache-path DIR|--remote-cache-url URL] [--remote-cache-mode read|readwrite]',
    '  node scripts/quality-runner.mjs remote-cache smoke [--json] [--remote-cache-path DIR|--remote-cache-url URL] [--verbose]',
    '  node scripts/quality-runner.mjs remote-cache setup [--json] [--remote-cache-path DIR|--remote-cache-url URL]',
    '  node scripts/quality-runner.mjs manifest <affected|quick|prepush|ci|frontend|backend|runtime|release> [--json] [--base REF] [--head REF] [--changed-files a,b]',
    '  node scripts/quality-runner.mjs stats [--action-plan] [--print-next-command] [--json] [--fail-on-action-severity info|warn|error] [--slow N] [--limit N] [--since ISO_TIMESTAMP] [--since-commit REF]',
  ].join('\n')}\n`);
}

export function parseArgs(argv) {
  const positionals = [];
  const options = {
    cache: true,
    actionPlan: false,
    changedFiles: null,
    compact: false,
    json: false,
    help: false,
    failOnActionSeverity: null,
    list: false,
    limit: null,
    parallel: defaultParallelism(),
    printNextCommand: false,
    remoteCacheMode: null,
    remoteCacheHealthOnly: false,
    remoteCachePath: null,
    remoteCacheUrl: null,
    runs: null,
    slowLimit: null,
    summary: false,
    summaryOnly: false,
    since: null,
    sinceCommit: null,
    verbose: false,
    why: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--compact') {
      options.compact = true;
    } else if (arg === '--summary') {
      options.summary = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--summary-only') {
      options.summaryOnly = true;
    } else if (arg === '--action-plan') {
      options.actionPlan = true;
    } else if (arg === '--print-next-command') {
      options.printNextCommand = true;
    } else if (arg === '--fail-on-action-severity') {
      options.failOnActionSeverity = argv[++index];
      if (!['info', 'warn', 'error'].includes(options.failOnActionSeverity)) {
        throw new Error('--fail-on-action-severity must be info, warn, or error');
      }
    } else if (arg === '--no-cache') {
      options.cache = false;
      process.env.AIOS_QUALITY_NO_CACHE = '1';
    } else if (arg === '--parallel') {
      options.parallel = Number.parseInt(argv[++index], 10);
      if (!Number.isInteger(options.parallel) || options.parallel <= 0) {
        throw new Error('--parallel must be a positive integer');
      }
    } else if (arg === '--runs') {
      options.runs = Number.parseInt(argv[++index], 10);
      if (!Number.isInteger(options.runs) || options.runs <= 0 || options.runs > MAX_BENCHMARK_RUNS) {
        throw new Error(`--runs must be an integer between 1 and ${MAX_BENCHMARK_RUNS}`);
      }
    } else if (arg === '--remote-cache-path') {
      options.remoteCachePath = argv[++index];
      if (!options.remoteCachePath) {
        throw new Error('--remote-cache-path requires a directory path');
      }
    } else if (arg === '--health-only') {
      options.remoteCacheHealthOnly = true;
    } else if (arg === '--remote-cache-url') {
      options.remoteCacheUrl = argv[++index];
      if (!options.remoteCacheUrl) {
        throw new Error('--remote-cache-url requires a URL');
      }
    } else if (arg === '--remote-cache-mode') {
      options.remoteCacheMode = argv[++index];
      if (!['read', 'readwrite'].includes(options.remoteCacheMode)) {
        throw new Error('--remote-cache-mode must be read or readwrite');
      }
    } else if (arg === '--base') {
      options.base = argv[++index];
      if (!options.base) {
        throw new Error('--base requires a value');
      }
    } else if (arg === '--head') {
      options.head = argv[++index];
      if (!options.head) {
        throw new Error('--head requires a value');
      }
    } else if (arg === '--changed-files') {
      options.changedFiles = argv[++index]?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
    } else if (arg === '--why') {
      options.why = argv[++index];
      if (!options.why) {
        throw new Error('--why requires a gate name');
      }
    } else if (arg === '--slow') {
      options.slowLimit = Number.parseInt(argv[++index], 10);
      if (!Number.isInteger(options.slowLimit) || options.slowLimit <= 0) {
        throw new Error('--slow must be a positive integer');
      }
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(argv[++index], 10);
      if (!Number.isInteger(options.limit) || options.limit <= 0) {
        throw new Error('--limit must be a positive integer');
      }
    } else if (arg === '--since') {
      options.since = argv[++index];
      if (!options.since || Number.isNaN(Date.parse(options.since))) {
        throw new Error('--since must be a valid timestamp');
      }
    } else if (arg === '--since-commit') {
      options.sinceCommit = argv[++index];
      if (!options.sinceCommit) {
        throw new Error('--since-commit requires a git ref');
      }
    } else {
      positionals.push(arg);
    }
  }

  return { options, positionals };
}
