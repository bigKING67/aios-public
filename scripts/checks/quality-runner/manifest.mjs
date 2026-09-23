#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  withFixtureWorkspace,
} from '../../lib/shared/gate-fixture-utils.mjs';
import {
  createQualityManifestSnapshot,
  hasQualityManifestSnapshot,
  writeQualityManifestSnapshot,
} from '../../lib/quality/quality-manifest.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-manifest-behavior');

export async function runQualityRunnerManifestBehaviorCheck() {
  withFixtureWorkspace({
    files: {
      'docs/guide.md': '# Guide\n',
      'package.json': '{}\n',
      'apps/web-vite/src/app/page.tsx': 'export default function Page() { return null; }\n',
      'apps/web-vite/src/components/button.tsx': 'export const Button = () => null;\n',
    },
    packageJson: null,
    prefix: 'aios-quality-runner-manifest-',
  }, (fixture) => {
    const { repoRoot } = fixture;
    const gates = [
      {
        command: 'node scripts/pass.mjs app',
        inputs: ['apps/web-vite/src/app/**'],
        name: 'app-fixture',
      },
      {
        command: 'node scripts/pass.mjs component',
        inputs: ['apps/web-vite/src/components/**', 'apps/web-vite/src/app/**'],
        name: 'component-fixture',
      },
    ];
    const snapshot = createQualityManifestSnapshot(repoRoot, gates, { mode: 'fixture' });
    assertEqual(snapshot.schema, 1, 'manifest snapshot should expose a schema version');
    assertEqual(snapshot.gateCount, 2, 'manifest snapshot should record selected gate names');
    assertEqual(snapshot.inputCount, 2, 'manifest snapshot should dedupe gate input patterns');
    assertEqual(snapshot.fileCount, 2, 'manifest snapshot should include files matched by selected gate inputs');
    assertEqual(snapshot.scanFileCount, 4, 'manifest snapshot should expose the shared repo scan file count');
    assertEqual(
      snapshot.files.map((file) => file.path).join(','),
      'apps/web-vite/src/app/page.tsx,apps/web-vite/src/components/button.tsx',
      'manifest snapshot should be deterministic and sorted by repo path',
    );
    assertFalse(
      snapshot.files.some((file) => file.path === 'docs/guide.md'),
      'manifest snapshot should not include files outside selected gate inputs',
    );
    const manifestPath = writeQualityManifestSnapshot(repoRoot, snapshot, { manifestId: 'fixture' });
    assertTrue(hasQualityManifestSnapshot(repoRoot, 'fixture'), 'manifest snapshot should be persisted under quality cache namespace');
    assertIncludes(
      manifestPath,
      '.cache/aios-quality/manifests/fixture.json',
      'manifest path should live under the quality cache namespace',
    );

    fixture.write({
      'apps/web-vite/src/app/page.tsx': 'export default function Page() { return "changed"; }\n',
    });
    const changedSnapshot = createQualityManifestSnapshot(repoRoot, gates, { mode: 'fixture' });
    assertFalse(
      changedSnapshot.digest === snapshot.digest,
      'manifest digest should change when selected input file stats change',
    );
  });
}

export async function main() {
  await runQualityRunnerManifestBehaviorCheck();
  reportOk('manifest snapshot, shared repo scan metadata, and digest invalidation passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
