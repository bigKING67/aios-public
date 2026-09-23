import {
  CI_META_GATES,
  QUICK_BASELINE_GATES,
} from './quality-affected-gates.mjs';
import {
  QUALITY_RUNNER_SLICE_GATES,
} from './quality-runner-slices.mjs';

function normalizePackageChangeKind(value) {
  if (value === true) {
    return 'full-ci';
  }
  if (value === false) {
    return 'script-fast-path';
  }
  return value;
}

export function packageJsonAffectedRule({
  allCiNames,
  base,
  head = null,
  packageJsonKind,
  packageJsonRequiresFullCi = null,
  repoRoot,
}) {
  const kind = normalizePackageChangeKind(packageJsonRequiresFullCi
    ? packageJsonRequiresFullCi(repoRoot, base, head)
    : packageJsonKind(repoRoot, base, head));
  const fullCi = kind === 'full-ci';

  return {
    gates: fullCi
      ? [...allCiNames]
      : kind === 'release-metadata-only'
        ? ['verify:ci:release-version-bump', ...CI_META_GATES]
        : [...CI_META_GATES, ...QUALITY_RUNNER_SLICE_GATES, ...QUICK_BASELINE_GATES],
    reason: fullCi
      ? 'package.json: package/tooling change requires full static coverage'
      : kind === 'release-metadata-only'
        ? 'package.json: release metadata-only package change'
        : 'package.json: quality-runner script-only package change',
  };
}

export function packageLockAffectedRule({
  allCiNames,
  base,
  head = null,
  packageLockKind,
  packageLockRequiresFullCi = null,
  repoRoot,
}) {
  const kind = normalizePackageChangeKind(packageLockRequiresFullCi
    ? packageLockRequiresFullCi(repoRoot, base, head)
    : packageLockKind(repoRoot, base, head));
  const fullCi = kind === 'full-ci';

  return {
    gates: fullCi
      ? [...allCiNames]
      : ['verify:ci:release-version-bump', ...CI_META_GATES],
    reason: fullCi
      ? 'package-lock.json: package/tooling change requires full static coverage'
      : 'package-lock.json: package-lock root-version-only release metadata change',
  };
}

export function packageAffectedRule({
  allCiNames,
  base,
  file,
  head = null,
  packageJsonKind,
  packageJsonRequiresFullCi = null,
  packageLockKind,
  packageLockRequiresFullCi = null,
  repoRoot,
}) {
  if (file === 'package.json') {
    return packageJsonAffectedRule({
      allCiNames,
      base,
      head,
      packageJsonKind,
      packageJsonRequiresFullCi,
      repoRoot,
    });
  }

  if (file === 'package-lock.json') {
    return packageLockAffectedRule({
      allCiNames,
      base,
      head,
      packageLockKind,
      packageLockRequiresFullCi,
      repoRoot,
    });
  }

  if (file.endsWith('lock')) {
    return {
      gates: [...allCiNames],
      reason: `${file}: package/tooling change requires full static coverage`,
    };
  }

  return null;
}
