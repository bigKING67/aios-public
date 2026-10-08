import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function runOpenapiTypescript({ inputPath, outputPath, repoRoot = process.cwd() }) {
  const executable = path.join(repoRoot, 'node_modules', '.bin', 'openapi-typescript');
  const result = spawnSync(executable, [inputPath, '--output', outputPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`openapi-typescript failed with exit ${result.status}: ${detail || 'no output'}`);
  }
}
