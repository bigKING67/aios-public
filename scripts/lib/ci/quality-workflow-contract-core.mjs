import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const QUALITY_WORKFLOW_PATH = '.github/workflows/quality-gate.yml';
export const QUALITY_WORKFLOW_CACHE_STEP_NAME = 'Restore AIOS quality cache';
export const QUALITY_WORKFLOW_VERIFY_STEP_NAME = 'Verify (lint + build + type-check + shell + frontend preflight)';
export const QUALITY_WORKFLOW_WARM_STEP_NAME = 'Verify bounded warm-cache reuse';
export const QUALITY_WORKFLOW_STATS_POLICY_STEP_NAME = 'Verify quality stats policy';
export const REQUIRED_QUALITY_WORKFLOW_CACHE_PATHS = Object.freeze([
  '.cache/aios-quality',
  '.cache/aios-quality-remote',
  '.cache/eslint',
  '.cache/tsc',
]);
export const REQUIRED_QUALITY_WORKFLOW_CACHE_KEY_INPUTS = Object.freeze([
  "hashFiles('package-lock.json'",
  "'tsconfig*.json'",
  "'apps/**/tsconfig*.json'",
  "'eslint.config.*'",
  "'scripts/lib/quality/**/*.mjs'",
  "'scripts/checks/quality-runner/**'",
]);
export const REQUIRED_QUALITY_WORKFLOW_RESTORE_KEY = 'aios-quality-${{ runner.os }}-';
export const REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV = Object.freeze({
  AIOS_QUALITY_REMOTE_CACHE_MODE: 'readwrite',
  AIOS_QUALITY_REMOTE_CACHE_URL: 'file://${{ github.workspace }}/.cache/aios-quality-remote',
});
export const REQUIRED_QUALITY_WORKFLOW_VERIFY_COMMAND = 'npm run verify:ci';
export const REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_COMMAND = 'npm run verify:quality:stats-policy';
export const REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_INIT = 'status=0';
export const REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_CAPTURE = 'npm run verify:quality:stats-policy || status=$?';
export const REQUIRED_QUALITY_WORKFLOW_STATS_SUMMARY_COMMAND = 'QUALITY_STATS_POLICY_EXIT_CODE="$status" node scripts/ci/write-quality-stats-step-summary.mjs';
export const REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_EXIT = 'exit "$status"';

export function readQualityWorkflowSource(repoRoot) {
  return readFileSync(join(repoRoot, QUALITY_WORKFLOW_PATH), 'utf8');
}

export function namedWorkflowStep(source, name) {
  const marker = `- name: ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) {
    return '';
  }
  const remainder = source.slice(start);
  const afterMarker = remainder.slice(marker.length);
  const nextStep = /\n\s+- name: /u.exec(afterMarker);
  return nextStep ? remainder.slice(0, marker.length + nextStep.index) : remainder;
}

function checkCacheStep(cacheStep, findings) {
  if (!cacheStep) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must keep the ${QUALITY_WORKFLOW_CACHE_STEP_NAME} step`);
    return;
  }
  if (!cacheStep.includes('uses: actions/cache@v4')) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must restore AIOS caches with actions/cache@v4`);
  }
  for (const cachePath of REQUIRED_QUALITY_WORKFLOW_CACHE_PATHS) {
    if (!cacheStep.includes(cachePath)) {
      findings.push(`${QUALITY_WORKFLOW_PATH} cache step must persist ${cachePath}`);
    }
  }
  for (const keyInput of REQUIRED_QUALITY_WORKFLOW_CACHE_KEY_INPUTS) {
    if (!cacheStep.includes(keyInput)) {
      findings.push(`${QUALITY_WORKFLOW_PATH} cache key must include ${keyInput}`);
    }
  }
  const restoreKeysStart = cacheStep.indexOf('restore-keys:');
  if (restoreKeysStart === -1) {
    findings.push(`${QUALITY_WORKFLOW_PATH} cache step must keep restore-keys`);
  } else if (!cacheStep.slice(restoreKeysStart).includes(REQUIRED_QUALITY_WORKFLOW_RESTORE_KEY)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} cache step must keep broad restore key ${REQUIRED_QUALITY_WORKFLOW_RESTORE_KEY}`);
  }
}

