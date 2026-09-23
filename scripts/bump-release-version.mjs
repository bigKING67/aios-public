#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_NAME = 'release-bump';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const PLACEHOLDER_UNRELEASED = '- 尚无未发布变更记录。';
const PLACEHOLDER_RELEASE_BODY = '- 发布版本占位：请在提交前补充本版本变更摘要。';

function fail(message) {
  console.error(`[${SCRIPT_NAME}] ERROR: ${message}`);
  process.exit(1);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/bump-release-version.mjs <patch|minor|major|X.Y.Z> [--date YYYY-MM-DD] [--dry-run]',
    '',
    'Examples:',
    '  npm run release:bump:patch',
    '  npm run release:bump:minor -- --dry-run',
    '  npm run release:bump -- 2.2.0',
  ].join('\n');
}

function formatLocalDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureTrailingNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function parseArgs(argv) {
  const options = {
    bump: undefined,
    date: formatLocalDate(new Date()),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--date') {
      const value = argv[index + 1];
      if (!value) {
        fail('--date requires a YYYY-MM-DD value.');
      }
      options.date = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--date=')) {
      options.date = arg.slice('--date='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      fail(`unknown option: ${arg}\n\n${usage()}`);
    }

    if (options.bump) {
      fail(`multiple bump targets provided: ${options.bump}, ${arg}`);
    }
    options.bump = arg;
  }

  if (!options.bump) {
    fail(`missing bump target.\n\n${usage()}`);
  }

  if (!DATE_PATTERN.test(options.date)) {
    fail(`invalid date: ${options.date}. Expected YYYY-MM-DD.`);
  }

  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`failed to read JSON ${filePath}: ${error.message}`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    fail(`unsupported version format: ${version}. Expected X.Y.Z.`);
  }

  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function resolveNextVersion(currentVersion, bump) {
  const [major, minor, patch] = parseVersion(currentVersion);

  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }

  if (bump === 'minor') {
    return `${major}.${minor + 1}.0`;
  }

  if (bump === 'patch') {
    return `${major}.${minor}.${patch + 1}`;
  }

  if (VERSION_PATTERN.test(bump)) {
    if (compareVersions(bump, currentVersion) <= 0) {
      fail(`target version ${bump} must be greater than current version ${currentVersion}.`);
    }
    return bump;
  }

  fail(`invalid bump target: ${bump}. Expected patch, minor, major, or X.Y.Z.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function assertIncludes(source, needle, fileLabel) {
  if (!source.includes(needle)) {
    fail(`${fileLabel} does not contain required text: ${needle}`);
  }
}

function updateReadme(source, currentVersion, nextVersion, releaseDate) {
  const currentVersionText = `当前版本：\`${currentVersion}\``;
  assertIncludes(source, currentVersionText, 'README.md');

  const versionPattern = new RegExp(`当前版本：\`${escapeRegExp(currentVersion)}\``, 'u');
  const datePattern = /最后更新：`\d{4}-\d{2}-\d{2}`/u;

  if (!datePattern.test(source)) {
    fail('README.md does not contain a recognized last-updated line.');
  }

  return source
    .replace(versionPattern, `当前版本：\`${nextVersion}\``)
    .replace(datePattern, `最后更新：\`${releaseDate}\``);
}

