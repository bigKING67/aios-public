#!/usr/bin/env node

/**
 * Design behavior gate registry audit.
 *
 * Design behavior gates protect policy scripts from turning into shallow
 * smoke checks. This registry keeps every non-weekly design behavior guard
 * wired into package scripts and verify:ci.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  assertGateRunOrder,
  assertRequiredFile,
  createCheckGuard,
  getRepoRoot,
  readRequiredPackageJson,
  readRequiredFile,
  repoFileExists,
  requireVerifyCiRunWithAdjacentLabel,
} from '../../lib/shared/guard-utils.mjs';
import {
  DESIGN_BEHAVIOR_EXPECTED_GATES,
  DESIGN_BEHAVIOR_FILE_PATTERN,
  DESIGN_BEHAVIOR_GATES,
} from '../../lib/design/design-behavior-gates.mjs';

const GUARD_NAME = 'design-behavior-gate-registry';
const EXPECTED_BEHAVIOR_GATES = DESIGN_BEHAVIOR_GATES;

const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function listDesignBehaviorFiles(repoRoot, options = {}) {
  const {
    dirExists = (relativeDir) => repoFileExists(repoRoot, relativeDir),
    listDirEntries = (relativeDir) => readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true }),
    statDir = (relativeDir) => statSync(path.join(repoRoot, relativeDir)),
  } = options;
  const relativeDir = 'scripts/checks/design';
  if (!dirExists(relativeDir) || !statDir(relativeDir).isDirectory()) {
    return [];
  }

  const files = [];
  function walk(currentDir) {
    const entries = listDirEntries(currentDir)
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = normalizeRepoPath(path.join(currentDir, entry.name));
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && DESIGN_BEHAVIOR_FILE_PATTERN.test(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  walk(relativeDir);
  return files.sort();
}

export function validateDesignBehaviorGate(gate, context) {
  const {
    fileExists = (file) => repoFileExists(context.repoRoot, file),
    scripts,
    verifyCiLines,
    verifyCiSource,
    findings,
    runLineByGate,
  } = context;

  if (scripts[gate.name] !== gate.command) {
    findings.push(
      `${gate.name} package script drifted; expected ${JSON.stringify(gate.command)}, got ${JSON.stringify(scripts[gate.name])}`,
    );
  }

  if (!fileExists(gate.file)) {
    findings.push(`${gate.name} target file is missing: ${gate.file}`);
  }

  const runLineNumber = requireVerifyCiRunWithAdjacentLabel(
    gate,
    verifyCiSource,
    verifyCiLines,
    findings,
  );
  if (runLineNumber === null) {
    return;
  }

  runLineByGate.set(gate.name, runLineNumber);
}

export function auditDesignBehaviorGateRegistry({
  designBehaviorFiles,
  repoRoot,
  scripts,
  verifyCiSource,
  expectedGates = EXPECTED_BEHAVIOR_GATES,
  orderedGates = DESIGN_BEHAVIOR_EXPECTED_GATES,
  fileExists = (file) => repoFileExists(repoRoot, file),
}) {
  const verifyCiLines = verifyCiSource.split('\n');
  const expectedBehaviorFiles = new Set(expectedGates.map((gate) => gate.file));
  const findings = [];
  const runLineByGate = new Map();
  const context = {
    fileExists,
    findings,
    repoRoot,
    runLineByGate,
    scripts,
    verifyCiLines,
    verifyCiSource,
  };

  for (const behaviorFile of designBehaviorFiles) {
    if (!expectedBehaviorFiles.has(behaviorFile)) {
      findings.push(`${behaviorFile} is a design behavior guard but is not registered in ${GUARD_NAME}`);
    }
  }

  for (const expectedFile of expectedBehaviorFiles) {
    if (!designBehaviorFiles.includes(expectedFile)) {
      findings.push(`${expectedFile} is registered but missing from tracked design behavior files`);
    }
  }

  for (const gate of orderedGates) {
    validateDesignBehaviorGate(gate, context);
  }

  assertGateRunOrder(orderedGates, runLineByGate, findings);
  return findings;
}

function main() {
  const repoRoot = getRepoRoot();
  assertRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail, {
    missingMessage: 'scripts/verify-ci.sh not found.',
  });

  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const scripts = packageJson.scripts ?? {};
  const verifyCiSource = readRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail);
  const designBehaviorFiles = listDesignBehaviorFiles(repoRoot);
  const findings = auditDesignBehaviorGateRegistry({
    designBehaviorFiles,
    repoRoot,
    scripts,
    verifyCiSource,
  });

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Design behavior gate registry drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error(
      '\nKeep design behavior guards, package.json scripts, and scripts/verify-ci.sh entries synchronized.',
    );
    process.exit(1);
  }

  reportOk(`${EXPECTED_BEHAVIOR_GATES.length} design behavior gates are registered and wired into verify:ci.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
