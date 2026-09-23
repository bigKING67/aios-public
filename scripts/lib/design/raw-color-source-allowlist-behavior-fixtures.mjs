import {
  parseRawColorSourceAllowlist,
  RAW_COLOR_SOURCE_ALLOWLIST_PATH,
} from './raw-color-source-allowlist.mjs';

function parseJsonAllowlistSource(source, fail) {
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} parse failed: ${error.message}`);
  }
}

function readRawColorSourceAllowlistFromFiles(files, fail, options = {}) {
  if (!Object.hasOwn(files, RAW_COLOR_SOURCE_ALLOWLIST_PATH)) {
    fail(`${RAW_COLOR_SOURCE_ALLOWLIST_PATH} not found.`);
  }

  const source = files[RAW_COLOR_SOURCE_ALLOWLIST_PATH];
  const config = typeof source === 'string'
    ? parseJsonAllowlistSource(source, fail)
    : source;
  const existingFiles = new Set(Object.keys(files));

  return parseRawColorSourceAllowlist(config, fail, {
    ...options,
    fileExists: (normalizedPath) => existingFiles.has(normalizedPath),
  });
}

function captureRead(files, options = {}) {
  try {
    return {
      ok: true,
      value: readRawColorSourceAllowlistFromFiles(files, (message) => {
        throw new Error(message);
      }, options),
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

function allowlistSource(sourceOverrides = {}) {
  return {
    version: 1,
    sources: [
      {
        path: 'apps/web-vite/src/lib/design-token-values.ts',
        owner: 'fixture-token-source',
        reason: 'Fixture raw color token source.',
        allowed: 'Fixture token values.',
        notAllowed: 'Component-local raw colors.',
        ...sourceOverrides,
      },
    ],
  };
}

export function runRawColorSourceAllowlistBehaviorFixtures(assertions) {
  const {
    assertDeepEqual,
    assertEqual,
    assertFalse,
    assertIncludes,
    assertTrue,
  } = assertions;

  {
    const result = captureRead({
      [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: allowlistSource({
        path: 'apps\\web-vite\\src\\lib\\design-token-values.ts',
      }),
      'apps/web-vite/src/lib/design-token-values.ts': 'export const token = "#ffffff";\n',
    });
    assertTrue(result.ok, 'valid raw color source allowlist should pass');
    assertDeepEqual(
      [...result.value],
      ['apps/web-vite/src/lib/design-token-values.ts'],
      'allowlist helper should return normalized repo-relative source paths',
    );
  }

  {
    const files = {
      [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
        version: 1,
        sources: [
          {
            path: 'apps/web-vite/src/lib/future-token-source.ts',
          },
        ],
      },
    };

    const strictResult = captureRead(files);
    assertFalse(strictResult.ok, 'metadata and existing-file checks should be strict by default');
    assertEqual(
      strictResult.message,
      `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[0].owner must be a non-empty string.`,
      'default strict mode should require owner metadata first',
    );

    const relaxedResult = captureRead(files, {
      requireExistingFiles: false,
      requireMetadata: false,
    });
    assertTrue(relaxedResult.ok, 'docs drift checks should be able to read path-only allowlist entries');
    assertDeepEqual(
      [...relaxedResult.value],
      ['apps/web-vite/src/lib/future-token-source.ts'],
      'relaxed mode should still normalize path-only entries',
    );
  }

  const invalidConfigCases = [
    {
      name: 'missing config file',
      files: {},
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} not found.`,
    },
    {
      name: 'root array',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: [],
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} root must be an object.`,
    },
    {
      name: 'wrong version',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
          version: 2,
          sources: [],
        },
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} version must be 1.`,
    },
    {
      name: 'sources not array',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
          version: 1,
          sources: {},
        },
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources must be an array.`,
    },
    {
      name: 'source not object',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
          version: 1,
          sources: ['apps/web-vite/src/lib/design-token-values.ts'],
        },
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[0] must be an object.`,
    },
    {
      name: 'blank path',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
          version: 1,
          sources: [{ path: '   ' }],
        },
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} sources[0].path must be a non-empty string.`,
    },
    {
      name: 'absolute path',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: allowlistSource({ path: '/apps/web-vite/src/lib/design-token-values.ts' }),
      },
      expected: '/apps/web-vite/src/lib/design-token-values.ts must be a repository-relative path.',
    },
    {
      name: 'parent traversal path',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: allowlistSource({ path: '../apps/web-vite/src/lib/design-token-values.ts' }),
      },
      expected: '../apps/web-vite/src/lib/design-token-values.ts must be a repository-relative path.',
    },
    {
      name: 'non-src path',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: allowlistSource({ path: 'scripts/design-token-values.ts' }),
      },
      expected: 'scripts/design-token-values.ts must stay under apps/web-vite/src/.',
    },
    {
      name: 'missing source file',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: allowlistSource(),
      },
      expected: 'apps/web-vite/src/lib/design-token-values.ts does not exist.',
    },
    {
      name: 'duplicate normalized path',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: {
          version: 1,
          sources: [
            allowlistSource().sources[0],
            {
              ...allowlistSource().sources[0],
              path: 'apps\\web-vite\\src\\lib\\design-token-values.ts',
            },
          ],
        },
        'apps/web-vite/src/lib/design-token-values.ts': 'export const token = "#ffffff";\n',
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} contains duplicate path: apps/web-vite/src/lib/design-token-values.ts`,
    },
    {
      name: 'invalid json',
      files: {
        [RAW_COLOR_SOURCE_ALLOWLIST_PATH]: '{',
      },
      expected: `${RAW_COLOR_SOURCE_ALLOWLIST_PATH} parse failed: Expected property name or '}' in JSON at position 1`,
    },
  ];

  for (const { expected, files, name } of invalidConfigCases) {
    const result = captureRead(files);
    assertFalse(result.ok, `${name} should fail`);
    if (name === 'invalid json') {
      assertIncludes(result.message, expected, `${name} failure should stay explicit`);
      continue;
    }
    assertEqual(result.message, expected, `${name} failure should stay explicit`);
  }

  return 'schema, metadata, path boundary, existing-file, duplicate, and relaxed-read cases passed.';
}
