#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  getQualityProfile,
  QUALITY_PROFILE_NAMES,
} from '../lib/quality/quality-profiles.mjs';

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', scriptName], {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${scriptName} exited with code ${code}`));
    });
  });
}

async function main() {
  const profileName = process.argv[2] || '';
  const profile = getQualityProfile(profileName);

  if (!profile) {
    console.error(`[quality-profile] unknown profile: ${profileName || '<empty>'}`);
    console.error(`[quality-profile] available profiles: ${QUALITY_PROFILE_NAMES.join(', ')}`);
    process.exit(1);
  }

  console.error('[quality-profile] scripts/ci/run-quality-profile.mjs is deprecated.');
  console.error(`[quality-profile] use: node scripts/quality-runner.mjs run ${profile.name}`);
  await runNpmScript(`verify:${profile.name}`);
}

main().catch((error) => {
  console.error('[quality-profile] failed:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
