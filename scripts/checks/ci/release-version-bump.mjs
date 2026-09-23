#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  ZERO_SHA,
  checkReleaseVersionBump,
  classifyReleaseImpactingFiles,
  createEndpointFileReader,
  hasRef,
  parseChangedFiles,
  readChangedFilesFromGit,
  releaseImpactingClassificationNeedsFileSource,
} from '../../lib/quality/quality-release-version-bump-core.mjs';

export {
  checkReleaseVersionBump,
  classifyReleaseImpactingFiles,
  createEndpointFileReader,
  releaseImpactingClassificationNeedsFileSource,
} from '../../lib/quality/quality-release-version-bump-core.mjs';

const GUARD_NAME = 'release-version-bump';

function resolveEndpoint(repoRoot, env) {
  const base = env.AIOS_QUALITY_BASE || env.AIOS_RELEASE_BASE || 'origin/main';
  const rawHead = env.AIOS_QUALITY_HEAD || env.AIOS_RELEASE_HEAD || null;
  const head = rawHead === ZERO_SHA ? null : rawHead;
  return {
    current: { ref: head && hasRef(repoRoot, head) ? head : null },
    previous: { ref: base && hasRef(repoRoot, base) ? base : null },
  };
}

function main() {
  const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });
  const repoRoot = getRepoRoot();
  const endpoint = resolveEndpoint(repoRoot, process.env);
  const changedFiles = process.env.AIOS_QUALITY_CHANGED_FILES
    ? parseChangedFiles(process.env.AIOS_QUALITY_CHANGED_FILES)
    : readChangedFilesFromGit(repoRoot, endpoint.previous.ref, endpoint.current.ref);

  if (!endpoint.previous.ref) {
    reportOk('no comparable base ref; skipped release version bump check.');
    return;
  }

  const files = ['package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md'];
  const readPreviousFile = createEndpointFileReader(repoRoot, endpoint.previous);
  const readCurrentFile = createEndpointFileReader(repoRoot, endpoint.current);

  const releaseImpactingFiles = classifyReleaseImpactingFiles(
    changedFiles,
    (file) => ({
      previousSource: readPreviousFile(file),
      currentSource: readCurrentFile(file),
    }),
  );

  if (releaseImpactingFiles.length === 0) {
    reportOk('no release-impacting changes; skipped version bump requirement.');
    return;
  }

  const previousFiles = Object.fromEntries(
    files.map((file) => [file, readPreviousFile(file)]),
  );
  const currentFiles = Object.fromEntries(
    files.map((file) => [file, readCurrentFile(file)]),
  );

  for (const entry of changedFiles) {
    if (
      entry.file
      && releaseImpactingClassificationNeedsFileSource(entry.file)
      && !Object.hasOwn(previousFiles, entry.file)
    ) {
      previousFiles[entry.file] = readPreviousFile(entry.file);
      currentFiles[entry.file] = readCurrentFile(entry.file);
    }
  }

  const { findings } = checkReleaseVersionBump({
    changedFiles,
    currentFiles,
    previousFiles,
    releaseImpactingFiles,
  });

  if (findings.length > 0) {
    fail([
      'release version bump is required for this pushed diff:',
      ...findings.map((finding) => `- ${finding}`),
      '',
      'Run one of:',
      '  npm run release:bump:patch',
      '  npm run release:bump:minor',
      '  npm run release:bump:major',
      '',
      'Then review CHANGELOG.md and commit the version files with the release-impacting change.',
    ].join('\n'));
  }

  reportOk('release-impacting changes are covered by package/lock/README/CHANGELOG version bump.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
