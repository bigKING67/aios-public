#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { evaluateNpmDependencyAudit } from '../../lib/security/npm-dependency-audit-core.mjs';

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, 'scripts/config/security/dependency-audit-exceptions.json');
const defaultAuditTimeoutMs = 90_000;
const auditTimeoutMs = process.env.AIOS_NPM_AUDIT_TIMEOUT_MS
  ? Number(process.env.AIOS_NPM_AUDIT_TIMEOUT_MS)
  : defaultAuditTimeoutMs;

if (!Number.isInteger(auditTimeoutMs) || auditTimeoutMs < 100 || auditTimeoutMs > 300_000) {
  console.error('[npm-dependency-audit] AIOS_NPM_AUDIT_TIMEOUT_MS must be an integer from 100 to 300000.');
  process.exit(1);
}

const audit = spawnSync('npm', [
  'audit',
  '--omit=dev',
  '--json',
  '--fetch-retries=2',
  '--fetch-retry-mintimeout=1000',
  '--fetch-retry-maxtimeout=5000',
  '--fetch-timeout=30000',
], {
  cwd: repoRoot,
  encoding: 'utf8',
  killSignal: 'SIGKILL',
  maxBuffer: 32 * 1024 * 1024,
  timeout: auditTimeoutMs,
});

if (audit.error) {
  const detail = audit.error.code === 'ETIMEDOUT'
    ? `timed out after ${auditTimeoutMs}ms`
    : audit.error.message;
  console.error(`[npm-dependency-audit] npm audit execution failed: ${detail}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  console.error(`[npm-dependency-audit] npm audit did not return valid JSON: ${error.message}`);
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(1);
}

if (audit.signal || ![0, 1].includes(audit.status) || !report || report.error || report.auditReportVersion !== 2) {
  console.error(`[npm-dependency-audit] npm audit execution failed: ${report?.error?.summary ?? 'invalid report'}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const result = evaluateNpmDependencyAudit({ config, report });
if (result.failures.length > 0) {
  console.error('[npm-dependency-audit] dependency audit failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[npm-dependency-audit] OK: ${result.actionable.length} actionable advisory record(s), ${result.allowed.length} bounded exception(s).`);
