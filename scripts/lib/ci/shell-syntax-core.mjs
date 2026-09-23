import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const LEGACY_CHANGED_FILES_ENV = 'FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES';
export const SHELL_CHANGED_FILES_ENV = 'AIOS_SHELL_SYNTAX_CHANGED_FILES';
export const SHELL_CHANGED_SCOPE_ENV = 'AIOS_SHELL_SYNTAX_CHANGED_SCOPE';

function normalizeChangedFile(entry) {
  const text = String(entry ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.includes(':')) {
    return text.slice(text.indexOf(':') + 1);
  }
  return text;
}

function isShellFile(relativePath) {
  return relativePath.endsWith('.sh') || relativePath.startsWith('.githooks/');
}

function passCheck(checked = 0) {
  return {
    checked,
    status: 0,
    stderr: '',
  };
}

function failCheck(status, stderr, checked = 1) {
  return {
    checked,
    status,
    stderr,
  };
}

function shellSyntaxParallelism(env = process.env) {
  const parsed = Number.parseInt(String(env.AIOS_SHELL_SYNTAX_PARALLELISM ?? '8'), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 8;
  }
  return Math.min(parsed, 16);
}

function checkShellFiles(repoRoot, relativePaths, env = process.env) {
  const files = [];
  const seen = new Set();
  for (const relativePath of relativePaths) {
    if (!isShellFile(relativePath) || seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    const absPath = path.join(repoRoot, relativePath);
    if (!existsSync(absPath) || !statSync(absPath).isFile()) {
      continue;
    }
    files.push(absPath);
  }

  if (files.length === 0) {
    return passCheck();
  }

  const result = spawnSync('xargs', ['-0', '-n', '1', '-P', String(shellSyntaxParallelism(env)), 'bash', '-n'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: Buffer.from(`${files.join('\0')}\0`),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    return failCheck(result.status ?? 1, result.stderr ?? result.stdout ?? '', files.length);
  }
  return passCheck(files.length);
}

function collectDirShellFiles(repoRoot, directory) {
  const files = [];
  const absDir = path.join(repoRoot, directory);
  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) {
    return files;
  }

  for (const entry of readdirSync(absDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectDirShellFiles(repoRoot, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      files.push(relativePath);
    }
  }
  return files;
}

function collectFullShellFiles(repoRoot) {
  const files = [];
  for (const directory of ['scripts', 'etl/groland_postgres/scripts']) {
    files.push(...collectDirShellFiles(repoRoot, directory));
  }

  for (const entry of readdirSync(repoRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      files.push(entry.name);
    }
  }
  return files;
}

function resolveShellSyntaxScope(env = process.env) {
  const explicitScope = String(env[SHELL_CHANGED_SCOPE_ENV] ?? '').trim();
  if (explicitScope) {
    if (explicitScope !== 'changed' && explicitScope !== 'full') {
      throw new Error(`invalid ${SHELL_CHANGED_SCOPE_ENV}: ${explicitScope}`);
    }
    return {
      changedFilesEnv: String(env[SHELL_CHANGED_FILES_ENV] ?? '').trim(),
      scope: explicitScope,
    };
  }

  const legacyChangedFilesEnv = String(env[LEGACY_CHANGED_FILES_ENV] ?? '').trim();
  return {
    changedFilesEnv: legacyChangedFilesEnv,
    scope: legacyChangedFilesEnv ? 'changed' : 'full',
  };
}

function checkChangedShellFiles(repoRoot, changedFilesEnv, env = process.env) {
  const seen = new Set();
  const changedShellFiles = [];
  for (const entry of changedFilesEnv.split(/\r?\n/)) {
    const file = normalizeChangedFile(entry);
    if (!file || seen.has(file)) {
      continue;
    }
    seen.add(file);
    if (!isShellFile(file)) {
      continue;
    }
    changedShellFiles.push(file);
  }
  return checkShellFiles(repoRoot, changedShellFiles, env);
}

function shellSyntaxRunResult(scope, checkResult) {
  if (checkResult.status !== 0) {
    return {
      checked: checkResult.checked,
      mode: scope,
      status: checkResult.status,
      stderr: checkResult.stderr,
      stdout: '',
    };
  }

  const mode = scope === 'full' ? 'full' : 'changed';
  return {
    checked: checkResult.checked,
    mode,
    status: 0,
    stderr: '',
    stdout: `[shell-syntax] OK checked=${checkResult.checked} mode=${mode}\n`,
  };
}

export function runShellSyntaxCheck(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  let scope;

  try {
    const resolved = resolveShellSyntaxScope(options.env ?? process.env);
    const { changedFilesEnv } = resolved;
    scope = resolved.scope;

    const env = options.env ?? process.env;
    const checkResult = scope === 'changed'
      ? checkChangedShellFiles(repoRoot, changedFilesEnv, env)
      : checkShellFiles(repoRoot, collectFullShellFiles(repoRoot), env);
    return shellSyntaxRunResult(scope, checkResult);
  } catch (error) {
    return {
      checked: 0,
      mode: scope ?? 'unknown',
      status: 1,
      stderr: `[shell-syntax] ${error.message}\n`,
      stdout: '',
    };
  }
}
