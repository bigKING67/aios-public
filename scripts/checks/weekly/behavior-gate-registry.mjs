#!/usr/bin/env node

/**
 * Weekly behavior gate registry audit.
 *
 * Behavior guards are only useful when their file, package script, and
 * verify:ci entry stay in sync. This dynamic registry checks all
 * weekly-domain behavior guards under scripts/checks/ without maintaining a
 * second hand-written list of 50+ cases.
 */

import {
  assertRequiredFile,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
  listGitFiles,
  previousNonEmptyLine,
  readRequiredPackageJson,
  readRequiredFile,
  repoFileExists,
  requireExactLineNumber,
  requireVerifyCiRunWithAdjacentLabel,
} from '../../lib/shared/guard-utils.mjs';
import {
  WEEKLY_BEHAVIOR_FILE_PATTERN,
  WEEKLY_BEHAVIOR_MANIFEST_GATES,
} from '../../lib/weekly/weekly-behavior-gates.mjs';

const GUARD_NAME = 'weekly-behavior-gate-registry';
const BEHAVIOR_FILE_PATTERN = WEEKLY_BEHAVIOR_FILE_PATTERN;
const EXPECTED_MANIFEST_GATES = WEEKLY_BEHAVIOR_MANIFEST_GATES;

const { fail, reportOk } = createWeeklyGuard(GUARD_NAME);

export function listTrackedWeeklyBehaviorFiles(repoRoot) {
  return listGitFiles([':(glob)scripts/checks/weekly*/**/*.mjs'], {
    cwd: repoRoot,
    filter: (file) => BEHAVIOR_FILE_PATTERN.test(file),
  });
}

export function auditWeeklyBehaviorGateRegistry({
  behaviorFiles,
  expectedManifestGates = EXPECTED_MANIFEST_GATES,
  fileExists = (file) => repoFileExists(process.cwd(), file),
  scripts,
  verifyCiSource,
}) {
  const verifyCiLines = verifyCiSource.split('\n');
  const qualityRunnerBacked = verifyCiSource.includes('quality-runner.mjs" run ci');
  const findings = [];

  const packageEntries = Object.entries(scripts)
    .filter(([name]) => name.startsWith('verify:weekly:'))
    .map(([name, command]) => ({
      name,
      command,
      file: typeof command === 'string' ? command.replace(/^node\s+/, '') : '',
    }))
    .filter(({ command, file }) => (
      typeof command === 'string' &&
      (
        command.startsWith('node scripts/checks/weekly')
      ) &&
      BEHAVIOR_FILE_PATTERN.test(file)
    ));

  const packageEntriesByFile = new Map();
  for (const entry of packageEntries) {
    const entries = packageEntriesByFile.get(entry.file) ?? [];
    entries.push(entry);
    packageEntriesByFile.set(entry.file, entries);
  }

  for (const behaviorFile of behaviorFiles) {
    const entries = packageEntriesByFile.get(behaviorFile) ?? [];
    if (entries.length !== 1) {
      findings.push(`${behaviorFile} must be referenced by exactly one package script; found ${entries.length}`);
      continue;
    }

    const [{ name, command }] = entries;
    if (command !== `node ${behaviorFile}`) {
      findings.push(`${name} command drifted; expected ${JSON.stringify(`node ${behaviorFile}`)}, got ${JSON.stringify(command)}`);
    }

    if (!qualityRunnerBacked) {
      const runLineNumber = requireExactLineNumber(
        verifyCiSource,
        `npm run ${name}`,
        findings,
        (count) => `${name} must appear in scripts/verify-ci.sh exactly once; found ${count}`,
      );
      if (runLineNumber === null) {
        continue;
      }

      const labelLine = previousNonEmptyLine(verifyCiLines, runLineNumber);
      if (!labelLine.startsWith('echo "[verify:ci] ')) {
        findings.push(`${name} must have an adjacent verify:ci echo label before its npm run line`);
      }
    }
  }

  for (const entry of packageEntries) {
    if (!behaviorFiles.includes(entry.file)) {
      findings.push(`${entry.name} points at an untracked or missing weekly behavior file: ${entry.file}`);
    }
  }

  for (const gate of expectedManifestGates) {
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
      continue;
    }
  }

  return findings;
}

export function formatWeeklyBehaviorGateRegistryFailure(findings) {
  return [
    `[${GUARD_NAME}] Weekly behavior gate registry drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    'Keep weekly behavior guard files, package.json scripts, and scripts/verify-ci.sh entries synchronized.',
  ].join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  assertRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail, {
    missingMessage: 'scripts/verify-ci.sh not found.',
  });

  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const scripts = packageJson.scripts ?? {};
  const verifyCiSource = readRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail);
  const behaviorFiles = listTrackedWeeklyBehaviorFiles(repoRoot);
  const findings = auditWeeklyBehaviorGateRegistry({
    behaviorFiles,
    fileExists: (file) => repoFileExists(repoRoot, file),
    scripts,
    verifyCiSource,
  });

  if (findings.length > 0) {
    console.error(formatWeeklyBehaviorGateRegistryFailure(findings));
    process.exit(1);
  }

  reportOk(`${behaviorFiles.length} weekly behavior gates are registered and wired into verify:ci.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
