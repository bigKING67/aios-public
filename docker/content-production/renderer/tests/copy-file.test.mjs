import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { copyImmutable } from '../copy-file.mjs';

test('copy-on-write import remains isolated and exclusive', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'creative-copy-'));
  try {
    const source = path.join(root, 'source.media');
    const target = path.join(root, 'target.media');
    await writeFile(source, Buffer.alloc(1024 * 1024, 7));
    await copyImmutable(source, target);
    assert.deepEqual(await readFile(target), await readFile(source));
    await writeFile(target, 'changed');
    assert.equal((await readFile(source)).length, 1024 * 1024);
    await assert.rejects(copyImmutable(source, target), { code: 'EEXIST' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
