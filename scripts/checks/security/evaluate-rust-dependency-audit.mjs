#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { evaluateRustDependencyAudit } from '../../lib/security/rust-dependency-audit-core.mjs';

const [auditReportPath, cargoTreePath] = process.argv.slice(2);
if (!auditReportPath || !cargoTreePath) {
  console.error('[rust-dependency-audit] usage: evaluate-rust-dependency-audit.mjs <audit-report.json> <cargo-tree.txt>');
  process.exit(1);
}

let report;
let cargoTree;
try {
  report = JSON.parse(readFileSync(auditReportPath, 'utf8'));
  cargoTree = readFileSync(cargoTreePath, 'utf8');
} catch (error) {
  console.error(`[rust-dependency-audit] failed to read audit evidence: ${error.message}`);
  process.exit(1);
}

const result = evaluateRustDependencyAudit({ cargoTree, report });
for (const finding of result.lockOnly) {
  console.log(
    `[rust-dependency-audit] lock-only: ${finding.id} ${finding.package}@${finding.version} is absent from the enabled Cargo tree`,
  );
}
for (const finding of result.lockOnlyWarnings) {
  console.log(
    `[rust-dependency-audit] lock-only warning: ${finding.id} ${finding.package}@${finding.version} is absent from the enabled Cargo tree`,
  );
}
if (result.failures.length > 0) {
  console.error('[rust-dependency-audit] dependency audit failed:');
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[rust-dependency-audit] OK: ${result.active.length} active vulnerability record(s), ${result.activeWarnings.length} active warning(s), ${result.lockOnly.length} lock-only vulnerability record(s), ${result.lockOnlyWarnings.length} lock-only warning(s).`,
);
