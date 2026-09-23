#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCS_DETAIL_PAGES,
  DOCS_PAGE_LINKS,
  DOCS_PAGES,
} from '../../../apps/web-vite/src/app/docs/docs-workspace-data';
import type { DocsWorkspaceSnapshot } from '../../../apps/web-vite/src/app/docs/docs-workspace-contracts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const artifactPath = path.join(repoRoot, 'public/docs/workspace-v1.json');
const snapshot: DocsWorkspaceSnapshot = {
  version: 1,
  pageLinks: DOCS_PAGE_LINKS,
  pages: DOCS_PAGES,
  detailPages: DOCS_DETAIL_PAGES,
};
const serializedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;
const snapshotHash = createHash('sha256').update(serializedSnapshot).digest('hex');

function writeArtifact(): void {
  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, serializedSnapshot);
  console.log(
    `[docs-workspace-snapshot] wrote ${path.relative(repoRoot, artifactPath)}; bytes=${Buffer.byteLength(serializedSnapshot)}; sha256=${snapshotHash}`,
  );
}

function verifyArtifact(): void {
  if (!existsSync(artifactPath)) {
    throw new Error(
      `missing ${path.relative(repoRoot, artifactPath)}; run npm run docs:workspace-snapshot:write`,
    );
  }

  const currentArtifact = readFileSync(artifactPath, 'utf8');
  if (currentArtifact !== serializedSnapshot) {
    const currentHash = createHash('sha256').update(currentArtifact).digest('hex');
    throw new Error(
      `snapshot parity drift: source=${snapshotHash}, artifact=${currentHash}; run npm run docs:workspace-snapshot:write`,
    );
  }

  console.log(
    `[docs-workspace-snapshot] OK: source/artifact parity; bytes=${Buffer.byteLength(serializedSnapshot)}; sha256=${snapshotHash}`,
  );
}

if (process.argv.includes('--write')) {
  writeArtifact();
} else {
  verifyArtifact();
}
