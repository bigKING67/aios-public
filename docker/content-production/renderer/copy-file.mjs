import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';

// Prefer copy-on-write so immutable render inputs do not consume full blocks
// repeatedly. Platforms without reflink support retain normal copy semantics.
const flags = constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE;

export async function copyImmutable(source, target) {
  await fs.copyFile(source, target, flags);
}
