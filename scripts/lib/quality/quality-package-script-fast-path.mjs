const PACKAGE_JSON_SCRIPT_FAST_PREFIXES = Object.freeze([
  'verify:app:',
  'verify:backend',
  'verify:components:',
  'verify:css-modules:',
  'verify:dashboard:',
  'verify:deploy:',
  'verify:quality-runner',
  'verify:ci:',
  'verify:dataops',
  'verify:design:',
  'verify:frontend:',
  'verify:repo:',
  'verify:shell:',
  'verify:weekly:',
]);

const PACKAGE_JSON_SCRIPT_FAST_NAMES = new Set([
  'test:frontend:coverage',
]);

const LINT_CACHE_MIGRATION_COMMANDS = Object.freeze([
  'eslint .',
  'eslint . --cache --cache-location .cache/eslint/ --cache-strategy content',
  'eslint . --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --no-error-on-unmatched-pattern --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts apps/web-vite/vitest.coverage.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
]);

const LINT_SURFACE_COMMANDS_BY_SCRIPT = Object.freeze({
  'lint:scripts': new Set([
    'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
  ]),
});

const TYPE_CHECK_CACHE_MIGRATION_COMMANDS = Object.freeze([
  'tsc --noEmit',
  'tsc --noEmit --tsBuildInfoFile .cache/tsc/tsconfig.tsbuildinfo',
  'tsc -p tsconfig.frontend.json --noEmit',
  'tsc -p tsconfig.frontend.json --noEmit --tsBuildInfoFile .cache/tsc/frontend.tsbuildinfo',
]);

export function packageScriptChangeCanUseFastPath(scriptName, previousCommand, currentCommand) {
  if (
    PACKAGE_JSON_SCRIPT_FAST_NAMES.has(scriptName)
    || PACKAGE_JSON_SCRIPT_FAST_PREFIXES.some((prefix) => scriptName === prefix || scriptName.startsWith(prefix))
  ) {
    return true;
  }
  if (scriptName === 'lint') {
    const previous = String(previousCommand ?? '').trim();
    const current = String(currentCommand ?? '').trim();
    return LINT_CACHE_MIGRATION_COMMANDS.includes(previous)
      && LINT_CACHE_MIGRATION_COMMANDS.includes(current);
  }
  if (scriptName === 'type-check') {
    const previous = String(previousCommand ?? '').trim();
    const current = String(currentCommand ?? '').trim();
    return TYPE_CHECK_CACHE_MIGRATION_COMMANDS.includes(previous)
      && TYPE_CHECK_CACHE_MIGRATION_COMMANDS.includes(current);
  }
  const lintSurfaceCommands = LINT_SURFACE_COMMANDS_BY_SCRIPT[scriptName];
  if (!lintSurfaceCommands) {
    return false;
  }
  const previous = String(previousCommand ?? '').trim();
  const current = String(currentCommand ?? '').trim();
  return (!previous || lintSurfaceCommands.has(previous))
    && lintSurfaceCommands.has(current);
}
