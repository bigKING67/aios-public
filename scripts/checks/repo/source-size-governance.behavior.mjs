#!/usr/bin/env node

import {
  auditSourceSizeGovernance,
} from '../../lib/repo/source-size-governance-core.mjs';
import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const { assertIncludes, assertTrue, reportOk } = createCheckGuard('repo-source-size-governance-behavior');

function fixtureConfig(entryOverrides = {}) {
  return {
    version: 1,
    categories: [{
      name: 'fixture-typescript',
      roots: ['src'],
      excludeRoots: ['src/generated'],
      extensions: ['.ts'],
      maxLines: 3,
      allowed: [{
        path: 'src/legacy.ts',
        maxLines: 5,
        owner: 'fixture-owner',
        expiresOn: '2099-12-31',
        remediationTask: 'fixture-task',
        reason: 'fixture frozen debt',
        ...entryOverrides,
      }],
    }],
  };
}

function audit(config, lineCounts = {
  'src/generated/api.ts': 500,
  'src/legacy.ts': 5,
  'src/small.ts': 2,
}) {
  const files = Object.keys(lineCounts);
  return auditSourceSizeGovernance({
    config,
    currentDate: new Date('2026-07-22T00:00:00Z'),
    filesForCategory: () => files,
    countLines: (file) => lineCounts[file],
  });
}

assertTrue(
  audit(fixtureConfig()).findings.length === 0,
  'valid frozen exception should pass and generated sources should be excluded',
);
assertIncludes(
  audit(fixtureConfig(), { 'src/legacy.ts': 6 }).findings.join('\n'),
  'grew to 6 lines above frozen cap 5',
  'frozen exception growth should fail',
);
assertIncludes(
  audit(fixtureConfig(), { 'src/legacy.ts': 3 }).findings.join('\n'),
  'exception is stale',
  'stale exception should fail',
);
assertIncludes(
  audit(fixtureConfig(), { 'src/new.ts': 4 }).findings.join('\n'),
  'exception points to a missing or undiscovered file',
  'missing exception target should fail',
);
assertIncludes(
  audit(fixtureConfig({ owner: '' })).findings.join('\n'),
  'must include owner',
  'missing owner metadata should fail',
);
assertIncludes(
  audit(fixtureConfig({ expiresOn: '2026-01-01' })).findings.join('\n'),
  'exception expired on 2026-01-01',
  'expired exception should fail',
);

reportOk('full-root discovery metadata, generated-source exclusion, missing/stale/expired exceptions, new oversize files, and frozen-cap growth are covered.');
