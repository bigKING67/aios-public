import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const FINISH_WORK_SCOPE_GUARD_NAME = 'trellis-finish-work-scope';

export const FINISH_WORK_CONTRACT_FILES = Object.freeze([
  '.trellis/config.yaml',
  '.trellis/workflow.md',
  '.agents/skills/trellis-finish-work/SKILL.md',
  '.pi/prompts/trellis-finish-work.md',
]);

export const STALE_FINISH_WORK_PATTERNS = Object.freeze([
  {
    label: 'Each archive produces',
    pattern: /Each archive produces/u,
  },
  {
    label: 'This produces a chore: record journal commit',
    pattern: /This produces a chore: record journal commit/u,
  },
  {
    label: 'archive commit -> journal commit',
    pattern: /archive commit\s*(?:\u2192|->)\s*journal commit/u,
  },
  {
    label: 'auto-commits and will appear dirty',
    pattern: /auto-commits and will appear dirty/u,
  },
]);

const ARCHIVE_TASK_PATTERN = /^\.trellis\/tasks\/archive\/\d{4}-\d{2}\/(?<slug>[^/]+)\/.+/u;
const ARCHIVE_TASK_ROOT_PATTERN = /^(?<root>\.trellis\/tasks\/archive\/\d{4}-\d{2}\/(?<slug>[^/]+))(?:\/.+)?$/u;
const LIVE_TASK_PATTERN = /^\.trellis\/tasks\/(?<slug>[^/]+)\/.+/u;
const WORKSPACE_BOOKKEEPING_PATTERN = /^\.trellis\/(?:workspace|\.local-workspace)\//u;
const LITE_TRELLIS_SOURCE_PATTERNS = Object.freeze([
  /^\.trellis\/scripts\/.+/u,
  /^\.trellis\/spec\/.+/u,
]);
const SESSION_AUTO_COMMIT_FALSE_PATTERN = /(?:^|\n)session_auto_commit:\s*false\b/u;

function normalizeGitPath(file) {
  return String(file ?? '').replace(/\\/gu, '/').replace(/^\.\//u, '');
}

function statusKind(status) {
  return String(status ?? '').charAt(0);
}

function taskArchiveSlug(file) {
  const match = normalizeGitPath(file).match(ARCHIVE_TASK_PATTERN);
  return match?.groups?.slug ?? null;
}

function archiveTaskRoot(file) {
  const match = normalizeGitPath(file).match(ARCHIVE_TASK_ROOT_PATTERN);
  if (!match?.groups?.slug || !match.groups.root) {
    return null;
  }
  return {
    root: match.groups.root,
    slug: match.groups.slug,
  };
}

function liveTaskSlug(file) {
  const normalized = normalizeGitPath(file);
  if (normalized.startsWith('.trellis/tasks/archive/')) {
    return null;
  }
  const match = normalized.match(LIVE_TASK_PATTERN);
  return match?.groups?.slug ?? null;
}

function isWorkspaceBookkeeping(file) {
  return WORKSPACE_BOOKKEEPING_PATTERN.test(normalizeGitPath(file));
}

function isLiteWorkPath(file) {
  const normalized = normalizeGitPath(file);
  return !normalized.startsWith('.trellis/')
    || LITE_TRELLIS_SOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function finding({
  file,
  status = null,
  reason,
  suggestion = null,
}) {
  return {
    file: normalizeGitPath(file),
    status,
    reason,
    suggestion,
  };
}

function addPathFinding(findings, entry, file, reason) {
  findings.push(finding({
    file,
    status: entry.status,
    reason,
  }));
}

export function parseGitNameStatusZ(rawOutput) {
  const text = Buffer.isBuffer(rawOutput)
    ? rawOutput.toString('utf8')
    : String(rawOutput ?? '');
  if (text.length === 0) {
    return [];
  }

  const tokens = text.split('\0').filter((token) => token.length > 0);
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) {
      continue;
    }

    if (/^[RC]\d*/u.test(status)) {
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      if (!oldPath || !newPath) {
        throw new Error(`malformed git name-status entry for ${status}`);
      }
      entries.push({
        status,
        oldPath: normalizeGitPath(oldPath),
        newPath: normalizeGitPath(newPath),
      });
      continue;
    }

    const file = tokens[index++];
    if (!file) {
      throw new Error(`malformed git name-status entry for ${status}`);
    }
    entries.push({
      status,
      file: normalizeGitPath(file),
    });
  }

  return entries;
}

