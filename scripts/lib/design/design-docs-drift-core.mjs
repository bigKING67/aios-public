/**
 * Blocks stale or incomplete design-system documentation.
 *
 * This is intentionally narrower than the runtime raw-color gates: docs may
 * contain canonical token definitions, but they should not reintroduce old
 * component APIs, old stylesheet names, Less-era token names, legacy color
 * literals, or stale verification instructions that conflict with DESIGN.md.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  getRepoRoot,
  readRepoFile,
  readRepoFileLines,
  repoFileExists,
} from '../shared/guard-utils.mjs';

export const DOC_PATH_ARGS = ['DESIGN.md', 'README.md', 'AGENTS.md', 'apps/web-vite/AGENTS.md', 'docs', 'apps/web-vite/src/docs'];
const ROOT_DOC_PATHS = Object.freeze(['DESIGN.md', 'README.md', 'AGENTS.md', 'apps/web-vite/AGENTS.md']);
const DOC_DIR_PATHS = Object.freeze(['docs', 'apps/web-vite/src/docs']);
const ALLOW_MARKER = 'docs-design-drift-allow';
const DESIGN_VALIDATION_SECTION = '## Validation Commands';
const STALE_README_VERIFY_CI_SUMMARY = 'lint + build + type-check + shell + cargo';

export const DESIGN_VALIDATION_COMMANDS = Object.freeze([
  'npm run verify:design:docs-behavior',
  'npm run verify:design:runtime-tokens-behavior',
  'npm run verify:design:runtime-tokens',
  'npm run verify:frontend:build-fingerprint-behavior',
  'npm run verify:frontend:quality-docs-drift-behavior',
  'npm run verify:frontend:quality-docs-drift',
  'npm run verify:frontend:design-evolution-behavior',
  'npm run verify:frontend:design-evolution',
  'npm run verify:frontend:delivery-gate-registry-behavior',
  'npm run verify:frontend:delivery-gate-registry',
  'npm run verify:frontend:preflight',
]);

const BLOCKED_PATTERNS = [
  {
    name: 'legacy TrendIndicator isUp prop',
    pattern: /\bisUp\s*:\s*boolean\b|\bisUp\s*=\s*(?:\{|true|false)/,
    guidance: 'Use direction="up|down|neutral" instead of isUp.',
  },
  {
    name: 'legacy trend payload isUp field',
    pattern: /\b(?:wow|yoy)\??\s*:\s*\{[^}\n]*\bisUp\b/,
    guidance: 'Use { value, direction } for trend payloads.',
  },
  {
    name: 'legacy KPIGrid component/path',
    pattern: /\bKPIGrid\b|src\/components\/organisms\/KPIGrid\.tsx/,
    guidance: 'Use KPICardGrid and apps/web-vite/src/components/organisms/kpi-card-grid.tsx.',
  },
  {
    name: 'legacy statusColorMap',
    pattern: /\bstatusColorMap\b/,
    guidance: 'Use status token aliases or centralized status helpers.',
  },
  {
    name: 'legacy Arco design reference',
    pattern: /\bArco Design\b/,
    guidance: 'AIOS current UI stack is Ant Design + tokenized CSS.',
  },
  {
    name: 'legacy design-system.css entrypoint',
    pattern: /\bdesign-system\.css\b/,
    guidance: 'Use apps/web-vite/src/styles/design-tokens.css as the runtime token entrypoint.',
  },
  {
    name: 'legacy Less color token',
    pattern: /@(?:primary|text)-color\b/,
    guidance: 'Use CSS variables from DESIGN.md instead of Less-era @*-color tokens.',
  },
  {
    name: 'legacy --color status token in docs',
    pattern: /--color-(?:success|danger|warning|info)\b/,
    guidance: 'Use --status-* for system states and --trend-* for business deltas.',
  },
  {
    name: 'legacy Arco/old neutral raw color',
    pattern: /#(?:1F2329|F4F5F9|E5E6EB|F2F3F5)\b/i,
    guidance: 'Use the current neutral tokens from DESIGN.md.',
  },
  {
    name: 'legacy raw rgba color',
    pattern: /rgba\((?:31,\s*35,\s*41|50,\s*100,\s*246)\b/i,
    guidance: 'Use current CSS variables and semantic aliases instead of raw rgba literals.',
  },
];

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listMarkdownFilesRecursive(repoRoot, relativeDir) {
  const dirPath = path.join(repoRoot, relativeDir);
  if (!repoFileExists(repoRoot, relativeDir)) {
    return [];
  }
  const stat = statSync(dirPath);
  if (!stat.isDirectory()) {
    return relativeDir.endsWith('.md') ? [relativeDir] : [];
  }

  const files = [];
  function walk(absDir) {
    const entries = readdirSync(absDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(normalizeRepoPath(path.relative(repoRoot, absPath)));
      }
    }
  }

  walk(dirPath);
  return files;
}

export function listDesignDocs(repoRoot = getRepoRoot()) {
  const docs = new Set();
  for (const filePath of ROOT_DOC_PATHS) {
    if (repoFileExists(repoRoot, filePath)) {
      docs.add(filePath);
    }
  }
  for (const dirPath of DOC_DIR_PATHS) {
    for (const filePath of listMarkdownFilesRecursive(repoRoot, dirPath)) {
      docs.add(filePath);
    }
  }
  return [...docs].sort();
}

function getMarkdownSection(source, heading) {
  const startIndex = source.indexOf(heading);
  if (startIndex === -1) {
    return null;
  }

  const nextHeadingIndex = source.indexOf('\n## ', startIndex + heading.length);
  return nextHeadingIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, nextHeadingIndex);
}

function lineNumberForText(source, needle) {
  const index = source.indexOf(needle);
  if (index === -1) {
    return 1;
  }
  return source.slice(0, index).split('\n').length;
}

function shouldSkipBlockedPatternLine(file, line) {
  return (
    line.includes(ALLOW_MARKER) ||
    (
      file === 'DESIGN.md' &&
      line.includes('Documentation drift enforcement is executable')
    )
  );
}

function validateDesignValidationCommands(repoRoot, violations) {
  const file = 'DESIGN.md';
  if (!repoFileExists(repoRoot, file)) {
    violations.push({
      file,
      lineNumber: 1,
      rule: {
        name: 'missing DESIGN.md',
        guidance: 'Add DESIGN.md before relying on design documentation drift checks.',
      },
      line: file,
    });
    return;
  }

  const source = readRepoFile(repoRoot, file);
  const validationSection = getMarkdownSection(source, DESIGN_VALIDATION_SECTION);
  const sectionLineNumber = lineNumberForText(source, DESIGN_VALIDATION_SECTION);

  if (!validationSection) {
    violations.push({
      file,
      lineNumber: 1,
      rule: {
        name: 'missing DESIGN.md validation section',
        guidance: `Add a ${DESIGN_VALIDATION_SECTION} section that lists the required frontend design verification commands.`,
      },
      line: DESIGN_VALIDATION_SECTION,
    });
    return;
  }

  for (const command of DESIGN_VALIDATION_COMMANDS) {
    if (!validationSection.includes(command)) {
      violations.push({
        file,
        lineNumber: sectionLineNumber,
        rule: {
          name: 'missing DESIGN.md validation command',
          guidance: `Add ${command} to the DESIGN.md Validation Commands block.`,
        },
        line: command,
      });
    }
  }
}

function validateReadmeVerifyCiSummary(repoRoot, violations) {
  const file = 'README.md';
  if (!repoFileExists(repoRoot, file)) {
    return;
  }

  const lines = readRepoFileLines(repoRoot, file);
  lines.forEach((line, index) => {
    if (line.includes(STALE_README_VERIFY_CI_SUMMARY)) {
      violations.push({
        file,
        lineNumber: index + 1,
        rule: {
          name: 'stale README verify:ci summary',
          guidance: 'Describe verify:ci as covering design/frontend/weekly gates, backend, shell syntax, and frontend preflight.',
        },
        line: line.trim(),
      });
    }
  });
}

export function checkDesignDocsDrift(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const docs = options.docs ?? listDesignDocs(repoRoot);
  const violations = [];

  for (const file of docs) {
    const lines = readRepoFileLines(repoRoot, file);
    lines.forEach((line, index) => {
      if (shouldSkipBlockedPatternLine(file, line)) {
        return;
      }

      for (const rule of BLOCKED_PATTERNS) {
        if (rule.pattern.test(line)) {
          violations.push({
            file,
            lineNumber: index + 1,
            rule,
            line: line.trim(),
          });
        }
      }
    });
  }

  validateDesignValidationCommands(repoRoot, violations);
  validateReadmeVerifyCiSummary(repoRoot, violations);

  return { docs, violations };
}

export function formatDesignDocsDriftResult(result) {
  const { docs, violations } = result;

  if (violations.length > 0) {
    const stderrLines = ['[docs-design-drift] Found stale design-system documentation patterns:'];
    for (const violation of violations) {
      stderrLines.push(
        `- ${violation.file}:${violation.lineNumber} ${violation.rule.name}: ${violation.line}`,
      );
      stderrLines.push(`  ${violation.rule.guidance}`);
    }
    stderrLines.push(
      '',
      `If this is an intentional historical note, add "${ALLOW_MARKER}" on the same line.`,
    );
    return {
      status: 1,
      stderr: `${stderrLines.join('\n')}\n`,
      stdout: '',
    };
  }

  return {
    status: 0,
    stderr: '',
    stdout: `[docs-design-drift] OK: scanned ${docs.length} markdown docs; no stale design-system patterns or validation drift found.\n`,
  };
}
