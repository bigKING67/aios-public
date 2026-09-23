/**
 * Frontend module naming audit core.
 *
 * Production frontend files should not look like stale copies, temporary
 * experiments, or retired compatibility leftovers. Ambiguous names make cleanup
 * audits noisy and encourage future agents to preserve bad structure.
 */

import path from 'node:path';
import {
  listGitFiles,
} from '../shared/guard-utils.mjs';

export const FRONTEND_MODULE_NAMES_GUARD_NAME = 'frontend-misleading-module-names';

const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|css)$/;

const MISLEADING_SUFFIXES = Object.freeze([
  {
    suffix: 'copy',
    reason: '"copy" reads as an accidental duplicate artifact in production source',
    suggestion: 'rename to the real responsibility, for example "*-diagnostics", "*-copywriting", or a clipboard-specific name',
  },
  {
    suffix: 'backup',
    reason: '"backup" implies a local fallback copy that should not live in production source',
    suggestion: 'remove the backup file or promote it to a real module name before committing',
  },
  {
    suffix: 'old',
    reason: '"old" implies retained legacy code without a current responsibility',
    suggestion: 'delete the old module or rename it to the current production responsibility',
  },
  {
    suffix: 'temp',
    reason: '"temp" implies temporary implementation debt in production source',
    suggestion: 'finish the implementation or rename it to a stable responsibility',
  },
  {
    suffix: 'tmp',
    reason: '"tmp" implies temporary implementation debt in production source',
    suggestion: 'finish the implementation or rename it to a stable responsibility',
  },
  {
    suffix: 'demo',
    reason: '"demo" implies non-production showcase code in the production frontend tree',
    suggestion: 'move demos out of production source or rename the module to its shipped feature responsibility',
  },
  {
    suffix: 'sample',
    reason: '"sample" implies example code rather than shipped product code',
    suggestion: 'move samples out of production source or rename the module to its shipped feature responsibility',
  },
  {
    suffix: 'wip',
    reason: '"wip" implies unfinished code in production source',
    suggestion: 'finish the module before committing or keep it out of production source',
  },
  {
    suffix: 'legacy',
    reason: '"legacy" hides why a module still exists and weakens cleanup boundaries',
    suggestion: 'delete retired code or rename supported compatibility code to an explicit responsibility',
  },
  {
    suffix: 'deprecated',
    reason: '"deprecated" implies a retired path still present in production source',
    suggestion: 'delete retired code or document the compatibility boundary with a precise module name',
  },
  {
    suffix: 'unused',
    reason: '"unused" contradicts production source ownership',
    suggestion: 'delete unused code instead of preserving it under an unused filename',
  },
  {
    suffix: 'duplicate',
    reason: '"duplicate" implies unresolved consolidation debt',
    suggestion: 'merge the duplicate or rename the surviving module to its real responsibility',
  },
]);

const GENERIC_TEMPLATE_SUFFIX = Object.freeze({
  suffix: 'template',
  reason: '"template" is too vague for production frontend modules',
  suggestion: 'rename to a responsibility-specific suffix such as "*-template-resolver", "*-template-builder", or plural "*-templates" when it truly stores reusable templates',
});

export function isFrontendModuleNameSourceFile(file) {
  return (
    (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/')) &&
    SOURCE_FILE_PATTERN.test(file)
  );
}

function sourceStem(file) {
  const basename = path.basename(file);
  if (basename.endsWith('.module.css')) {
    return basename.slice(0, -'.module.css'.length);
  }

  return basename.replace(/\.(?:ts|tsx|js|jsx|css)$/, '');
}

export function listFrontendModuleNameSourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

function findingForSuffix(file, stem, rule) {
  return stem.endsWith(`-${rule.suffix}`)
    ? {
        file,
        suffix: rule.suffix,
        reason: rule.reason,
        suggestion: rule.suggestion,
      }
    : null;
}

export function auditFrontendModuleNameFile(file) {
  const stem = sourceStem(file);
  const findings = [];

  const templateFinding = findingForSuffix(file, stem, GENERIC_TEMPLATE_SUFFIX);
  if (templateFinding) {
    findings.push(templateFinding);
  }

  for (const rule of MISLEADING_SUFFIXES) {
    const finding = findingForSuffix(file, stem, rule);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

export function auditFrontendModuleNameFiles(files) {
  return files.flatMap(auditFrontendModuleNameFile);
}

export function auditFrontendModuleNames(repoRoot) {
  const files = listFrontendModuleNameSourceFiles(repoRoot);
  return {
    files,
    findings: auditFrontendModuleNameFiles(files),
  };
}

export function formatFrontendModuleNamesResult({ files, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${FRONTEND_MODULE_NAMES_GUARD_NAME}] OK: scanned ${files.length} frontend source files; no misleading production module names found.\n`,
      stderr: '',
    };
  }

  const lines = [`[${FRONTEND_MODULE_NAMES_GUARD_NAME}] Misleading production frontend module names were found:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}`);
    lines.push(`  suffix: ${finding.suffix}`);
    lines.push(`  reason: ${finding.reason}`);
    lines.push(`  suggestion: ${finding.suggestion}`);
  }
  lines.push(
    '',
    'Keep production frontend filenames aligned to shipped responsibilities; do not preserve stale copy/temp/legacy artifacts by name.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