function auditRenameEntry(
  entry,
  findings,
  sourceTaskSlugs,
  archiveTaskSlugs,
  archiveTaskJsonSlugs,
  productPaths,
  allowLiteWork,
) {
  if (allowLiteWork && isLiteWorkPath(entry.oldPath) && isLiteWorkPath(entry.newPath)) {
    productPaths.add(`${entry.oldPath} -> ${entry.newPath}`);
    return;
  }

  if (statusKind(entry.status) !== 'R') {
    addPathFinding(findings, entry, entry.oldPath, 'finish-work bookkeeping must not stage copied paths');
    return;
  }

  const sourceSlug = liveTaskSlug(entry.oldPath);
  const archiveSlug = taskArchiveSlug(entry.newPath);
  if (!sourceSlug || !archiveSlug) {
    addPathFinding(
      findings,
      entry,
      `${entry.oldPath} -> ${entry.newPath}`,
      'finish-work task renames must move .trellis/tasks/<task>/ into .trellis/tasks/archive/YYYY-MM/<task>/',
    );
    return;
  }

  sourceTaskSlugs.add(sourceSlug);
  archiveTaskSlugs.add(archiveSlug);
  if (normalizeGitPath(entry.newPath).endsWith('/task.json')) {
    archiveTaskJsonSlugs.add(archiveSlug);
  }
  if (sourceSlug !== archiveSlug) {
    addPathFinding(
      findings,
      entry,
      `${entry.oldPath} -> ${entry.newPath}`,
      `archive target slug ${archiveSlug} does not match source task slug ${sourceSlug}`,
    );
  }
}

function auditSinglePathEntry(
  entry,
  findings,
  sourceTaskSlugs,
  archiveTaskSlugs,
  archiveTaskJsonSlugs,
  productPaths,
  allowLiteWork,
) {
  const file = entry.file;
  const kind = statusKind(entry.status);
  const sourceSlug = liveTaskSlug(file);
  const archiveSlug = taskArchiveSlug(file);

  if (isWorkspaceBookkeeping(file)) {
    addPathFinding(
      findings,
      entry,
      file,
      'workspace journals are host-local and tracked workspace history is immutable',
    );
    return;
  }

  if (archiveSlug) {
    archiveTaskSlugs.add(archiveSlug);
    if (normalizeGitPath(file).endsWith('/task.json')) {
      archiveTaskJsonSlugs.add(archiveSlug);
    }
    if (kind === 'A') {
      return;
    }
    addPathFinding(findings, entry, file, 'archive task paths may only be added directly or reached by a rename');
    return;
  }

  if (sourceSlug) {
    sourceTaskSlugs.add(sourceSlug);
    if (kind === 'D') {
      return;
    }
    addPathFinding(findings, entry, file, 'live task paths may only be deleted as part of a finish-work archive move');
    return;
  }

  if (allowLiteWork && isLiteWorkPath(file)) {
    productPaths.add(file);
    return;
  }

  addPathFinding(
    findings,
    entry,
    file,
    'finish-work bookkeeping commits may only stage Trellis task archive moves',
  );
}

export function auditFinishWorkStagedEntries(entries, options = {}) {
  const {
    allowLiteWork = false,
    requireStaged = false,
    taskMetadataBySlug = new Map(),
  } = options;
  const findings = [];
  const sourceTaskSlugs = new Set();
  const archiveTaskSlugs = new Set();
  const archiveTaskJsonSlugs = new Set();
  const productPaths = new Set();

  if (requireStaged && entries.length === 0) {
    findings.push(finding({
      file: '(staged index)',
      reason: 'no staged changes found; stage the finish-work task archive first',
    }));
  }

  for (const entry of entries) {
    if (entry.oldPath || entry.newPath) {
      auditRenameEntry(
        entry,
        findings,
        sourceTaskSlugs,
        archiveTaskSlugs,
        archiveTaskJsonSlugs,
        productPaths,
        allowLiteWork,
      );
    } else {
      auditSinglePathEntry(
        entry,
        findings,
        sourceTaskSlugs,
        archiveTaskSlugs,
        archiveTaskJsonSlugs,
        productPaths,
        allowLiteWork,
      );
    }
  }

  for (const sourceSlug of sourceTaskSlugs) {
    if (!archiveTaskSlugs.has(sourceSlug)) {
      findings.push(finding({
        file: `.trellis/tasks/${sourceSlug}/`,
        reason: `live task ${sourceSlug} is staged without a matching archive target`,
      }));
    }
  }

  if (allowLiteWork) {
    if (archiveTaskSlugs.size !== 1 || sourceTaskSlugs.size > 1) {
      findings.push(finding({
        file: '.trellis/tasks/',
        reason: 'Lite work commits require exactly one archive task and at most one matching live task source',
      }));
    }
    if (productPaths.size === 0) {
      findings.push(finding({
        file: '(staged index)',
        reason: 'Lite work mode requires at least one staged task-owned work path',
      }));
    }
    for (const slug of archiveTaskSlugs) {
      if (!archiveTaskJsonSlugs.has(slug)) {
        findings.push(finding({
          file: `.trellis/tasks/archive/*/${slug}/task.json`,
          reason: 'Lite work mode requires the archived task.json in the staged task set',
        }));
      }
      const metadata = taskMetadataBySlug instanceof Map
        ? taskMetadataBySlug.get(slug)
        : taskMetadataBySlug?.[slug];
      const rawProfile = typeof metadata === 'string'
        ? metadata
        : metadata?.workflowProfile ?? metadata?.workflow_profile;
      const profile = String(rawProfile ?? 'full').trim().toLowerCase();
      if (profile !== 'lite') {
        findings.push(finding({
          file: `.trellis/tasks/archive/*/${slug}/task.json`,
          reason: `Lite work mode requires workflow_profile=lite; found ${profile || 'full'}`,
        }));
      }
      const status = typeof metadata === 'object' && metadata !== null
        ? String(metadata.status ?? '').trim().toLowerCase()
        : '';
      const completedAt = typeof metadata === 'object' && metadata !== null
        ? String(metadata.completedAt ?? '').trim()
        : '';
      if (status !== 'completed' || !completedAt) {
        findings.push(finding({
          file: `.trellis/tasks/archive/*/${slug}/task.json`,
          reason: 'Lite work mode requires archived task status=completed with completedAt',
        }));
      }
    }
  }

  return {
    findings,
    archiveTaskSlugs: [...archiveTaskSlugs].sort(),
    mode: allowLiteWork ? 'lite-work' : 'bookkeeping',
    productPathCount: productPaths.size,
    sourceTaskSlugs: [...sourceTaskSlugs].sort(),
    stagedPathCount: entries.length,
  };
}

