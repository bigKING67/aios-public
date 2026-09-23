/**
 * Blocks retired frontend leftovers from drifting back into the Vite runtime.
 *
 * These files and symbols belonged to old Next/App Router shims, dashboard
 * demos, local cache helpers, or unused admin components. Reintroducing them
 * should be a deliberate new implementation, not an accidental resurrection.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  createLineStartOffsets,
  getRepoRoot,
  lineNumberForOffset,
  listGitFiles,
  readRequiredFile,
} from '../shared/guard-utils.mjs';
import stripJsonComments from 'strip-json-comments';

const GUARD_NAME = 'retired-frontend-leftovers';
const SCAN_PATHS = Object.freeze(['src', 'apps', 'docs', 'package.json', 'tsconfig.json', 'AGENTS.md', 'README.md']);
const TEXT_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs|css|md|json)$/;

const RETIRED_PATHS = Object.freeze([
  '.next',
  'middleware.js',
  'middleware.ts',
  'next-env.d.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'pages',
  'apps/web-vite/src/vite-compat',
  'apps/web-vite/src/store',
  'apps/web-vite/src/pages',
  'apps/web-vite/src/app/api',
  'apps/web-vite/src/stores/filter.store.ts',
  'apps/web-vite/src/stores/ui.store.ts',
  'apps/web-vite/src/context/USAGE_GUIDE.md',
  'apps/web-vite/src/types/dashboard.ts',

  'apps/web-vite/src/components/dashboard-grid.tsx',
  'apps/web-vite/src/components/theme-toggle.tsx',
  'apps/web-vite/src/components/molecules/realtime-status.tsx',
  'apps/web-vite/src/components/molecules/realtime-status.module.css',
  'apps/web-vite/src/components/organisms/dashboard-editor.tsx',
  'apps/web-vite/src/components/organisms/dashboard-editor.module.css',
  'apps/web-vite/src/components/organisms/permission-matrix.tsx',
  'apps/web-vite/src/components/organisms/role-management.tsx',

  'apps/web-vite/src/app/dashboard/_components/DashboardClient.tsx',
  'apps/web-vite/src/app/dashboard/_components/DashboardWithRealtime.tsx',
  'apps/web-vite/src/app/dashboard/_components/dashboard-overview-display-state.ts',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-content.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-header.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-kpi-value.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-kpi.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-platform-table.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-platform.module.css',
  'apps/web-vite/src/app/dashboard/_components/dashboard-realtime-state.module.css',

  'apps/web-vite/src/app/dashboard/creator/layout.tsx',

  'apps/web-vite/src/hooks/use-cache.ts',
  'apps/web-vite/src/hooks/use-realtime-data.ts',
  'apps/web-vite/src/hooks/use-report.ts',
  'apps/web-vite/src/lib/auth-session.ts',
  'apps/web-vite/src/lib/cache.ts',
  'apps/web-vite/src/lib/server-queries.ts',
  'apps/web-vite/src/lib/week-utils.ts',

  'docs/P1_COMPONENT_REFACTOR.md',
  'docs/P1_TASK2_SERVER_COMPONENTS.md',
  'docs/P1_TASK3_CACHING_STRATEGY.md',
  'docs/PHASE_A_WEEK1_DAILY_CHECKLIST.md',
  'docs/PROJECT_TIMELINE.md',
]);

const FORBIDDEN_PATTERNS = Object.freeze([
  {
    pattern: /@\/vite-compat|src\/vite-compat/,
    reason: 'Vite compatibility shim was removed.',
  },
  {
    pattern: /from\s+['"]@\/store(?:\/[^'"]*)?['"]|import\s*\(\s*['"]@\/store(?:\/[^'"]*)?['"]\s*\)/,
    reason: '@/store alias was removed; use the current scoped stores only when needed.',
  },
  {
    pattern: /from\s+['"]@\/stores\/(?:filter|ui)\.store['"]/,
    reason: 'retired filter/ui stores were removed.',
  },
  {
    pattern: /(?:types\/dashboard|@\/types\/dashboard)/,
    reason: 'retired dashboard type module was removed.',
  },
  {
    pattern: /\bDashboardClient\b/,
    reason: 'retired configurable dashboard client was removed.',
  },
  {
    pattern: /\bDashboardWithRealtime\b/,
    reason: 'retired realtime dashboard demo was removed.',
  },
  {
    pattern: /\bDashboardEditor\b/,
    reason: 'retired dashboard editor demo was removed.',
  },
  {
    pattern: /\bDashboardGrid\b/,
    reason: 'retired dashboard grid demo was removed.',
  },
  {
    pattern: /\bRealtimeStatus\b/,
    reason: 'retired realtime status demo was removed.',
  },
  {
    pattern: /\bThemeToggle\b/,
    reason: 'retired theme toggle demo was removed.',
  },
  {
    pattern: /\buseRealtimeData\b/,
    reason: 'retired realtime hook was removed.',
  },
  {
    pattern: /\buseCache\b|\buseReport\b/,
    reason: 'retired cache/report hooks were removed; use React Query report hooks.',
  },
  {
    pattern: /(?:@\/lib\/(?:cache|server-queries)|src\/lib\/(?:cache|server-queries))/,
    reason: 'retired cache/server-query helpers were removed.',
  },
  {
    pattern: /\bServer Component\b|\bserver component\b|export\s+const\s+metadata\b|next\/(?:cache|image|link|navigation|og|router|server)/,
    reason: 'Next/App Router leftovers are not part of the current Vite runtime.',
  },
  {
    pattern: /\bNEXT_(?:PUBLIC|INTERNAL)[A-Z0-9_]*\b/,
    reason: 'Next-style environment variables were retired; use VITE_* or backend env names.',
  },
]);

function fail(message) {
  throw new Error(message);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isRetiredPathMatch(file, retiredPath) {
  return file === retiredPath || file.startsWith(`${retiredPath}/`);
}

function createAuditIo(repoRoot, files, options) {
  const fileSet = options.files ? new Set(files) : null;
  return {
    fileExists: typeof options.fileExists === 'function'
      ? options.fileExists
      : (file) => (
        fileSet
          ? fileSet.has(file) || existsSync(path.join(repoRoot, file))
          : existsSync(path.join(repoRoot, file))
      ),
    readFile: typeof options.readFile === 'function'
      ? options.readFile
      : (file) => readRequiredFile(repoRoot, file, fail),
  };
}

function readJsonFile(io, file) {
  try {
    return JSON.parse(io.readFile(file));
  } catch (error) {
    fail(`${file} parse failed: ${error.message}`);
  }
}

function findRetiredPathViolations(files, io) {
  const fileSet = new Set(files);
  const violations = [];

  for (const retiredPath of RETIRED_PATHS) {
    if (io.fileExists(retiredPath) || fileSet.has(retiredPath)) {
      violations.push({
        path: retiredPath,
        reason: 'retired path exists',
      });
      continue;
    }

    const childFile = files.find((file) => isRetiredPathMatch(file, retiredPath));
    if (childFile) {
      violations.push({
        path: childFile,
        reason: `inside retired path ${retiredPath}`,
      });
    }
  }

  return violations;
}

function findPatternViolations(files, io) {
  const violations = [];
  const textFiles = files.filter((file) => TEXT_FILE_PATTERN.test(file));

  for (const file of textFiles) {
    const text = io.readFile(file);
    const lineStarts = createLineStartOffsets(text);

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (!match) {
        continue;
      }

      const lineNumber = lineNumberForOffset(lineStarts, match.index);
      const lineEnd = text.indexOf('\n', match.index);
      violations.push({
        file,
        lineNumber,
        reason,
        match: match[0],
        line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
      });
    }
  }

  return violations;
}

function findPackageJsonViolations(io) {
  if (!io.fileExists('package.json')) {
    return [];
  }

  const packageJson = readJsonFile(io, 'package.json');
  const violations = [];
  const dependencySections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  for (const sectionName of dependencySections) {
    const section = asObject(packageJson[sectionName]);
    for (const packageName of Object.keys(section)) {
      if (packageName === 'next' || packageName.startsWith('@next/')) {
        violations.push({
          file: 'package.json',
          reason: `retired Next dependency in ${sectionName}`,
          value: packageName,
        });
      }
    }
  }

  const scripts = asObject(packageJson.scripts);
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') {
      continue;
    }
    if (/\bnext\s+(?:dev|build|start|lint|telemetry)\b/.test(command)) {
      violations.push({
        file: 'package.json',
        reason: `retired Next command in script ${scriptName}`,
        value: command,
      });
    }
  }

  return violations;
}

function flattenJsonStrings(value, currentPath = '$', output = []) {
  if (typeof value === 'string') {
    output.push({ path: currentPath, value });
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJsonStrings(item, `${currentPath}[${index}]`, output));
    return output;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flattenJsonStrings(item, `${currentPath}.${key}`, output);
    }
  }

  return output;
}

function readJsoncFile(file, io) {
  try {
    return JSON.parse(stripJsonComments(io.readFile(file), { whitespace: false }));
  } catch (error) {
    fail(`${file} parse failed: ${error.message}`);
  }
}

function findTsconfigViolations(repoRoot, files = null, io) {
  const tsconfigFiles = files
    ? files.filter((file) => /(^|\/)tsconfig[^/]*\.json$/.test(file) && !file.includes('/node_modules/') && !file.includes('/dist/'))
    : listGitFiles([':(glob)**/tsconfig*.json'], {
      cwd: repoRoot,
      filter: (file) => !file.includes('/node_modules/') && !file.includes('/dist/'),
    });
  const violations = [];

  for (const file of tsconfigFiles) {
    const config = readJsoncFile(file, io);
    for (const entry of flattenJsonStrings(config)) {
      if (
        /\bnext-env\.d\.ts\b|(?:^|\/)\.next(?:\/|$)|(?:^|\/)next(?:\/|$)|@next\//.test(entry.value)
      ) {
        violations.push({
          file,
          reason: 'retired Next TypeScript configuration reference',
          value: `${entry.path}: ${entry.value}`,
        });
      }
    }
  }

  return violations;
}

