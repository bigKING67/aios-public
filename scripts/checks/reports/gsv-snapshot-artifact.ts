#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GSV_MONTHLY_CHANNEL_REPORT } from '../../../apps/web-vite/src/app/reports/special/_content/gsv-monthly-channel-2026-ytd-05';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactPath = path.join(
  repoRoot,
  'public/reports/special/gsv-monthly-channel-2026-ytd-05.json',
);
const serializedSnapshot = `${JSON.stringify(GSV_MONTHLY_CHANNEL_REPORT, null, 2)}\n`;
const snapshotHash = createHash('sha256').update(serializedSnapshot).digest('hex');

function writeArtifact(): void {
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, serializedSnapshot);
  console.log(
    `[gsv-snapshot-artifact] wrote ${path.relative(repoRoot, artifactPath)}; bytes=${Buffer.byteLength(serializedSnapshot)}; sha256=${snapshotHash}`,
  );
}

function verifyArtifact(): void {
  if (!existsSync(artifactPath)) {
    throw new Error(
      `missing ${path.relative(repoRoot, artifactPath)}; run npm run reports:gsv-snapshot:write`,
    );
  }

  const currentArtifact = readFileSync(artifactPath, 'utf8');
  if (currentArtifact !== serializedSnapshot) {
    const currentHash = createHash('sha256').update(currentArtifact).digest('hex');
    throw new Error(
      `snapshot parity drift: source=${snapshotHash}, artifact=${currentHash}; run npm run reports:gsv-snapshot:write`,
    );
  }

  console.log(
    `[gsv-snapshot-artifact] OK: source/artifact parity; bytes=${Buffer.byteLength(serializedSnapshot)}; sha256=${snapshotHash}`,
  );
}

if (process.argv.includes('--write')) {
  writeArtifact();
} else {
  verifyArtifact();
}
