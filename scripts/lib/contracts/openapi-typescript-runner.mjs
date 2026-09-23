import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function normalizeOpenapiTypescriptSource(source) {
  return source.replace(
    'type OneOf<T extends any[]>',
    'type OneOf<T extends unknown[]>',
  );
}

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
  const generatedSource = readFileSync(outputPath, 'utf8');
  const normalizedSource = normalizeOpenapiTypescriptSource(generatedSource);
  if (normalizedSource !== generatedSource) {
    writeFileSync(outputPath, normalizedSource);
  }
}
