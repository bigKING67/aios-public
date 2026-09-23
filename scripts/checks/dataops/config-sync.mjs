#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildDataOpsConfig } = require('../../dataops/export-dataops-config-json.js');

const REQUIRED_PRODUCTION_TRIGGER_PIPELINES = [
  {
    id: 'ads_marketing_industry_articles_incremental',
    flowName: 'sync-marketing-industry-articles-flow',
    deploymentName: 'ads-21-marketing-industry-articles-inc',
  },
  {
    id: 'ads_marketing_industry_articles_cache_sweep',
    flowName: 'sync-marketing-industry-articles-flow',
    deploymentName: 'ads-21-marketing-industry-articles-cache-sweep',
  },
  {
    id: 'ads_marketing_industry_articles_content_retry',
    flowName: 'sync-marketing-industry-articles-flow',
    deploymentName: 'ads-21-marketing-industry-articles-content-retry',
  },
  {
    id: 'daily_business_brief',
    flowName: 'daily-business-brief-flow',
    deploymentName: 'daily-business-brief',
    batchTriggerAllowed: false,
  },
];

function fail(message) {
  console.error(`[dataops-config-sync] ERROR: ${message}`);
  process.exit(1);
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function assertUniquePipelineField(pipelines, field) {
  const seen = new Set();
  for (const pipeline of pipelines) {
    const value = pipeline[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`pipeline has an empty ${field}`);
    }
    if (seen.has(value)) {
      fail(`duplicate pipeline ${field}: ${value}`);
    }
    seen.add(value);
  }
}

function assertRequiredProductionTriggerPipelines(pipelines) {
  const byId = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline]));
  for (const required of REQUIRED_PRODUCTION_TRIGGER_PIPELINES) {
    const pipeline = byId.get(required.id);
    if (!pipeline) {
      fail(`missing required production trigger pipeline: ${required.id}`);
    }
    if (
      pipeline.flowName !== required.flowName ||
      pipeline.deploymentName !== required.deploymentName
    ) {
      fail(
        `required production trigger pipeline mapping drifted: ${required.id}`,
      );
    }
    if (
      required.batchTriggerAllowed !== undefined &&
      pipeline.batchTriggerAllowed !== required.batchTriggerAllowed
    ) {
      fail(`required production trigger batch policy drifted: ${required.id}`);
    }
  }
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const outputPath = path.join(repoRoot, 'backend-rust/src/dataops_config.json');

  if (!fs.existsSync(outputPath)) {
    fail(`missing generated config: ${path.relative(repoRoot, outputPath)}`);
  }

  const config = buildDataOpsConfig(repoRoot);
  assertUniquePipelineField(config.pipelines, 'id');
  assertUniquePipelineField(config.pipelines, 'deploymentName');
  assertRequiredProductionTriggerPipelines(config.pipelines);

  const expected = stableJson(config);
  const actual = fs.readFileSync(outputPath, 'utf8');

  if (actual !== expected) {
    fail(
      [
        'backend-rust/src/dataops_config.json is out of sync with TS config.',
        'Run: node scripts/dataops/export-dataops-config-json.js',
      ].join('\n'),
    );
  }

  console.log('[dataops-config-sync] OK: backend-rust/src/dataops_config.json matches TS config.');
}

main();
