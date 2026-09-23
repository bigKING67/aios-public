import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const frontendTypeScriptFiles = [
  'apps/web-vite/src/**/*.{ts,tsx}',
];

const toolingJavaScriptFiles = [
  'eslint.config.mjs',
  'postcss.config.js',
  'scripts/**/*.{cjs,js,mjs}',
  'backend-rust/scripts/**/*.{cjs,js,mjs}',
  'docker/content-production/renderer/*.mjs',
];

export default [
  {
    name: 'aios/global-ignores',
    ignores: [
      '**/node_modules/**',
      '.cache/**',
      '.artifacts/**',
      '.trellis/**',
      'apps/web-vite/dist/**',
      'backend-rust/target/**',
      'coverage/**',
      'dist/**',
      'etl/groland_postgres/.venv/**',
      'etl/groland_postgres/.uv-cache/**',
      'test-results/**',
    ],
  },
  {
    ...js.configs.recommended,
    name: 'aios/tooling-javascript',
    files: toolingJavaScriptFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2022,
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      // Existing executable guards expose this debt without blocking the first real lint rollout.
      'no-unused-vars': 'warn',
    },
  },
  {
    name: 'aios/browser-evaluation-tooling',
    files: [
      'scripts/lib/frontend/smoke/playwright-engine.mjs',
      'scripts/lib/frontend/smoke/snapshot.mjs',
      'scripts/lib/reports/special-report-browser-visual-smoke.mjs',
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: 'aios/k6-tooling',
    files: ['backend-rust/scripts/k6_*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommended.map((config, index) => ({
    ...config,
    name: `aios/frontend-typescript-${index + 1}`,
    files: frontendTypeScriptFiles,
  })),
  {
    name: 'aios/frontend-typescript-rules',
    files: frontendTypeScriptFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          allowInterfaces: 'with-single-extends',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],
    },
  },
  {
    name: 'aios/tooling-typescript',
    files: [
      '.pi/extensions/trellis/index.ts',
      'apps/web-vite/vite.config.ts',
      'apps/web-vite/vitest.config.ts',
      'apps/web-vite/vitest.coverage.config.ts',
      'tailwind.config.ts',
    ],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.es2022,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended[2].rules,
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
