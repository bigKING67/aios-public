#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  AIOS_GENERATED_TYPES_PATH,
  AIOS_OPENAPI_PATH,
} from '../config/contracts/aios-api-contract.mjs';
import { buildAiosOpenApi, renderAiosOpenApi } from '../lib/contracts/aios-openapi-core.mjs';
import { runOpenapiTypescript } from '../lib/contracts/openapi-typescript-runner.mjs';

for (const filePath of [AIOS_OPENAPI_PATH, AIOS_GENERATED_TYPES_PATH]) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
const document = buildAiosOpenApi();
writeFileSync(AIOS_OPENAPI_PATH, renderAiosOpenApi(document));
runOpenapiTypescript({ inputPath: AIOS_OPENAPI_PATH, outputPath: AIOS_GENERATED_TYPES_PATH });
console.log(
  `[aios-openapi-generate] wrote ${AIOS_OPENAPI_PATH} and ${AIOS_GENERATED_TYPES_PATH}; operations=${document['x-aios-contract'].operationCount}`,
);
