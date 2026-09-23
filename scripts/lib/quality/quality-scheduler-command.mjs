import { spawn } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const GIT_REPOSITORY_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]);

export function parseCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('empty command');
  }
  return command;
}

function parseDirectCommand(command) {
  const trimmed = parseCommand(command).trim();
  if (/["'\\$`|&;<>(){}\n\r]/.test(trimmed) || /[*?[\]]/.test(trimmed)) {
    return null;
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts[0].includes('=')) {
    return null;
  }
  return {
    args: parts.slice(1),
    command: parts[0],
  };
}

export function createCommandEnv(repoRoot = process.cwd(), overrides = {}) {
  const nodeBinPath = path.join(repoRoot, 'node_modules', '.bin');
  const existingPath = process.env.PATH ?? '';
  const inheritedEnv = { ...process.env };
  // Each gate receives repoRoot as cwd; inherited hook Git state can point
  // nested fixture commands back at the outer repository.
  for (const key of GIT_REPOSITORY_ENV_KEYS) {
    delete inheritedEnv[key];
  }
  return {
    ...inheritedEnv,
    PATH: existingPath ? `${nodeBinPath}${path.delimiter}${existingPath}` : nodeBinPath,
    ...overrides,
  };
}

export function runShellCommand(command, options = {}) {
  const {
    cwd,
    env = {},
    verbose = false,
  } = options;
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const direct = parseDirectCommand(command);
    const child = direct ? spawn(direct.command, direct.args, {
      cwd,
      env: createCommandEnv(cwd, env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }) : spawn(command, {
      cwd,
      env: createCommandEnv(cwd, env),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (verbose) {
        process.stdout.write(text);
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (verbose) {
        process.stderr.write(text);
      }
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    child.on('exit', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
  });
}
