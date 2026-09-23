#!/usr/bin/env node

/**
 * Read-only AIOS agent workflow doctor.
 *
 * This gate checks executable workflow contracts without archiving tasks,
 * deleting runtime residue, or inspecting user/browser/private state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditTrellisRuntime } from '../../lib/repo/trellis-runtime-hygiene-core.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '../../..');

const REQUIRED_FILES = Object.freeze([
  'AGENTS.md',
  '.trellis/config.yaml',
  '.trellis/workflow.md',
  '.agents/skills/trellis-start/SKILL.md',
  'PLANS.md',
  'code_review.md',
  'scripts/lib/repo/trellis-runtime-hygiene-core.mjs',
  'scripts/ops/trellis-runtime-hygiene.mjs',
  'scripts/checks/repo/trellis-runtime-hygiene.behavior.mjs',
  '.pi/AGENTS.md',
  '.pi/rules/pi-aios.md',
]);

const AGENTS_TRUTH_TABLE_ANCHORS = Object.freeze([
  '## Agent Routing Truth Table',
  'Codex direct inline',
  'Codex Trellis inline',
  'Frontend route-planner workers',
  'Trellis channel',
  'Pi scaffold',
]);

const CODEX_NO_TASK_ROUTE_ANCHORS = Object.freeze([
  '**A Codex direct inline**',
  '**B Trellis Lite / PRD-only task**',
  '**C Full Trellis**',
  '--profile lite',
  '--profile full',
  '--allow-lite-work',
  'Routine deploy eligibility (all required)',
  'Any false or unknown condition routes to Full',
  'Frontend L1+ work still follows the route planner',
  'current explicit deploy authorization',
  'Route selection never authorizes deploy',
  'use `task.py finish` between sessions',
  'An authorization pause does not complete that owner',
  'never suppresses dangerous-operation confirmation',
]);

const CODEX_INLINE_CONTRACTS = Object.freeze([
  { status: 'no_task-inline', title: 'Codex inline no task', anchor: 'codex-inline-no-task',
    budget: 1784, required: CODEX_NO_TASK_ROUTE_ANCHORS },
  { status: 'planning-inline', title: 'Codex inline planning', anchor: 'codex-inline-planning',
    budget: 585, required: ['load `trellis-brainstorm` only when', '--profile lite',
      '--profile full', '`prd.md`, `design.md`, and `implement.md`', 'when the task is complex',
      'jsonl curation is **skipped**', 'task.py start <task-dir>'] },
  { status: 'in_progress-inline', title: 'Codex inline in progress', anchor: 'codex-inline-in-progress',
    budget: 1053, required: ['missing or invalid values mean `full`', '--allow-lite-work',
      'Journal recording is optional', 'do not amend', 'archive-only bookkeeping commit',
      'owner accepts a documented evidence boundary', 'use `task.py finish`',
      'trellis-before-dev', 'trellis-check', 'Do NOT dispatch',
      '**Frontend route-planner exception**', 'Never amend or silently mix unrelated dirty paths'] },
]);

const ROUTINE_DEPLOY_POLICY_ANCHORS = Object.freeze([
  'current message explicitly authorizes this deploy',
  'unchanged stable runbook',
  'exact deployable SHA or artifact has already passed',
  'pushed to `origin/main`',
  'MacBook worktree is clean',
  'no schema migration',
  'no auth, permission, credential, secret, service-account, or trust-boundary change',
  'no environment-key, service/systemd, runtime/topology, network, external-integration, public-compatibility, or release-safety governance change',
  'Rollback is known and simple',
  'If any condition is false or unknown',
  'Route selection never grants deploy authorization',
]);

const PLANNING_ROUTE_ANCHORS = Object.freeze(new Map([
  ['PLANS.md', [
    'Codex direct inline',
    '--profile lite',
    '--profile full',
    'Do not create or maintain a separate execution plan',
  ]],
  ['code_review.md', [
    'Lite reviews against `prd.md`',
    'Full reviews against',
    '`design.md` / `implement.md`',
  ]],
]));

const PLANS_ROUTE_ROW_CONTRACTS = Object.freeze(new Map([
  ['Codex direct inline', Object.freeze({
    required: Object.freeze([
      'single-session work in one subsystem',
      'documentation-only clarification',
      'no machine behavior change',
      'No persisted Trellis artifact',
    ]),
    forbidden: Object.freeze(['routine deploy satisfying', 'production data write', 'auth/security']),
  })],
  ['Trellis Lite', Object.freeze({
    required: Object.freeze([
      'ordinary workflow/CI/route governance',
      'machine behavior',
      'within Lite finish-work path limits',
      'Codex-only routine deploy',
      '`prd.md` only',
      '--profile lite',
    ]),
    forbidden: Object.freeze(['production data write', 'non-routine deploy', 'explicit rollback/audit']),
  })],
  ['Full Trellis', Object.freeze({
    required: Object.freeze([
      'production data write',
      'non-routine deploy',
      'auth/security',
      'release-safety governance',
      'explicit rollback/audit',
      'protected `.trellis/config.yaml` or `.trellis/workflow.md` edits',
      "changes to another live task's artifacts",
      '--profile full',
    ]),
    forbidden: Object.freeze(['ordinary workflow/CI/route governance', 'repo-governance work']),
  })],
]));

const RUNTIME_MAINTENANCE_SCRIPTS = Object.freeze(new Map([
  ['maintenance:trellis-runtime', 'node scripts/ops/trellis-runtime-hygiene.mjs'],
  ['verify:repo:trellis-runtime-hygiene-behavior', 'node scripts/checks/repo/trellis-runtime-hygiene.behavior.mjs'],
]));

const TASK_PROFILE_FILE_ANCHORS = Object.freeze(new Map([
  ['.trellis/scripts/task.py', ['--profile', 'WORKFLOW_PROFILES']],
  ['.trellis/scripts/common/task_store.py', ['workflow_profile', 'Context manifests are lazy']],
  ['.trellis/scripts/common/types.py', ['normalize_workflow_profile', 'WORKFLOW_PROFILE_FULL']],
  ['.agents/skills/trellis-finish-work/SKILL.md', [
    '--allow-lite-work',
    'Lite + uncommitted task work',
    '--content-file',
    '--testing',
  ]],
  ['.agents/skills/trellis-continue/SKILL.md', ['workflow_profile=lite', 'task-level acceptance is complete']],
  ['AGENTS.md', ['within Lite finish-work path limits', "changes to another live task's artifacts"]],
  ['.trellis/workflow.md', ['within Lite finish-work path limits', "changes to another live task's artifacts"]],
  ['.agents/skills/trellis-start/SKILL.md', ['within Lite finish-work path limits', "changes to another live task's artifacts"]],
  ['PLANS.md', ['within Lite finish-work path limits', "changes to another live task's artifacts"]],
]));

const TASK_COMPLETION_BOUNDARY_ANCHORS = Object.freeze(new Map([
  ['AGENTS.md', [
    '`task.py finish` ends only the current session pointer',
    'owner explicitly accepts a documented evidence boundary',
    'must not trigger archive',
  ]],
  ['.trellis/workflow.md', [
    '**Session versus completion**',
    'session end alone never justifies archive',
    'use `task.py finish`',
  ]],
  ['.agents/skills/trellis-start/SKILL.md', [
    'Session and task completion are separate',
    '`task.py finish` clears only the',
    'documented evidence boundary',
  ]],
  ['.agents/skills/trellis-finish-work/SKILL.md', [
    'Session-pause route for unfinished tasks',
    'Do not run `task.py archive`',
    'Never check acceptance merely to make a task',
  ]],
  ['.agents/skills/trellis-continue/SKILL.md', [
    'task-level acceptance is complete',
    'use `task.py finish`',
    'same owner `in_progress`',
  ]],
  ['PLANS.md', [
    'Known same-deliverable authorization',
    '`task.py finish` clears a session',
    'documented evidence boundary',
  ]],
  ['.pi/prompts/trellis-finish-work.md', [
    'Session-pause route',
    'completion-eligible',
    'task.py finish',
  ]],
  ['.pi/prompts/trellis-continue.md', [
    'task-level acceptance is complete',
    'task.py finish',
  ]],
]));

const findings = [];

function rel(...segments) {
  return path.join(...segments);
}

function repoPath(...segments) {
  return path.join(ROOT_DIR, ...segments);
}

function readText(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

function extractWorkflowState(text, status) {
  const lines = text.split(/\r?\n/u);
  const startMarker = `[workflow-state:${status}]`;
  const endMarker = `[/workflow-state:${status}]`;
  const startIndex = lines.findIndex((line) => line.trim() === startMarker);
  if (startIndex < 0) {
    return null;
  }
  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.trim() === endMarker,
  );
  if (endIndex < 0) {
    return null;
  }
  return lines.slice(startIndex + 1, endIndex).join('\n');
}

// Pure contract audit shared by the workspace doctor and negative fixtures.
export function auditCodexInlineContracts(workflow) {
  const errors = [];
  const contracts = {};
  const lines = workflow.split(/\r?\n/u);
  const section = '## Codex Inline Contracts';
  const sectionIndex = lines.indexOf(section);
  if (lines.filter((line) => line === section).length !== 1
    || sectionIndex <= lines.indexOf('## Phase 1: Plan')) {
    errors.push('Codex Inline Contracts must be unique and outside Phase Index');
  }
  for (const { status, title, anchor, budget, required } of CODEX_INLINE_CONTRACTS) {
    const heading = `### ${title}`;
    const start = lines.indexOf(heading);
    if (lines.filter((line) => line === heading).length !== 1 || start <= sectionIndex) {
      errors.push(`${status}: contract target must exist exactly once in Codex Inline Contracts`);
      continue;
    }
    const next = lines.findIndex((line, index) => index > start && /^#{1,3} /u.test(line));
    const contract = lines.slice(start + 1, next < 0 ? undefined : next).join('\n').trim();
    contracts[status] = contract;
    for (const clause of required) {
      if (!contract.includes(clause)) errors.push(`${status}: contract missing ${clause}`);
    }
    const reminder = extractWorkflowState(workflow, status);
    if (lines.filter((line) => line.trim() === `[workflow-state:${status}]`).length !== 1
      || lines.filter((line) => line.trim() === `[/workflow-state:${status}]`).length !== 1) {
      errors.push(`${status}: reminder must exist exactly once`);
    }
    const reminderClauses = [
      `MUST read [${title}](#${anchor}) in \`.trellis/workflow.md\``,
      'Reuse only if available in current context',
      'reload missing context after compaction or a new session',
      'scoped Git', 'commit/push/deploy authorization', 'session end never means task completion',
    ];
    for (const clause of reminderClauses) {
      if (!reminder?.toLowerCase().includes(clause.toLowerCase())) {
        errors.push(`${status}: reminder missing ${clause}`);
      }
    }
    if (reminder !== null && Buffer.byteLength(reminder.trim(), 'utf8') > budget) {
      errors.push(`${status}: reminder exceeds ${budget} UTF-8 bytes`);
    }
  }
  return { contracts, errors };
}

function extractMarkdownTableRow(text, label) {
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      continue;
    }
    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells[0] === label) {
      return cells.join(' ');
    }
  }
  return null;
}

function add(level, message) {
  findings.push({ level, message });
}

function ok(message) {
  add('OK', message);
}

function warn(message) {
  add('WARN', message);
}

function fail(message) {
  add('FAIL', message);
}

function checkRequiredFiles() {
  for (const relativePath of REQUIRED_FILES) {
    if (fs.existsSync(repoPath(relativePath))) {
      ok(`required file present: ${relativePath}`);
    } else {
      fail(`required file missing: ${relativePath}`);
    }
  }
}

function checkAgentsTruthTable() {
  if (!fs.existsSync(repoPath('AGENTS.md'))) {
    return;
  }

  const agents = readText('AGENTS.md');
  const missing = AGENTS_TRUTH_TABLE_ANCHORS.filter((anchor) => !agents.includes(anchor));
  if (missing.length > 0) {
    fail(`AGENTS.md missing routing truth-table anchor(s): ${missing.join(', ')}`);
  } else {
    ok('AGENTS.md includes Agent Routing Truth Table anchors');
  }
}

function checkCodexNoTaskRouting() {
  if (!fs.existsSync(repoPath('.trellis/workflow.md'))
    || !fs.existsSync(repoPath('.agents/skills/trellis-start/SKILL.md'))
    || !fs.existsSync(repoPath('AGENTS.md'))) {
    return;
  }

  const workflow = readText('.trellis/workflow.md');
  const sharedNoTask = extractWorkflowState(workflow, 'no_task');
  const inlineAudit = auditCodexInlineContracts(workflow);
  for (const error of inlineAudit.errors) fail(error);
  if (inlineAudit.errors.length === 0) ok('Codex inline reminders resolve intact on-demand contracts');
  const codexNoTask = inlineAudit.contracts['no_task-inline'] ?? null;

  if (sharedNoTask === null) {
    fail('.trellis/workflow.md is missing the shared no_task workflow-state block');
  } else if (!sharedNoTask.includes('**B Create a task / L1+**')) {
    fail('shared non-Codex no_task route changed; this Codex-only migration must preserve it');
  } else {
    ok('shared non-Codex no_task route remains unchanged');
  }

  if (codexNoTask === null) {
    fail('.trellis/workflow.md is missing the Codex no-task full contract');
  } else {
    const missing = CODEX_NO_TASK_ROUTE_ANCHORS.filter(
      (anchor) => !codexNoTask.includes(anchor),
    );
    if (missing.length > 0) {
      fail(`Codex no_task-inline route missing anchor(s): ${missing.join(', ')}`);
    } else {
      ok('Codex no_task-inline route includes direct, Lite, Full, and frontend contracts');
    }
    if (codexNoTask.includes('**B Create a task / L1+**')) {
      fail('Codex no_task-inline route must not force every L1+ change into a task');
    }
  }

  const agents = readText('AGENTS.md');
  const startSkill = readText('.agents/skills/trellis-start/SKILL.md');
  const policyAnchors = ['Codex direct inline', 'Trellis Lite', 'Full Trellis'];
  const agentsMissing = policyAnchors.filter((anchor) => !agents.includes(anchor));
  const skillMissing = policyAnchors.filter((anchor) => !startSkill.includes(anchor));
  if (agentsMissing.length > 0) {
    fail(`AGENTS.md missing Codex task-routing tier(s): ${agentsMissing.join(', ')}`);
  }
  if (skillMissing.length > 0) {
    fail(`trellis-start skill missing Codex task-routing tier(s): ${skillMissing.join(', ')}`);
  }
  if (agents.includes('For `L1+` implementation work')) {
    fail('AGENTS.md still contains the stale mandatory L1+ Trellis task rule');
  }
  if (agentsMissing.length === 0 && skillMissing.length === 0
    && !agents.includes('For `L1+` implementation work')) {
    ok('AGENTS.md and trellis-start agree on risk-tiered Codex task routing');
  }

  const routinePolicyMissing = ROUTINE_DEPLOY_POLICY_ANCHORS.filter(
    (anchor) => !agents.includes(anchor),
  );
  if (routinePolicyMissing.length > 0) {
    fail(`AGENTS.md routine-deploy policy missing anchor(s): ${routinePolicyMissing.join(', ')}`);
  } else if (codexNoTask !== null
    && codexNoTask.includes('current explicit deploy authorization')
    && codexNoTask.includes('Any false or unknown condition routes to Full')
    && codexNoTask.includes('Route selection never authorizes deploy')
    && startSkill.includes('any false/unknown routine-deploy condition')
    && startSkill.includes('Route selection never grants deploy authorization')) {
    ok('Codex routine-deploy eligibility, fail-closed routing, and authorization separation align');
  } else {
    fail('Codex workflow/trellis-start routine-deploy safeguards are incomplete');
  }

  let taskProfileContractsOk = true;
  for (const [file, anchors] of TASK_PROFILE_FILE_ANCHORS) {
    if (!fs.existsSync(repoPath(file))) {
      fail(`task-profile contract file missing: ${file}`);
      taskProfileContractsOk = false;
      continue;
    }
    const text = readText(file);
    const missing = anchors.filter((anchor) => !text.includes(anchor));
    if (missing.length > 0) {
      fail(`${file} missing task-profile anchor(s): ${missing.join(', ')}`);
      taskProfileContractsOk = false;
    }
  }
  if (taskProfileContractsOk) {
    ok('task profile creation and Lite closeout contract files are present');
  }

  let completionBoundaryOk = true;
  for (const [file, anchors] of TASK_COMPLETION_BOUNDARY_ANCHORS) {
    const text = readText(file);
    const missing = anchors.filter((anchor) => !text.includes(anchor));
    if (missing.length > 0) {
      fail(`${file} missing task-completion boundary anchor(s): ${missing.join(', ')}`);
      completionBoundaryOk = false;
    }
  }
  if (completionBoundaryOk) {
    ok('task completion and session-pause boundaries align across project guidance');
  }
}

function checkPlanningRouteMap() {
  for (const [file, anchors] of PLANNING_ROUTE_ANCHORS) {
    const content = readText(file);
    const missing = anchors.filter((anchor) => !content.includes(anchor));
    if (missing.length > 0) {
      fail(`${file} is missing planning-route anchors: ${missing.join(', ')}`);
      continue;
    }
    ok(`${file} keeps Direct/Lite/Full artifact ownership aligned`);
  }
}

function checkPlansRouteSemantics() {
  const plans = readText('PLANS.md');
  let valid = true;

  for (const [route, contract] of PLANS_ROUTE_ROW_CONTRACTS) {
    const row = extractMarkdownTableRow(plans, route);
    if (row === null) {
      fail(`PLANS.md is missing the ${route} route row`);
      valid = false;
      continue;
    }

    const missing = contract.required.filter((anchor) => !row.includes(anchor));
    if (missing.length > 0) {
      fail(`PLANS.md ${route} row is missing semantic anchor(s): ${missing.join(', ')}`);
      valid = false;
    }

    const forbidden = contract.forbidden.filter((anchor) => row.includes(anchor));
    if (forbidden.length > 0) {
      fail(`PLANS.md ${route} row contains conflicting anchor(s): ${forbidden.join(', ')}`);
      valid = false;
    }
  }

  if (valid) {
    ok('PLANS.md route rows keep Direct/Lite/Full risk thresholds aligned');
  }
}

function checkRuntimeMaintenanceWiring() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts ?? {};
  const missing = [];
  for (const [name, command] of RUNTIME_MAINTENANCE_SCRIPTS) {
    if (scripts[name] !== command) {
      missing.push(`${name}=${command}`);
    }
  }
  if (missing.length > 0) {
    fail(`package.json runtime maintenance wiring drifted: ${missing.join(', ')}`);
    return;
  }
  ok('package.json wires dry-run runtime maintenance and its behavior gate');
}

function checkTrellisInlineMode() {
  if (!fs.existsSync(repoPath('.trellis/config.yaml'))) {
    return;
  }

  const config = readText('.trellis/config.yaml');
  if (!/codex:\s*\n(?:[^\n]*\n)*?\s+dispatch_mode:\s*inline\b/m.test(config)) {
    fail('.trellis/config.yaml must keep codex.dispatch_mode: inline unless a task explicitly opts into Trellis phase workers');
    return;
  }

  ok('.trellis/config.yaml keeps Codex Trellis dispatch_mode inline');
}

function checkPiScaffoldPointer() {
  if (!fs.existsSync(repoPath('.pi/AGENTS.md'))) {
    return;
  }

  const piAgents = readText('.pi/AGENTS.md');
  const hasPointer = piAgents.includes('.pi/rules/pi-aios.md')
    && piAgents.includes('human-readable pointer');
  if (!hasPointer) {
    fail('.pi/AGENTS.md should stay a compatibility pointer to .pi/rules/pi-aios.md');
  } else {
    ok('.pi/AGENTS.md remains a compatibility pointer');
  }

  const rulesDir = repoPath('.pi/rules');
  const ruleFiles = fs.existsSync(rulesDir)
    ? fs.readdirSync(rulesDir).filter((name) => name.endsWith('.md')).sort()
    : [];
  if (ruleFiles.length === 0) {
    fail('.pi/rules must contain Pi project rules');
  } else {
    ok(`.pi/rules contains ${ruleFiles.length} project rule file(s): ${ruleFiles.join(', ')}`);
  }
}

function checkRuntimeLogs() {
  let audit;
  try {
    audit = auditTrellisRuntime(ROOT_DIR);
  } catch (error) {
    fail(`Trellis runtime hygiene audit failed: ${error.message}`);
    return;
  }

  if (audit.errors.length > 0) {
    const preview = audit.errors.slice(0, 5).map(({ file, reason }) => `${file}:${reason}`).join(', ');
    fail(`Trellis runtime hygiene audit could not inspect ${audit.errors.length} path(s): ${preview}`);
  }

  const livePidFiles = audit.protectedFiles.filter(({ reason }) => reason === 'live-pid-family');
  if (livePidFiles.length > 0) {
    const preview = livePidFiles.slice(0, 8).map(({ file }) => file).join(', ');
    warn(`runtime files protected by live PID families: ${livePidFiles.length}; preview=${preview}`);
  }

  if (audit.candidates.length > 0) {
    const preview = audit.candidates.slice(0, 8).map(({ file }) => file).join(', ');
    const suffix = audit.candidates.length > 8 ? `, ... +${audit.candidates.length - 8} more` : '';
    warn(`runtime cleanup candidates older than ${audit.retentionDays} days: ${audit.candidates.length}; bytes=${audit.candidateBytes}; preview=${preview}${suffix}`);
  }

  const maxFiles = 100;
  const maxBytes = 10 * 1024 * 1024;
  if (audit.scannedCount > maxFiles || audit.scannedBytes > maxBytes) {
    warn(`runtime footprint exceeds maintenance warning threshold: files=${audit.scannedCount}/${maxFiles} bytes=${audit.scannedBytes}/${maxBytes}`);
  }

  if (audit.errors.length === 0
    && livePidFiles.length === 0
    && audit.candidates.length === 0
    && audit.scannedCount <= maxFiles
    && audit.scannedBytes <= maxBytes) {
    ok(`runtime hygiene holds: files=${audit.scannedCount} bytes=${audit.scannedBytes}`);
  }
}

function checkCompletedLiveTasks() {
  const tasksDir = repoPath('.trellis/tasks');
  if (!fs.existsSync(tasksDir)) {
    fail('.trellis/tasks directory missing');
    return;
  }

  const completed = [];
  const invalid = [];

  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') {
      continue;
    }

    const taskJson = path.join(tasksDir, entry.name, 'task.json');
    if (!fs.existsSync(taskJson)) {
      continue;
    }

    try {
      const task = JSON.parse(fs.readFileSync(taskJson, 'utf8'));
      if (task.status === 'completed') {
        completed.push(entry.name);
      }
    } catch (error) {
      invalid.push(`${rel('.trellis/tasks', entry.name, 'task.json')}: ${error.message}`);
    }
  }

  for (const item of invalid) {
    fail(`invalid task.json: ${item}`);
  }

  if (completed.length === 0) {
    ok('no completed live Trellis tasks waiting for archive review');
    return;
  }

  const preview = completed.slice(0, 8).join(', ');
  const suffix = completed.length > 8 ? `, ... +${completed.length - 8} more` : '';
  warn(`completed live Trellis tasks need scoped archive review: ${completed.length}; preview=${preview}${suffix}`);
}

function main() {
  checkRequiredFiles();
  checkAgentsTruthTable();
  checkCodexNoTaskRouting();
  checkPlanningRouteMap();
  checkPlansRouteSemantics();
  checkRuntimeMaintenanceWiring();
  checkTrellisInlineMode();
  checkPiScaffoldPointer();
  checkRuntimeLogs();
  checkCompletedLiveTasks();

  const failed = findings.filter((finding) => finding.level === 'FAIL');
  for (const finding of findings) {
    const stream = finding.level === 'FAIL' ? process.stderr : process.stdout;
    stream.write(`[agent-workflow] ${finding.level}: ${finding.message}\n`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