export function readStagedArchiveTaskMetadata(repoRoot, entries) {
  const rootsBySlug = new Map();
  for (const entry of entries) {
    for (const file of [entry.newPath, entry.file]) {
      if (!file) {
        continue;
      }
      const info = archiveTaskRoot(file);
      if (info) {
        rootsBySlug.set(info.slug, info.root);
      }
    }
  }

  const metadataBySlug = new Map();
  for (const [slug, root] of rootsBySlug) {
    const taskJsonPath = `${root}/task.json`;
    let metadata = {
      completedAt: '',
      status: '',
      workflowProfile: 'full',
    };
    try {
      const stagedText = execFileSync('git', ['show', `:${taskJsonPath}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const task = JSON.parse(stagedText);
      metadata = {
        completedAt: String(task.completedAt ?? '').trim(),
        status: String(task.status ?? '').trim().toLowerCase(),
        workflowProfile: String(task.workflow_profile ?? 'full').trim().toLowerCase() || 'full',
      };
    } catch {
      // Invalid or missing staged metadata remains a Full, incomplete task and fails Lite mode.
    }
    metadataBySlug.set(slug, metadata);
  }
  return metadataBySlug;
}

function lineNumberForPattern(text, pattern) {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) {
    return null;
  }
  return text.slice(0, match.index).split(/\r?\n/u).length;
}

export function auditFinishWorkContractTexts(filesByPath) {
  const findings = [];

  for (const file of FINISH_WORK_CONTRACT_FILES) {
    const text = filesByPath.get(file);
    if (text === undefined) {
      findings.push(finding({
        file,
        reason: 'finish-work contract file is missing from the tracked scan set',
      }));
      continue;
    }

    for (const stalePattern of STALE_FINISH_WORK_PATTERNS) {
      const line = lineNumberForPattern(text, stalePattern.pattern);
      if (line !== null) {
        findings.push(finding({
          file: `${file}:${line}`,
          reason: `stale finish-work auto-commit wording found: ${stalePattern.label}`,
          suggestion: 'describe AIOS session_auto_commit:false and scoped manual Trellis bookkeeping commits',
        }));
      }
    }
  }

  const configText = filesByPath.get('.trellis/config.yaml') ?? '';
  if (!SESSION_AUTO_COMMIT_FALSE_PATTERN.test(configText)) {
    findings.push(finding({
      file: '.trellis/config.yaml',
      reason: 'AIOS finish-work scope guard expects session_auto_commit: false',
    }));
  }

  return findings;
}

export function readFinishWorkContractTexts(repoRoot) {
  const filesByPath = new Map();
  for (const file of FINISH_WORK_CONTRACT_FILES) {
    const absolutePath = path.join(repoRoot, file);
    if (fs.existsSync(absolutePath)) {
      filesByPath.set(file, fs.readFileSync(absolutePath, 'utf8'));
    }
  }
  return filesByPath;
}

export function readStagedNameStatusEntries(repoRoot) {
  const output = execFileSync('git', ['diff', '--cached', '--name-status', '-z'], {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseGitNameStatusZ(output);
}

export function formatFinishWorkScopeFailure(findings) {
  return [
    `[${FINISH_WORK_SCOPE_GUARD_NAME}] finish-work governance violations:`,
    ...findings.map((item) => {
      const status = item.status ? `${item.status} ` : '';
      const suggestion = item.suggestion ? `; ${item.suggestion}` : '';
      return `- ${status}${item.file}: ${item.reason}${suggestion}`;
    }),
    '',
    'Expected finish-work bookkeeping staging:',
    '  git add -- .trellis/tasks/<task> .trellis/tasks/archive/YYYY-MM/<task>',
    '  Workspace journals stay host-local and must never be staged.',
    'Then rerun:',
    '  npm run verify:repo:trellis-finish-work-scope -- --require-staged',
    '',
    'For a single Lite task work commit:',
    '  stage the work paths plus exactly one Lite task archive move, then run:',
    '  npm run verify:repo:trellis-finish-work-scope -- --require-staged --allow-lite-work',
  ].join('\n');
}
