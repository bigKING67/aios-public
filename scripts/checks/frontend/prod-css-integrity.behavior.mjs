#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  withFixtureWorkspace,
} from '../../lib/shared/gate-fixture-utils.mjs';
import {
  REQUIRED_PRODUCTION_CSS_TOKENS,
  checkFrontendProdCssIntegrity,
  findMissingProductionCssTokens,
  findPureGlobalRootCssModules,
  findSideEffectCssModuleImports,
} from '../../lib/frontend/frontend-prod-css-integrity-core.mjs';

const {
  assertDeepEqual,
  assertEqual,
  reportOk,
} = createCheckGuard('frontend-prod-css-integrity-behavior');

const sideEffectImports = findSideEffectCssModuleImports([
  {
    path: 'apps/web-vite/src/app/example/bad.ts',
    content: "import './tokens.module.css';\nimport styles from './safe.module.css';\n",
  },
]);
assertEqual(sideEffectImports.length, 1, 'side-effect CSS Module imports should be detected');
assertEqual(sideEffectImports[0].line, 1, 'side-effect CSS Module finding should report the source line');
assertEqual(sideEffectImports[0].importPath, './tokens.module.css', 'side-effect CSS Module finding should report import path');

const safeImports = findSideEffectCssModuleImports([
  {
    path: 'apps/web-vite/src/app/example/good.ts',
    content: "import styles from './component.module.css';\nimport './global.css';\n",
  },
]);
assertEqual(safeImports.length, 0, 'bound CSS Module imports and plain CSS side effects should pass');

const pureGlobals = findPureGlobalRootCssModules([
  {
    path: 'apps/web-vite/src/app/example/tokens.module.css',
    content: ':global(:root) {\n  --example-token: red;\n}\n',
  },
  {
    path: 'apps/web-vite/src/app/example/component.module.css',
    content: ':global(:root) {\n  --example-token: red;\n}\n.component { color: var(--example-token); }\n',
  },
]);
assertDeepEqual(
  pureGlobals,
  [{ file: 'apps/web-vite/src/app/example/tokens.module.css' }],
  'pure :global(:root) CSS Module files should be detected while class-bearing modules pass',
);

const completeCss = REQUIRED_PRODUCTION_CSS_TOKENS
  .map((token) => `${token}: var(--fixture);`)
  .join('\n');
assertDeepEqual(
  findMissingProductionCssTokens([{ path: 'assets/index.css', content: completeCss }]),
  [],
  'all critical production tokens present should pass',
);
assertDeepEqual(
  findMissingProductionCssTokens([{ path: 'assets/index.css', content: completeCss.replace('--dashboard-inverse-text:', '--dashboard-inverse-text-missing:') }]),
  ['--dashboard-inverse-text'],
  'missing critical production token should be reported',
);

withFixtureWorkspace({
  prefix: 'aios-prod-css-integrity-',
  files: {
    'apps/web-vite/src/app/example/component.module.css': '.component { color: var(--dashboard-inverse-text); }\n',
    'apps/web-vite/src/app/example/global.css': ':root { --example-global: red; }\n',
    'apps/web-vite/src/app/example/page.tsx': "import styles from './component.module.css';\nimport './global.css';\nexport function Page() { return styles.component; }\n",
    'apps/web-vite/dist/assets/index-fixture.css': `${completeCss}\n.dashboard { color: var(--dashboard-inverse-text); }\n`,
  },
}, (fixture) => {
  const fixtureRuntimeResult = checkFrontendProdCssIntegrity(fixture.repoRoot);
  assertEqual(
    fixtureRuntimeResult.distCssFiles.length,
    1,
    'fixture production dist should expose one CSS asset',
  );
  assertEqual(
    fixtureRuntimeResult.missingProductionTokens.length,
    0,
    'fixture built production CSS should include all critical dashboard tokens',
  );
  assertEqual(
    fixtureRuntimeResult.sideEffectCssModuleImports.length,
    0,
    'fixture source should not import CSS Modules for side effects',
  );
});

reportOk('side-effect CSS Module imports, pure global-root modules, critical production token detection, and runtime integrity fixture passed.');
