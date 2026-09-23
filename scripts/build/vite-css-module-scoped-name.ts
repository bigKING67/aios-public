import { createHash } from 'node:crypto';
import path from 'node:path';

const SCOPED_NAME_HASH_LENGTH = 6;
const CSS_MODULE_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CSS_CLASS_NAME_PATTERN = /\.([A-Za-z_][A-Za-z0-9_-]*)/g;
const CSS_KEYFRAME_NAME_PATTERN = /@(?:-webkit-)?keyframes\s+([A-Za-z_][A-Za-z0-9_-]*)/g;
const CSS_ANIMATION_VALUE_PATTERN = /animation(?:-name)?\s*:\s*([^;]+)/g;
const CSS_IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_-]*/g;

type CssModuleScopedNameGenerator = (
  localName: string,
  filename: string,
  css: string,
) => string;

interface CssModulesOptions {
  generateScopedName: CssModuleScopedNameGenerator;
}

function encodeCssModuleToken(index: number): string {
  let remaining = index;
  let token = '';

  do {
    token = CSS_MODULE_TOKEN_ALPHABET[remaining % CSS_MODULE_TOKEN_ALPHABET.length] + token;
    remaining = Math.floor(remaining / CSS_MODULE_TOKEN_ALPHABET.length);
  } while (remaining > 0);

  return token;
}

function resolveLocalClassIndex(localName: string, css: string): number {
  const localNames = [
    ...[...css.matchAll(CSS_CLASS_NAME_PATTERN)].map((match) => match[1]),
    ...[...css.matchAll(CSS_KEYFRAME_NAME_PATTERN)].map((match) => match[1]),
    ...[...css.matchAll(CSS_ANIMATION_VALUE_PATTERN)].flatMap((match) => (
      [...match[1].matchAll(CSS_IDENTIFIER_PATTERN)].map((identifier) => identifier[0])
    )),
  ]
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort();
  const localIndex = localNames.indexOf(localName);

  if (localIndex === -1) {
    throw new Error(`CSS Module local class is missing from its source: ${localName}`);
  }

  return localIndex;
}

function stripRequestSuffix(filename: string): string {
  const suffixIndex = filename.search(/[?#]/);
  return suffixIndex === -1 ? filename : filename.slice(0, suffixIndex);
}

function resolveRepoRelativePath(repoRoot: string, filename: string): string {
  const relativePath = path.relative(repoRoot, path.resolve(stripRequestSuffix(filename)));
  if (
    !relativePath
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error(`CSS Module source must stay inside the repository: ${filename}`);
  }

  return relativePath.split(path.sep).join('/');
}

export function createProductionCssModuleScopedName(
  repoRoot: string,
): CssModuleScopedNameGenerator {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const scopedNameOwners = new Map<string, string>();

  return (localName, filename, css) => {
    const relativePath = resolveRepoRelativePath(resolvedRepoRoot, filename);
    const sourceLabel = `${relativePath}#${localName}`;
    const fileDigest = createHash('sha256')
      .update(relativePath)
      .digest('base64url')
      .slice(0, SCOPED_NAME_HASH_LENGTH);
    const localToken = encodeCssModuleToken(resolveLocalClassIndex(localName, css));
    const scopedName = `_${fileDigest}${localToken}`;
    const existingOwner = scopedNameOwners.get(scopedName);

    // A short production name is safe only when every source identity stays unique.
    if (existingOwner && existingOwner !== sourceLabel) {
      throw new Error(
        `CSS Module scoped-name collision for ${scopedName}: ${existingOwner} and ${sourceLabel}`,
      );
    }

    scopedNameOwners.set(scopedName, sourceLabel);
    return scopedName;
  };
}

export function resolveCssModulesOptions(
  mode: string,
  repoRoot: string,
): CssModulesOptions | undefined {
  if (mode !== 'production') {
    return undefined;
  }

  return {
    generateScopedName: createProductionCssModuleScopedName(repoRoot),
  };
}
