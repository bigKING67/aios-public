#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(
  new URL('../../config/security/dependency-audit-exceptions.json', import.meta.url),
  'utf8',
));
const today = new Date().toISOString().slice(0, 10);
const seen = new Set();

if (config.version !== 1 || !Array.isArray(config.rust)) {
  console.error('[rust-dependency-audit] exception config must use version 1 with a rust array');
  process.exit(1);
}

for (const exception of config.rust) {
  for (const field of ['id', 'package', 'reason', 'owner', 'expiresOn', 'remediationTask']) {
    if (typeof exception?.[field] !== 'string' || exception[field].trim() === '') {
      console.error(`[rust-dependency-audit] exception must include non-empty ${field}`);
      process.exit(1);
    }
  }
  if (!/^RUSTSEC-\d{4}-\d{4}$/u.test(exception.id)) {
    console.error(`[rust-dependency-audit] invalid advisory id ${exception.id}`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(exception.expiresOn) || exception.expiresOn < today) {
    console.error(`[rust-dependency-audit] exception ${exception.id} is invalid or expired on ${exception.expiresOn}`);
    process.exit(1);
  }
  if (seen.has(exception.id)) {
    console.error(`[rust-dependency-audit] duplicate exception ${exception.id}`);
    process.exit(1);
  }
  seen.add(exception.id);
  console.log(exception.id);
}
