/**
 * Non-browser production preview contract gate.
 *
 * This guard inspects the built Vite dist artifact directly. It intentionally
 * avoids Playwright/Chrome so CI can prove the static preview contract without
 * depending on browser automation.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  FRONTEND_BUILD_MANIFEST_PATH,
  computeFrontendBuildFingerprint,
} from './frontend-build-fingerprint.mjs';
import {
  REQUIRED_PRODUCTION_CSS_TOKENS,
  findMissingProductionCssTokens,
} from './frontend-prod-css-integrity-core.mjs';
import {
  getRepoRoot,
} from '../shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-preview-contract';
const DIST_PATH = 'apps/web-vite/dist';
const INDEX_HTML_PATH = `${DIST_PATH}/index.html`;
const ATTRIBUTE_REF_PATTERN = /\b(?:href|src)=["']([^"']+)["']/giu;
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>/giu;
const LINK_TAG_PATTERN = /<link\b[^>]*>/giu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

class FrontendPreviewContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FrontendPreviewContractError';
  }
}

function createPreviewContractIo(options = {}) {
  return {
    exists: options.exists ?? existsSync,
    isDirectory: options.isDirectory ?? ((filePath) => statSync(filePath).isDirectory()),
    isFile: options.isFile ?? ((filePath) => statSync(filePath).isFile()),
    listDir: options.listDir ?? ((filePath) => readdirSync(filePath, { withFileTypes: true })),
    readFile: options.readFile ?? readFileSync,
  };
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function attrValue(tag, attrName) {
  const pattern = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, 'iu');
  return tag.match(pattern)?.[1] ?? null;
}

function normalizeLocalAssetRef(rawRef) {
  if (typeof rawRef !== 'string') {
    return null;
  }

  const trimmed = rawRef.trim();
  if (
    trimmed === ''
    || trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
  ) {
    return null;
  }

  const withoutHash = trimmed.split('#', 1)[0];
  const withoutQuery = withoutHash.split('?', 1)[0];
  const repoRelative = withoutQuery.startsWith('/')
    ? withoutQuery.slice(1)
    : withoutQuery.replace(/^\.\//u, '');
  if (repoRelative === '') {
    return null;
  }

  const normalized = path.posix.normalize(repoRelative);
  if (normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    return null;
  }

  return normalized;
}

function htmlAssetRefs(htmlSource) {
  const refs = new Set();
  for (const match of htmlSource.matchAll(ATTRIBUTE_REF_PATTERN)) {
    const normalized = normalizeLocalAssetRef(match[1]);
    if (normalized) {
      refs.add(normalized);
    }
  }
  return [...refs].sort();
}

function htmlModuleScripts(htmlSource) {
  return [...htmlSource.matchAll(SCRIPT_TAG_PATTERN)]
    .map((match) => match[0])
    .filter((tag) => attrValue(tag, 'type') === 'module')
    .map((tag) => normalizeLocalAssetRef(attrValue(tag, 'src')))
    .filter(Boolean);
}

function htmlStylesheets(htmlSource) {
  return [...htmlSource.matchAll(LINK_TAG_PATTERN)]
    .map((match) => match[0])
    .filter((tag) => (attrValue(tag, 'rel') ?? '').split(/\s+/u).includes('stylesheet'))
    .map((tag) => normalizeLocalAssetRef(attrValue(tag, 'href')))
    .filter(Boolean);
}

function readTextFile(repoRoot, repoPath, io, findings) {
  const absPath = path.join(repoRoot, repoPath);
  if (!io.exists(absPath) || !io.isFile(absPath)) {
    findings.push(`${repoPath} not found. Run npm run build before this gate.`);
    return null;
  }

  return String(io.readFile(absPath));
}

function readJsonFile(repoRoot, repoPath, io, findings) {
  const source = readTextFile(repoRoot, repoPath, io, findings);
  if (source === null) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    findings.push(`${repoPath} parse failed: ${error.message}`);
    return null;
  }
}

function listFilesRecursive(absDir, repoRoot, io) {
  const files = [];
  for (const entry of io.listDir(absDir)) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(absPath, repoRoot, io));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(repoRoot, absPath).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function listDistCssFiles(repoRoot, io, findings) {
  const distAssetsPath = path.join(repoRoot, DIST_PATH, 'assets');
  if (!io.exists(distAssetsPath) || !io.isDirectory(distAssetsPath)) {
    findings.push(`${DIST_PATH}/assets not found. Run npm run build before this gate.`);
    return [];
  }

  return listFilesRecursive(distAssetsPath, repoRoot, io)
    .filter((filePath) => filePath.endsWith('.css'));
}

function validateDistRoot(repoRoot, io, findings) {
  const distPath = path.join(repoRoot, DIST_PATH);
  if (!io.exists(distPath) || !io.isDirectory(distPath)) {
    findings.push(`${DIST_PATH} not found. Run npm run build before this gate.`);
  }
}

function validateManifest(repoRoot, io, findings, options = {}) {
  const manifest = readJsonFile(repoRoot, FRONTEND_BUILD_MANIFEST_PATH, io, findings);
  if (manifest === null) {
    return null;
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must contain a JSON object.`);
    return null;
  }
  if (manifest.version !== 1) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must use version 1.`);
  }
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must include a parseable generatedAt timestamp.`);
  }
  if (typeof manifest.sourceFingerprint !== 'string' || !SHA256_PATTERN.test(manifest.sourceFingerprint)) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must include a sha256 sourceFingerprint.`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must include a non-empty files array.`);
  }
  if (!Array.isArray(manifest.envKeys) || manifest.envKeys.length === 0) {
    findings.push(`${FRONTEND_BUILD_MANIFEST_PATH} must include a non-empty envKeys array.`);
  }

  const current = computeFrontendBuildFingerprint(repoRoot, {
    ...io,
    env: options.env ?? process.env,
  });
  if (!arraysEqual(manifest.files, current.files)) {
    findings.push(
      `${FRONTEND_BUILD_MANIFEST_PATH} files list does not match the current frontend source/config/env input set. Run npm run build.`,
    );
  }
  if (!arraysEqual(manifest.envKeys, current.envKeys)) {
    findings.push(
      `${FRONTEND_BUILD_MANIFEST_PATH} envKeys list does not match the current frontend build env input set. Run npm run build.`,
    );
  }
  if (manifest.sourceFingerprint !== current.fingerprint) {
    findings.push(
      `${DIST_PATH} is stale: ${FRONTEND_BUILD_MANIFEST_PATH} sourceFingerprint does not match the current frontend source/config/env fingerprint. Run npm run build.`,
    );
  }

  return manifest;
}

function validateHtmlShell(repoRoot, htmlSource, io, findings) {
  if (!/<div\b(?=[^>]*\bid=["']root["'])[^>]*>\s*<\/div>/iu.test(htmlSource)) {
    findings.push(`${INDEX_HTML_PATH} must include the React root mount <div id="root"></div>.`);
  }

  const moduleScripts = htmlModuleScripts(htmlSource);
  const stylesheets = htmlStylesheets(htmlSource);
  const assetRefs = htmlAssetRefs(htmlSource);

  if (!moduleScripts.some((assetRef) => assetRef.startsWith('assets/') && assetRef.endsWith('.js'))) {
    findings.push(`${INDEX_HTML_PATH} must reference at least one module JavaScript asset under /assets/.`);
  }
  if (!stylesheets.some((assetRef) => assetRef.startsWith('assets/') && assetRef.endsWith('.css'))) {
    findings.push(`${INDEX_HTML_PATH} must reference at least one stylesheet asset under /assets/.`);
  }

  const missingAssetRefs = assetRefs.filter((assetRef) => {
    const absPath = path.join(repoRoot, DIST_PATH, assetRef);
    return !io.exists(absPath) || !io.isFile(absPath);
  });
  for (const assetRef of missingAssetRefs) {
    findings.push(`${INDEX_HTML_PATH} references missing dist asset: /${assetRef}`);
  }

  return {
    assetRefs,
    moduleScripts,
    stylesheets,
  };
}

function validateProductionCss(repoRoot, io, findings) {
  const cssFiles = listDistCssFiles(repoRoot, io, findings);
  if (cssFiles.length === 0) {
    findings.push(`${DIST_PATH}/assets does not contain any CSS assets. Run npm run build and inspect Vite output.`);
    return { cssFiles, missingProductionTokens: REQUIRED_PRODUCTION_CSS_TOKENS };
  }

  const cssSources = cssFiles.map((filePath) => ({
    content: String(io.readFile(path.join(repoRoot, filePath))),
    path: filePath,
  }));
  const missingProductionTokens = findMissingProductionCssTokens(cssSources);
  for (const token of missingProductionTokens) {
    findings.push(`${DIST_PATH}/assets is missing required production CSS token ${token}.`);
  }

  return { cssFiles, missingProductionTokens };
}

export function auditFrontendPreviewContract(repoRoot = getRepoRoot(), options = {}) {
  const io = createPreviewContractIo(options);
  const findings = [];

  validateDistRoot(repoRoot, io, findings);
  const manifest = validateManifest(repoRoot, io, findings, options);
  const htmlSource = readTextFile(repoRoot, INDEX_HTML_PATH, io, findings);
  const htmlContract = htmlSource === null
    ? { assetRefs: [], moduleScripts: [], stylesheets: [] }
    : validateHtmlShell(repoRoot, htmlSource, io, findings);
  const cssContract = validateProductionCss(repoRoot, io, findings);

  return {
    ...htmlContract,
    ...cssContract,
    findings,
    manifest,
  };
}

export function formatFrontendPreviewContractFailure(result) {
  return [
    `[${GUARD_NAME}] Frontend production preview contract drift was detected:`,
    ...result.findings.map((finding) => `- ${finding}`),
    '',
    'Run npm run build, then rerun npm run verify:frontend:preview-contract. This gate is intentionally non-browser and checks the built app shell contract directly.',
    '',
  ].join('\n');
}

export function summarizeFrontendPreviewContract(result) {
  return [
    `${result.assetRefs.length} HTML asset refs exist`,
    `${result.moduleScripts.length} module script refs`,
    `${result.stylesheets.length} stylesheet refs`,
    `${result.cssFiles.length} CSS assets include ${REQUIRED_PRODUCTION_CSS_TOKENS.length} critical tokens`,
    `manifest tracks ${result.manifest?.files?.length ?? 0} source/config/env inputs`,
  ].join('; ');
}

export function checkFrontendPreviewContract(repoRoot = getRepoRoot(), options = {}) {
  try {
    const result = auditFrontendPreviewContract(repoRoot, options);
    if (result.findings.length > 0) {
      return {
        status: 1,
        stdout: '',
        stderr: formatFrontendPreviewContractFailure(result),
      };
    }

    return {
      status: 0,
      stdout: `[${GUARD_NAME}] OK: ${summarizeFrontendPreviewContract(result)}.\n`,
      stderr: '',
    };
  } catch (error) {
    if (error instanceof FrontendPreviewContractError) {
      return {
        status: 1,
        stdout: '',
        stderr: `[${GUARD_NAME}] ${error.message}\n`,
      };
    }
    throw error;
  }
}