function extractUnreleasedSection(source) {
  const headingMatch = source.match(/^## Unreleased\s*$/mu);
  if (!headingMatch || headingMatch.index === undefined) {
    fail('CHANGELOG.md must contain a "## Unreleased" section.');
  }

  const sectionStart = headingMatch.index;
  const bodyStart = sectionStart + headingMatch[0].length;
  const afterHeading = source.slice(bodyStart);
  const nextHeadingMatch = afterHeading.match(/\n##\s+[^\n]+/u);
  const nextHeadingOffset = nextHeadingMatch?.index ?? afterHeading.length;

  return {
    before: source.slice(0, sectionStart),
    body: afterHeading.slice(0, nextHeadingOffset),
    after: afterHeading.slice(nextHeadingOffset),
  };
}

function isPlaceholderUnreleased(body) {
  const normalized = body.trim();
  return (
    normalized.length === 0 ||
    normalized === PLACEHOLDER_UNRELEASED ||
    normalized.includes('当前未发布变更先记录在本节')
  );
}

function updateChangelog(source, nextVersion, releaseDate) {
  if (new RegExp(`^## ${escapeRegExp(nextVersion)}\\b`, 'mu').test(source)) {
    fail(`CHANGELOG.md already contains a ${nextVersion} section.`);
  }

  const { before, body, after } = extractUnreleasedSection(source);
  const releaseBody = isPlaceholderUnreleased(body) ? PLACEHOLDER_RELEASE_BODY : body.trim();

  return [
    before.trimEnd(),
    '',
    '## Unreleased',
    '',
    PLACEHOLDER_UNRELEASED,
    '',
    `## ${nextVersion} - ${releaseDate}`,
    '',
    releaseBody,
    '',
    after.trimStart(),
  ].join('\n');
}

function updatePackageLock(lockPayload, currentVersion, nextVersion) {
  if (lockPayload.version !== currentVersion) {
    fail(`package-lock.json top-level version is ${lockPayload.version}, expected ${currentVersion}.`);
  }

  if (!lockPayload.packages || !lockPayload.packages['']) {
    fail('package-lock.json is missing packages[""].');
  }

  if (lockPayload.packages[''].version !== currentVersion) {
    fail(
      `package-lock.json root package version is ${lockPayload.packages[''].version}, expected ${currentVersion}.`,
    );
  }

  lockPayload.version = nextVersion;
  lockPayload.packages[''].version = nextVersion;
  return lockPayload;
}

function listDirtyFiles(repoRoot) {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const packagePath = path.join(repoRoot, 'package.json');
  const packageLockPath = path.join(repoRoot, 'package-lock.json');
  const readmePath = path.join(repoRoot, 'README.md');
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

  const packagePayload = readJson(packagePath);
  const currentVersion = packagePayload.version;
  const nextVersion = resolveNextVersion(currentVersion, options.bump);

  const packageLockPayload = updatePackageLock(
    readJson(packageLockPath),
    currentVersion,
    nextVersion,
  );

  packagePayload.version = nextVersion;

  const updates = [
    {
      label: 'package.json',
      path: packagePath,
      content: stableJson(packagePayload),
    },
    {
      label: 'package-lock.json',
      path: packageLockPath,
      content: stableJson(packageLockPayload),
    },
    {
      label: 'README.md',
      path: readmePath,
      content: ensureTrailingNewline(
        updateReadme(fs.readFileSync(readmePath, 'utf8'), currentVersion, nextVersion, options.date),
      ),
    },
    {
      label: 'CHANGELOG.md',
      path: changelogPath,
      content: ensureTrailingNewline(
        updateChangelog(fs.readFileSync(changelogPath, 'utf8'), nextVersion, options.date),
      ),
    },
  ];

  const dirtyFiles = listDirtyFiles(repoRoot);
  if (dirtyFiles.length > 0) {
    console.warn(`[${SCRIPT_NAME}] WARN: working tree already has changes:`);
    for (const line of dirtyFiles.slice(0, 12)) {
      console.warn(`  ${line}`);
    }
    if (dirtyFiles.length > 12) {
      console.warn(`  ... ${dirtyFiles.length - 12} more`);
    }
  }

  console.log(`[${SCRIPT_NAME}] ${currentVersion} -> ${nextVersion} (${options.date})`);

  if (options.dryRun) {
    console.log(`[${SCRIPT_NAME}] dry-run; no files were written.`);
    for (const update of updates) {
      console.log(`[${SCRIPT_NAME}] would update ${update.label}`);
    }
    return;
  }

  for (const update of updates) {
    fs.writeFileSync(update.path, update.content);
    console.log(`[${SCRIPT_NAME}] updated ${update.label}`);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Review CHANGELOG.md and replace the release placeholder if needed.');
  console.log('  2. Run relevant verification commands.');
  console.log(`  3. git add package.json package-lock.json README.md CHANGELOG.md`);
  console.log(`  4. git commit -m "chore(release): prepare v${nextVersion}"`);
  console.log(`  5. git tag -a v${nextVersion} -m "Release v${nextVersion}"`);
}

main();
