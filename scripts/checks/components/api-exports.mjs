#!/usr/bin/env node

/**
 * Keeps component APIs discoverable from source after retiring hand-written
 * component library docs. Public component props should be exported from the
 * component file so consumers and tooling can import them directly.
 */

import { getRepoRoot, listGitFiles, readRepoFileLines } from '../../lib/shared/guard-utils.mjs';

const SOURCE_PATH_ARGS = ['apps/web-vite/src/components'];

function listComponentFiles(repoRoot) {
  return listGitFiles(SOURCE_PATH_ARGS, {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.tsx'),
  });
}

export function checkComponentApiExports(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const files = options.files ?? listComponentFiles(repoRoot);
  const violations = [];

  for (const file of files) {
    const lines = readRepoFileLines(repoRoot, file);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^(interface|type)\s+[A-Z][A-Za-z0-9]*Props\b/.test(trimmed)) {
        violations.push({
          file,
          lineNumber: index + 1,
          line: trimmed,
          reason: 'Props type is not exported.',
        });
      }

      if (/\b(?:React\.)?FC\s*<\s*Props\s*>/.test(trimmed)) {
        violations.push({
          file,
          lineNumber: index + 1,
          line: trimmed,
          reason: 'Anonymous Props interface hides the component API.',
        });
      }
    });
  }

  return { files, violations };
}

export function formatComponentApiExportsResult(result) {
  const { files, violations } = result;

  if (violations.length > 0) {
    const stderrLines = ['[component-api-exports] Found non-exported component API contracts:'];
    for (const violation of violations) {
      stderrLines.push(`- ${violation.file}:${violation.lineNumber} ${violation.reason}`);
      stderrLines.push(`  ${violation.line}`);
    }
    stderrLines.push('', 'Export component props from the source file instead of documenting them in Markdown.');
    return {
      status: 1,
      stderr: `${stderrLines.join('\n')}\n`,
      stdout: '',
    };
  }

  return {
    status: 0,
    stderr: '',
    stdout: `[component-api-exports] OK: scanned ${files.length} component files; all Props contracts are exported.\n`,
  };
}

function main() {
  const output = formatComponentApiExportsResult(checkComponentApiExports());
  if (output.stdout) {
    process.stdout.write(output.stdout);
  }
  if (output.stderr) {
    process.stderr.write(output.stderr);
  }
  if (output.status !== 0) {
    process.exit(output.status);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
