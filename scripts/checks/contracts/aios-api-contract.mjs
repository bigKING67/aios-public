#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  AIOS_GENERATED_TYPES_PATH,
  AIOS_OPENAPI_PATH,
} from '../../config/contracts/aios-api-contract.mjs';
import { buildAiosOpenApi, renderAiosOpenApi } from '../../lib/contracts/aios-openapi-core.mjs';
import { runOpenapiTypescript } from '../../lib/contracts/openapi-typescript-runner.mjs';

const expectedOpenApi = renderAiosOpenApi(buildAiosOpenApi());
const failures = [];
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const checkedGeneratedTypes = existsSync(AIOS_GENERATED_TYPES_PATH)
  ? readFileSync(AIOS_GENERATED_TYPES_PATH)
  : Buffer.alloc(0);
if (!existsSync(AIOS_OPENAPI_PATH)) {
  failures.push(`${AIOS_OPENAPI_PATH} is missing.`);
} else if (readFileSync(AIOS_OPENAPI_PATH, 'utf8') !== expectedOpenApi) {
  failures.push(`${AIOS_OPENAPI_PATH} drifted; run npm run generate:api-contract.`);
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-openapi-'));
try {
  const tempOpenApi = path.join(tempDir, 'aios-v2.json');
  const tempTypes = path.join(tempDir, 'aios-v2.ts');
  writeFileSync(tempOpenApi, expectedOpenApi);
  runOpenapiTypescript({ inputPath: tempOpenApi, outputPath: tempTypes });
  if (!existsSync(AIOS_GENERATED_TYPES_PATH)) {
    failures.push(`${AIOS_GENERATED_TYPES_PATH} is missing.`);
  } else if (checkedGeneratedTypes.toString('utf8') !== readFileSync(tempTypes, 'utf8')) {
    failures.push(`${AIOS_GENERATED_TYPES_PATH} drifted; run npm run generate:api-contract.`);
  }
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}

const cutoverLedger = readFileSync('docs/API_V2_CUTOVER_LEDGER.md', 'utf8');
for (const [label, content] of [
  ['OpenAPI', expectedOpenApi],
  ['Generated TypeScript', checkedGeneratedTypes],
]) {
  if (!cutoverLedger.includes(`- ${label} SHA-256: \`${sha256(content)}\``)) {
    failures.push(`docs/API_V2_CUTOVER_LEDGER.md must record the current ${label} SHA-256.`);
  }
}
if (!cutoverLedger.includes('- Status: `not_ready`') || !cutoverLedger.includes('- `/v1` runtime mount: active')) {
  failures.push('docs/API_V2_CUTOVER_LEDGER.md must keep the pre-cutover decision explicit.');
}
if ((cutoverLedger.match(/^\| [1-7] \|/gm) ?? []).length !== 7) {
  failures.push('docs/API_V2_CUTOVER_LEDGER.md must retain seven daily evidence slots.');
}

if (failures.length) {
  console.error('[aios-api-contract] failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const contract = JSON.parse(expectedOpenApi);
  console.log(`[aios-api-contract] OK: deterministic OpenAPI and generated TypeScript; operations=${contract['x-aios-contract'].operationCount}.`);
}
