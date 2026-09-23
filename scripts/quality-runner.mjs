#!/usr/bin/env node
import process from 'node:process';

import {
  KNOWN_RUN_MODES,
  parseArgs,
  printUsage,
} from './lib/quality/quality-runner-args.mjs';
import {
  benchmarkGate,
  explainAffected,
  listMode,
  printStats,
  runRemoteCacheCommand,
  runGate,
  runMode,
  writeManifest,
} from './lib/quality/quality-runner-actions.mjs';

export { benchmarkGate, createGateEnv, explainAffected, formatFailedGateAffectedContext, listMode, printRemoteCacheDoctor, printRemoteCacheEnv, printStats, runGate, runRemoteCacheCommand, modeGateNames, resolveStatsSince } from './lib/quality/quality-runner-actions.mjs';

async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (options.help || command === 'help') {
    printUsage(process.stdout);
    return;
  }

  if (command === 'run') {
    const mode = positionals[1];
    if (!KNOWN_RUN_MODES.has(mode)) {
      printUsage();
      process.exit(1);
    }
    await runMode(mode, options);
    return;
  }

  if (command === 'list') {
    listMode(positionals[1], options);
    return;
  }

  if (command === 'gate') {
    await runGate(positionals[1], options);
    return;
  }

  if (command === 'benchmark' || command === 'bench') {
    await benchmarkGate(positionals[1], options);
    return;
  }

  if (command === 'remote-cache') {
    await runRemoteCacheCommand(positionals[1], options);
    return;
  }

  if (command === 'explain' && positionals[1] === 'affected') {
    explainAffected(options);
    return;
  }

  if (command === 'stats') {
    printStats(options);
    return;
  }

  if (command === 'manifest') {
    writeManifest(positionals[1], options);
    return;
  }

  printUsage();
  process.exit(1);
}

if (process.argv[1]?.endsWith('/quality-runner.mjs') || process.argv[1] === 'scripts/quality-runner.mjs') {
  main().catch((error) => {
    console.error('[quality] failed:');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
