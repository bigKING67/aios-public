#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateNpmDependencyAudit as auditNpmDependencyReport,
} from '../../lib/security/npm-dependency-audit-core.mjs';
import {
  evaluateRustDependencyAudit,
  parseCargoTreePackages,
} from '../../lib/security/rust-dependency-audit-core.mjs';

const report = {
  vulnerabilities: {
    echarts: {
      severity: 'moderate',
      via: [{
        severity: 'moderate',
        source: 1,
        title: 'fixture advisory',
        url: 'https://github.com/advisories/GHSA-fixture-0000-0000',
      }],
    },
  },
};
const exception = {
  expiresOn: '2026-08-31',
  id: 'GHSA-fixture-0000-0000',
  owner: 'frontend-platform',
  package: 'echarts',
  reason: 'Fixture exception for behavior coverage.',
  remediationTask: 'fixture-task',
};

const allowed = auditNpmDependencyReport({
  config: { minimumSeverity: 'moderate', npm: [exception], version: 1 },
  now: new Date('2026-07-22T00:00:00Z'),
  report,
});
assert.deepEqual(allowed.failures, []);
assert.deepEqual(allowed.allowed, ['echarts:GHSA-fixture-0000-0000']);

const unapproved = auditNpmDependencyReport({
  config: { minimumSeverity: 'moderate', npm: [], version: 1 },
  now: new Date('2026-07-22T00:00:00Z'),
  report,
});
assert.match(unapproved.failures.join('\n'), /moderate echarts GHSA-fixture/u);

const expired = auditNpmDependencyReport({
  config: { minimumSeverity: 'moderate', npm: [{ ...exception, expiresOn: '2026-07-21' }], version: 1 },
  now: new Date('2026-07-22T00:00:00Z'),
  report,
});
assert.match(expired.failures.join('\n'), /expired on 2026-07-21/u);

const rustReport = {
  database: {
    'advisory-count': 1,
  },
  lockfile: {
    'dependency-count': 3,
  },
  vulnerabilities: {
    count: 1,
    found: true,
    list: [{
      advisory: {
        id: 'RUSTSEC-2099-0001',
        title: 'fixture Rust advisory',
      },
      package: {
        name: 'optional-crypto',
        version: '1.2.3',
      },
    }],
  },
  warnings: {},
};

const parsedTree = parseCargoTreePackages(`
aios-api v0.1.0 (/workspace/backend-rust)
optional-crypto v1.2.3
postgres-client v4.5.6
`);
assert.deepEqual(parsedTree.failures, []);
assert.equal(parsedTree.packages.has('optional-crypto@1.2.3'), true);

const activeRust = evaluateRustDependencyAudit({
  cargoTree: 'aios-api v0.1.0 (/workspace/backend-rust)\noptional-crypto v1.2.3\n',
  report: rustReport,
});
assert.match(activeRust.failures.join('\n'), /affects enabled dependency optional-crypto@1\.2\.3/u);
assert.deepEqual(activeRust.active.map((finding) => finding.id), ['RUSTSEC-2099-0001']);

const lockOnlyRust = evaluateRustDependencyAudit({
  cargoTree: 'aios-api v0.1.0 (/workspace/backend-rust)\npostgres-client v4.5.6\n',
  report: rustReport,
});
assert.deepEqual(lockOnlyRust.failures, []);
assert.deepEqual(lockOnlyRust.lockOnly.map((finding) => finding.id), ['RUSTSEC-2099-0001']);

const versionMismatchRust = evaluateRustDependencyAudit({
  cargoTree: 'aios-api v0.1.0 (/workspace/backend-rust)\noptional-crypto v1.2.4\n',
  report: rustReport,
});
assert.deepEqual(versionMismatchRust.failures, []);
assert.deepEqual(versionMismatchRust.lockOnly.map((finding) => finding.version), ['1.2.3']);

const activeWarningRust = evaluateRustDependencyAudit({
  cargoTree: 'aios-api v0.1.0 (/workspace/backend-rust)\nevent-listener v5.4.1\n',
  report: {
    ...rustReport,
    vulnerabilities: { count: 0, found: false, list: [] },
    warnings: {
      unsound: [{
        advisory: {
          id: 'RUSTSEC-2099-0002',
          title: 'fixture unsound advisory',
        },
        kind: 'unsound',
        package: {
          name: 'event-listener',
          version: '5.4.1',
        },
      }],
    },
  },
});
assert.match(activeWarningRust.failures.join('\n'), /active unsound warning/u);
assert.deepEqual(activeWarningRust.activeWarnings.map((finding) => finding.id), ['RUSTSEC-2099-0002']);

const malformedRust = evaluateRustDependencyAudit({
  cargoTree: 'not a Cargo package line',
  report: { vulnerabilities: { count: 1, found: true, list: [] } },
});
assert.match(malformedRust.failures.join('\n'), /contains no package identities/u);
assert.match(malformedRust.failures.join('\n'), /missing database or lockfile evidence/u);
assert.match(malformedRust.failures.join('\n'), /invalid warnings block/u);
assert.match(malformedRust.failures.join('\n'), /count mismatch/u);
assert.match(malformedRust.failures.join('\n'), /found flag/u);

const behaviorDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(behaviorDir, '../../..');
const auditEntrypoint = path.join(repoRoot, 'scripts/checks/security/npm-dependency-audit.mjs');
const fakeBinDir = mkdtempSync(path.join(tmpdir(), 'aios-npm-audit-'));
const fakeNpmPath = path.join(fakeBinDir, 'npm');
const auditEnv = {
  ...process.env,
  PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
};

try {
  writeFileSync(fakeNpmPath, `#!/usr/bin/env node
const required = [
  'audit',
  '--omit=dev',
  '--json',
  '--fetch-retries=2',
  '--fetch-retry-mintimeout=1000',
  '--fetch-retry-maxtimeout=5000',
  '--fetch-timeout=30000',
];
if (!required.every((argument) => process.argv.includes(argument))) {
  process.stderr.write('missing bounded fetch argument');
  process.exit(2);
}
process.stdout.write(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }));
`);
  chmodSync(fakeNpmPath, 0o755);
  const boundedFetch = spawnSync(process.execPath, [auditEntrypoint], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: auditEnv,
  });
  assert.equal(boundedFetch.status, 0, boundedFetch.stderr);
  assert.match(boundedFetch.stdout, /0 actionable advisory record/u);

  writeFileSync(fakeNpmPath, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }));
process.exit(2);
`);
  const failedExecution = spawnSync(process.execPath, [auditEntrypoint], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: auditEnv,
  });
  assert.equal(failedExecution.status, 1);
  assert.match(failedExecution.stderr, /execution failed/u);

  writeFileSync(fakeNpmPath, `#!/usr/bin/env node
process.on('SIGTERM', () => {});
setTimeout(() => {}, 1000);
`);
  chmodSync(fakeNpmPath, 0o755);
  const timedOut = spawnSync(process.execPath, [auditEntrypoint], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...auditEnv,
      AIOS_NPM_AUDIT_TIMEOUT_MS: '100',
    },
  });
  assert.equal(timedOut.status, 1);
  assert.match(timedOut.stderr, /timed out after 100ms/u);
} finally {
  rmSync(fakeBinDir, { force: true, recursive: true });
}

console.log('[dependency-audit-behavior] OK: npm exceptions, bounded npm execution, and Rust active-versus-lock-only findings fail closed.');
