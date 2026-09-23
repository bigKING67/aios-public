#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getRepoRoot } from '../lib/shared/guard-utils.mjs';

const VALID_PROFILES = new Set(['public', 'anonymous-auth', 'authenticated']);
const DEFAULT_PORT = 4173;
const STARTUP_TIMEOUT_MS = 20_000;
const STARTUP_POLL_MS = 250;

function parseArgs(argv) {
  let profile = 'public';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') {
      profile = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VALID_PROFILES.has(profile)) {
    throw new Error(`Invalid --profile ${JSON.stringify(profile)}. Expected one of: ${[...VALID_PROFILES].join(', ')}.`);
  }

  return { profile };
}

function parsePort() {
  const rawPort = process.env.FRONTEND_SMOKE_PREVIEW_PORT || String(DEFAULT_PORT);
  const parsed = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid FRONTEND_SMOKE_PREVIEW_PORT: ${rawPort}`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPreview(baseUrl, child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = 'preview did not respond yet';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited before it became reachable (code ${child.exitCode}).`);
    }

    try {
      const response = await fetchWithTimeout(baseUrl, 1_000);
      if (response.status < 500) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(STARTUP_POLL_MS);
  }

  throw new Error(`Timed out waiting for Vite preview at ${baseUrl}: ${lastError}`);
}

function ensureBuiltDist(repoRoot) {
  const indexPath = path.join(repoRoot, 'apps/web-vite/dist/index.html');
  const manifestPath = path.join(repoRoot, 'apps/web-vite/dist/aios-build-manifest.json');

  if (!existsSync(indexPath) || !existsSync(manifestPath)) {
    throw new Error(
      [
        'Production preview smoke requires a current Vite build output.',
        'Run npm run build before this command.',
        'Expected files:',
        '  apps/web-vite/dist/index.html',
        '  apps/web-vite/dist/aios-build-manifest.json',
      ].join('\n'),
    );
  }
}

function smokeEnvForProfile(profile, baseUrl) {
  const env = {
    ...process.env,
    FRONTEND_SMOKE_BASE_URL: baseUrl,
  };

  if (profile === 'anonymous-auth') {
    env.FRONTEND_SMOKE_INCLUDE_OPTIONAL = '1';
  }

  if (profile === 'authenticated') {
    env.FRONTEND_SMOKE_AUTH_PROFILE = '1';
    if (!env.FRONTEND_SMOKE_COOKIE_HEADER && !env.FRONTEND_SMOKE_AUTH_COOKIE) {
      throw new Error(
        [
          'Authenticated preview smoke requires a temporary Cookie header.',
          'Set FRONTEND_SMOKE_COOKIE_HEADER="name=value; other=value" and rerun.',
          'For an interactive VPS shell, use: read -rs -p "FRONTEND_SMOKE_COOKIE_HEADER: " FRONTEND_SMOKE_COOKIE_HEADER',
          'Do not commit cookies or credentials to repository files.',
        ].join('\n'),
      );
    }
  }

  return env;
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const repoRoot = getRepoRoot();
  const { profile } = parseArgs(process.argv.slice(2));
  const port = parsePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  ensureBuiltDist(repoRoot);

  const preview = spawn('npm', [
    'run',
    'preview:vite',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_PREVIEW_PORT: String(port),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    await waitForPreview(baseUrl, preview);
    console.log(`[frontend-smoke-preview] profile=${profile} base_url=${baseUrl}`);
    await runCommand('npm', ['run', 'test:frontend:smoke'], {
      cwd: repoRoot,
      env: smokeEnvForProfile(profile, baseUrl),
    });
  } finally {
    if (preview.exitCode === null) {
      preview.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        preview.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

main().catch((error) => {
  console.error('[frontend-smoke-preview] failed:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
