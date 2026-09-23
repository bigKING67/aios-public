import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkCommandLayout,
} from '../../lib/quality/quality-command-layout-core.mjs';

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-registry-'));
}

export function assertRegistryCommandLayout({
  assertEqual,
  assertIncludes,
  repoRoot,
}) {
  const layoutFindings = checkCommandLayout({ repoRoot });
  assertEqual(layoutFindings.length, 0, `real check command layout should be valid: ${layoutFindings.join('\n')}`);

  const localFileTempRepoRoot = createTempWorkspace();
  try {
    writeText(path.join(localFileTempRepoRoot, 'scripts/deploy-vps.local.env'), 'DEPLOY_HOST=fixture\n');
    assertEqual(
      checkCommandLayout({ repoRoot: localFileTempRepoRoot }).length,
      0,
      'layout guard should ignore non-command root files such as local env overlays',
    );
  } finally {
    rmSync(localFileTempRepoRoot, { force: true, recursive: true });
  }

  const tempRepoRoot = createTempWorkspace();
  const newFlatCheckPath = ['scripts', 'check-new-flat.mjs'].join('/');
  const oldFlatCheckPath = ['scripts', 'check-old-flat.mjs'].join('/');
  try {
    writeText(path.join(tempRepoRoot, newFlatCheckPath), 'console.log("[fixture] flat check");\n');
    writeText(path.join(tempRepoRoot, oldFlatCheckPath), 'console.log("[fixture] old flat check");\n');
    writeText(path.join(tempRepoRoot, 'scripts/random-tool.mjs'), 'console.log("[fixture] bad root script");\n');
    writeText(path.join(tempRepoRoot, 'scripts/lib/flat-helper.mjs'), 'export const value = 1;\n');
    writeText(path.join(tempRepoRoot, 'scripts/lib/check-bad-helper.mjs'), 'export const value = 1;\n');
    writeText(path.join(tempRepoRoot, 'scripts/lib/executable-helper.mjs'), '#!/usr/bin/env node\nexport const value = 1;\n');
    writeText(path.join(tempRepoRoot, 'scripts/lib/misc/helper.mjs'), 'export const value = 1;\n');
    writeText(path.join(tempRepoRoot, 'scripts/lib/frontend-smoke/config.mjs'), 'export const value = 1;\n');
    writeText(path.join(tempRepoRoot, 'scripts/checks/bad-root.mjs'), 'console.log("[fixture] bad checks root");\n');
    writeText(path.join(tempRepoRoot, 'scripts/checks/ci/check-bad-prefix.mjs'), 'console.log("[fixture] bad check prefix");\n');
    writeText(path.join(tempRepoRoot, 'scripts/checks/frontend/legacy-reference.mjs'), `const OLD_CHECK = '${oldFlatCheckPath}';\n`);
    const tempFindings = checkCommandLayout({
      migratedLegacyPaths: [oldFlatCheckPath],
      repoRoot: tempRepoRoot,
      rootFlatCheckLimit: 0,
    }).join('\n');
    assertIncludes(tempFindings, 'scripts/random-tool.mjs is not an allowed root script entry', 'layout guard should reject non-entry root scripts');
    assertIncludes(tempFindings, 'root-level check commands exceed migration baseline', 'layout guard should reject new root flat checks');
    assertIncludes(tempFindings, `migrated legacy check path returned: ${oldFlatCheckPath}`, 'layout guard should reject returned migrated paths');
    assertIncludes(tempFindings, 'scripts/lib/flat-helper.mjs must live under scripts/lib/<domain>/', 'layout guard should reject direct lib root files');
    assertIncludes(tempFindings, 'scripts/lib/misc/ is not an approved lib domain', 'layout guard should reject unapproved lib domains');
    assertIncludes(tempFindings, 'scripts/lib/frontend-smoke/ is retired; use scripts/lib/frontend/smoke/', 'layout guard should reject retired frontend smoke lib domain');
    assertIncludes(tempFindings, 'scripts/lib/check-bad-helper.mjs must not use check-* naming', 'layout guard should reject check-* helpers in lib');
    assertIncludes(tempFindings, 'scripts/lib/executable-helper.mjs must not be executable', 'layout guard should reject executable lib modules');
    assertIncludes(tempFindings, 'scripts/checks/bad-root.mjs must live under scripts/checks/<domain>/<name>.mjs', 'layout guard should reject files directly under scripts/checks');
    assertIncludes(tempFindings, 'scripts/checks/ci/check-bad-prefix.mjs should not repeat the check-* prefix', 'layout guard should reject check-* prefix inside scripts/checks');
    assertIncludes(
      tempFindings,
      `scripts/checks/frontend/legacy-reference.mjs must not reference legacy root check path ${oldFlatCheckPath}`,
      'layout guard should reject production references to legacy root check paths',
    );
  } finally {
    rmSync(tempRepoRoot, { force: true, recursive: true });
  }
}
