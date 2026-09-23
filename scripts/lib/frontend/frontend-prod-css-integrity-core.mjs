import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  listGitFiles,
} from '../shared/guard-utils.mjs';

export const DIST_ASSETS_PATH = 'apps/web-vite/dist/assets';

export const REQUIRED_PRODUCTION_CSS_TOKENS = Object.freeze([
  '--dashboard-inverse-text',
  '--dashboard-panel-border',
  '--dashboard-brand-tab-shadow',
  '--dashboard-live-card-border',
]);

const SOURCE_EXTENSIONS = Object.freeze([
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sourceFiles(repoRoot) {
  return listGitFiles(['apps/web-vite/src'], { cwd: repoRoot, existing: true })
    .filter((file) => SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)));
}

function cssModuleFiles(repoRoot) {
  return listGitFiles(['apps/web-vite/src'], { cwd: repoRoot, existing: true })
    .filter((file) => file.endsWith('.module.css'));
}

function listDistCssFiles(repoRoot) {
  const distAssetsPath = path.join(repoRoot, DIST_ASSETS_PATH);
  if (!existsSync(distAssetsPath) || !statSync(distAssetsPath).isDirectory()) {
    throw new Error(`${DIST_ASSETS_PATH} not found. Run npm run build before this gate.`);
  }

  return readdirSync(distAssetsPath)
    .filter((fileName) => fileName.endsWith('.css'))
    .map((fileName) => normalizeRepoPath(path.join(DIST_ASSETS_PATH, fileName)));
}

export function findSideEffectCssModuleImports(files) {
  const findings = [];
  const sideEffectImportPattern = /^\s*import\s+['"]([^'"]+\.module\.css)['"]\s*;?\s*$/gm;

  for (const file of files) {
    const content = file.content ?? '';
    for (const match of content.matchAll(sideEffectImportPattern)) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({
        file: file.path,
        line,
        importPath: match[1],
      });
    }
  }

  return findings;
}

export function findPureGlobalRootCssModules(files) {
  const findings = [];
  const globalRootPattern = /:global\(:root\)\s*\{/;
  const localClassPattern = /^\s*\.[A-Za-z_-][A-Za-z0-9_-]*\b/gm;

  for (const file of files) {
    const content = file.content ?? '';
    if (!globalRootPattern.test(content)) {
      continue;
    }
    if (localClassPattern.test(content)) {
      continue;
    }
    findings.push({ file: file.path });
  }

  return findings;
}

export function findMissingProductionCssTokens(cssSources, requiredTokens = REQUIRED_PRODUCTION_CSS_TOKENS) {
  const joinedCss = cssSources.map((source) => source.content ?? '').join('\n');
  return requiredTokens.filter((token) => !joinedCss.includes(`${token}:`));
}

export function checkFrontendProdCssIntegrity(repoRoot) {
  const sourceFileEntries = sourceFiles(repoRoot).map((file) => ({
    path: file,
    content: readFileSync(path.join(repoRoot, file), 'utf8'),
  }));
  const cssModuleEntries = cssModuleFiles(repoRoot).map((file) => ({
    path: file,
    content: readFileSync(path.join(repoRoot, file), 'utf8'),
  }));
  const distCssFiles = listDistCssFiles(repoRoot);
  const distCssEntries = distCssFiles.map((file) => ({
    path: file,
    content: readFileSync(path.join(repoRoot, file), 'utf8'),
  }));

  return {
    distCssFiles,
    missingProductionTokens: findMissingProductionCssTokens(distCssEntries),
    pureGlobalRootCssModules: findPureGlobalRootCssModules(cssModuleEntries),
    sideEffectCssModuleImports: findSideEffectCssModuleImports(sourceFileEntries),
  };
}

export function formatFrontendProdCssIntegrityFindings(result) {
  const findings = [];

  for (const finding of result.sideEffectCssModuleImports) {
    findings.push(
      `${finding.file}:${finding.line} imports ${finding.importPath} for side effects. CSS Modules must be imported through a local class binding, or converted to a plain .css file for global side effects.`,
    );
  }

  for (const finding of result.pureGlobalRootCssModules) {
    findings.push(
      `${finding.file} defines :global(:root) tokens without local CSS Module classes. Use a plain .css file for global tokens so production CSS extraction cannot drop the side effect.`,
    );
  }

  for (const token of result.missingProductionTokens) {
    findings.push(
      `${DIST_ASSETS_PATH} is missing required production CSS token ${token}. Run npm run build and ensure the token source is imported from a production-rendered entrypoint.`,
    );
  }

  return findings;
}

export function summarizeFrontendProdCssIntegrity(result) {
  return `${result.distCssFiles.length} production CSS assets include ${REQUIRED_PRODUCTION_CSS_TOKENS.length} critical runtime tokens; CSS Module side effects are clean.`;
}