function checkVerifyStep(verifyStep, findings) {
  if (!verifyStep) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must keep the canonical Verify step`);
    return;
  }
  for (const [envKey, expectedValue] of Object.entries(REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV)) {
    const expectedLine = `${envKey}: ${expectedValue}`;
    if (!verifyStep.includes(expectedLine)) {
      findings.push(`${QUALITY_WORKFLOW_PATH} Verify step must set ${expectedLine}`);
    }
  }
  if (!verifyStep.includes(`run: ${REQUIRED_QUALITY_WORKFLOW_VERIFY_COMMAND}`)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} Verify step must run ${REQUIRED_QUALITY_WORKFLOW_VERIFY_COMMAND}`);
  }
}

function checkWarmStep(warmStep, findings) {
  if (!warmStep || !warmStep.includes('node scripts/quality-runner.mjs remote-cache smoke --json')
    || !warmStep.includes('npm run verify:ci')) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must keep one bounded full warm-cache verification after functional validation`);
  }
  for (const [envKey, expectedValue] of Object.entries(REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV)) {
    if (!warmStep.includes(`${envKey}: ${expectedValue}`)) {
      findings.push(`${QUALITY_WORKFLOW_PATH} warm verification must preserve remote cache environment`);
    }
  }
}

function checkStatsPolicyStep(statsPolicyStep, findings) {
  if (!statsPolicyStep) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must keep the stats policy step`);
    return;
  }
  for (const [envKey, expectedValue] of Object.entries(REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV)) {
    const expectedLine = `${envKey}: ${expectedValue}`;
    if (!statsPolicyStep.includes(expectedLine)) {
      findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must set ${expectedLine}`);
    }
  }
  if (!statsPolicyStep.includes('QUALITY_STATS_BUDGET_LIMIT: 1')) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy must measure the latest bounded warm run`);
  }
  if (!statsPolicyStep.includes(REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_INIT)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must initialize status before running policy`);
  }
  if (!statsPolicyStep.includes(REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_COMMAND)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must run ${REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_COMMAND}`);
  }
  if (!statsPolicyStep.includes(REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_CAPTURE)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must capture policy failure before writing the GitHub summary`);
  }
  if (!statsPolicyStep.includes(REQUIRED_QUALITY_WORKFLOW_STATS_SUMMARY_COMMAND)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must write the GitHub summary with ${REQUIRED_QUALITY_WORKFLOW_STATS_SUMMARY_COMMAND}`);
  }
  if (!statsPolicyStep.includes(REQUIRED_QUALITY_WORKFLOW_STATS_POLICY_STATUS_EXIT)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} stats policy step must exit with the original policy status after writing the GitHub summary`);
  }
}

export function checkQualityWorkflowCacheContract(source) {
  const findings = [];
  if (/paths-ignore:\s*[\s\S]{0,160}['"]\*\*\/\*\.md['"]/u.test(source)) {
    findings.push(`${QUALITY_WORKFLOW_PATH} must not skip all Markdown changes; governed Markdown files require repository checks`);
  }
  checkCacheStep(namedWorkflowStep(source, QUALITY_WORKFLOW_CACHE_STEP_NAME), findings);
  checkVerifyStep(namedWorkflowStep(source, QUALITY_WORKFLOW_VERIFY_STEP_NAME), findings);
  checkWarmStep(namedWorkflowStep(source, QUALITY_WORKFLOW_WARM_STEP_NAME), findings);
  checkStatsPolicyStep(namedWorkflowStep(source, QUALITY_WORKFLOW_STATS_POLICY_STEP_NAME), findings);
  return findings;
}