export function auditRetiredFrontendLeftovers(repoRoot = getRepoRoot(), options = {}) {
  const files = options.files
    ? options.files.filter((file) => !file.includes('/dist/') && !file.includes('/node_modules/')).sort()
    : listGitFiles(SCAN_PATHS, {
      cwd: repoRoot,
      filter: (file) => !file.includes('/dist/') && !file.includes('/node_modules/'),
    });
  const io = createAuditIo(repoRoot, files, options);

  return {
    files,
    configViolations: [
      ...findPackageJsonViolations(io),
      ...findTsconfigViolations(repoRoot, options.files ? files : null, io),
    ],
    pathViolations: findRetiredPathViolations(files, io),
    patternViolations: findPatternViolations(files, io),
  };
}

export function formatRetiredFrontendLeftoversAudit(audit) {
  const { files, configViolations, pathViolations, patternViolations } = audit;

  if (configViolations.length > 0 || pathViolations.length > 0 || patternViolations.length > 0) {
    const lines = [
      `[${GUARD_NAME}] Retired frontend leftovers found.`,
      `[${GUARD_NAME}] Keep the Vite runtime, DESIGN.md design system, and current route modules as the only active frontend path.`,
      '',
    ];

    if (configViolations.length > 0) {
      lines.push('Retired configuration:');
      for (const violation of configViolations) {
        lines.push(`- ${violation.file}: ${violation.reason}`);
        lines.push(`  ${violation.value}`);
      }
      lines.push('');
    }

    if (pathViolations.length > 0) {
      lines.push('Retired paths:');
      for (const violation of pathViolations) {
        lines.push(`- ${violation.path}: ${violation.reason}`);
      }
      lines.push('');
    }

    if (patternViolations.length > 0) {
      lines.push('Retired references:');
      for (const violation of patternViolations) {
        lines.push(`- ${violation.file}:${violation.lineNumber} ${violation.reason}`);
        lines.push(`  matched: ${violation.match}`);
        lines.push(`  ${violation.line}`);
      }
      lines.push('');
    }

    return {
      status: 1,
      stdout: '',
      stderr: `${lines.join('\n')}\n`,
    };
  }

  return {
    status: 0,
    stdout: `[${GUARD_NAME}] OK: scanned ${files.length} frontend/documentation files; no retired leftovers found.\n`,
    stderr: '',
  };
}

export function runRetiredFrontendLeftoversCheck(repoRoot = getRepoRoot(), options = {}) {
  return formatRetiredFrontendLeftoversAudit(auditRetiredFrontendLeftovers(repoRoot, options));
}
