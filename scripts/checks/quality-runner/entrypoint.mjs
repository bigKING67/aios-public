#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-entrypoint');

const ENTRYPOINT_MAX_LINES = 90;
const ALLOWED_IMPORTS = Object.freeze([
  'node:process',
  './lib/quality/quality-runner-actions.mjs',
  './lib/quality/quality-runner-args.mjs',
]);

const FORBIDDEN_ENTRYPOINT_DETAILS = Object.freeze([
  'buildQualityGateRegistry',
  'createQualityManifestSnapshot',
  'runQualityGates',
  'selectAffectedGates',
  'summarizeQualityEvents',
]);

function importSpecifiers(source) {
  return [...source.matchAll(/^\s*import(?:[\s\S]*?)from\s+['"]([^'"]+)['"];|^\s*import\s+['"]([^'"]+)['"];/gmu)]
    .map((match) => match[1] ?? match[2])
    .filter(Boolean);
}

export function runQualityRunnerEntrypointBehaviorCheck(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const entrypointPath = path.join(repoRoot, 'scripts/quality-runner.mjs');
  const actionsPath = path.join(repoRoot, 'scripts/lib/quality/quality-runner-actions.mjs');
  const source = readFileSync(entrypointPath, 'utf8');
  const actionsSource = readFileSync(actionsPath, 'utf8');
  const lines = source.trimEnd().split(/\r?\n/u);

  assertTrue(
    source.startsWith('#!/usr/bin/env node\n'),
    'quality-runner entrypoint should stay directly executable',
  );
  assertTrue(
    lines.length <= ENTRYPOINT_MAX_LINES,
    `quality-runner entrypoint should stay thin; expected <= ${ENTRYPOINT_MAX_LINES} lines, got ${lines.length}`,
  );
  assertEqual(
    importSpecifiers(source).sort().join('\n'),
    [...ALLOWED_IMPORTS].sort().join('\n'),
    'quality-runner entrypoint imports should stay limited to CLI wiring modules',
  );

  for (const forbidden of FORBIDDEN_ENTRYPOINT_DETAILS) {
    assertFalse(
      source.includes(forbidden),
      `quality-runner entrypoint must not own implementation detail ${forbidden}`,
    );
  }

  for (const exported of [
    'benchmarkGate',
    'createGateEnv',
    'explainAffected',
    'formatFailedGateAffectedContext',
    'listMode',
    'printStats',
    'printRemoteCacheDoctor',
    'runGate',
    'runRemoteCacheCommand',
    'modeGateNames',
    'resolveStatsSince',
  ]) {
    assertIncludes(source, exported, `quality-runner entrypoint should keep compatibility export ${exported}`);
  }

  for (const action of [
    'export async function benchmarkGate',
    'export function printRemoteCacheDoctor',
    'export async function runRemoteCacheCommand',
    'export async function runMode',
    'export async function runGate',
    'export function listMode',
    'export function explainAffected',
    'export function printStats',
    'export function writeManifest',
  ]) {
    assertIncludes(actionsSource, action, `quality-runner action module should own ${action}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerEntrypointBehaviorCheck();
  reportOk(`entrypoint boundary passed; scripts/quality-runner.mjs <= ${ENTRYPOINT_MAX_LINES} lines and only wires CLI actions.`);
}
