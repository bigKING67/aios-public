import {
  computeFrontendBuildFingerprint,
  listFrontendBuildFingerprintInputs,
} from './frontend-build-fingerprint.mjs';

const FIXTURE_REPO_ROOT = '/fixture';

function createFixtureFiles() {
  return {
    'apps/web-vite/dist/assets/app.js': 'stale build output must not affect fingerprint\n',
    'apps/web-vite/index.html': '<div id="root"></div>\n',
    'apps/web-vite/src/main.tsx': 'console.log("app");\n',
    'apps/web-vite/vite.config.ts': 'export default {};\n',
    'package-lock.json': '{"lockfileVersion":3}\n',
    'package.json': '{"name":"fingerprint-fixture"}\n',
    'public/home-brand-crop.png': 'fixture-image\n',
    'apps/web-vite/src/app/page.tsx': 'export const page = 1;\n',
  };
}

function toRepoPath(absPath) {
  const normalizedPath = absPath.split('\\').join('/');
  return normalizedPath.startsWith(`${FIXTURE_REPO_ROOT}/`)
    ? normalizedPath.slice(FIXTURE_REPO_ROOT.length + 1)
    : normalizedPath;
}

function createDirEntry(name, type) {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

function createMemoryFingerprintIo(files) {
  function hasFile(repoPath) {
    return Object.prototype.hasOwnProperty.call(files, repoPath);
  }

  function hasDirectory(repoPath) {
    const prefix = repoPath ? `${repoPath}/` : '';
    return Object.keys(files).some((filePath) => filePath.startsWith(prefix) && filePath !== repoPath);
  }

  return {
    exists: (absPath) => {
      const repoPath = toRepoPath(absPath);
      return hasFile(repoPath) || hasDirectory(repoPath);
    },
    isDirectory: (absPath) => hasDirectory(toRepoPath(absPath)),
    isFile: (absPath) => hasFile(toRepoPath(absPath)),
    listDir: (absPath) => {
      const repoPath = toRepoPath(absPath);
      const prefix = repoPath ? `${repoPath}/` : '';
      const entries = new Map();
      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const rest = filePath.slice(prefix.length);
        if (!rest) {
          continue;
        }
        const [name, ...remaining] = rest.split('/');
        entries.set(name, remaining.length > 0 ? 'directory' : 'file');
      }
      return [...entries.entries()].map(([name, type]) => createDirEntry(name, type));
    },
    readFile: (absPath) => Buffer.from(files[toRepoPath(absPath)]),
  };
}

function runFingerprintCase(files) {
  const baselineEnv = {
    API_GATEWAY_PREFIX: '/v1',
    VITE_API_GATEWAY_PREFIX: '/v1',
    VITE_API_GATEWAY_TARGET: 'http://localhost:8000',
  };
  const io = createMemoryFingerprintIo(files);
  const inputs = listFrontendBuildFingerprintInputs(FIXTURE_REPO_ROOT, io);
  const baseline = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, { ...io, env: baselineEnv }).fingerprint;
  const repeat = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, { ...io, env: baselineEnv }).fingerprint;

  files['apps/web-vite/dist/assets/app.js'] = 'changed ignored dist output\n';
  const afterDistChange = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, { ...io, env: baselineEnv }).fingerprint;

  files['apps/web-vite/src/app/page.tsx'] = 'export const page = 2;\n';
  const afterSourceChange = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, { ...io, env: baselineEnv }).fingerprint;

  const afterEnvChange = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, {
    ...io,
    env: {
      ...baselineEnv,
      VITE_API_GATEWAY_PREFIX: '/gateway',
    },
  }).fingerprint;
  const afterDebugEnvChange = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, {
    ...io,
    env: {
      ...baselineEnv,
      VITE_API_DEBUG_LOGS: '1',
    },
  }).fingerprint;

  return {
    afterDebugEnvChange,
    afterDistChange,
    afterEnvChange,
    afterSourceChange,
    baseline,
    inputs,
    repeat,
  };
}

function withFixture(assertion) {
  assertion(runFingerprintCase(createFixtureFiles()));
}

export function runFrontendBuildFingerprintBehaviorFixtures({ assertEqual }) {
  withFixture((result) => {
    const inputs = result.inputs;
    assertEqual(
      inputs.envKeys.includes('API_GATEWAY_PREFIX'),
      true,
      'fingerprint should include legacy API gateway prefix env alias',
    );
    assertEqual(
      inputs.envKeys.includes('SUPER_ADMIN_ACCOUNTS'),
      false,
      'fingerprint should not include server-only admin account env in the frontend bundle boundary',
    );
    assertEqual(
      inputs.envKeys.includes('VITE_SUPER_ADMIN_ACCOUNTS'),
      true,
      'fingerprint should include explicitly public Vite admin account env consumed by frontend code',
    );
    assertEqual(
      inputs.envKeys.includes('VITE_API_DEBUG_LOGS'),
      true,
      'fingerprint should include Vite API debug env consumed by frontend code',
    );
    assertEqual(
      inputs.files.includes('apps/web-vite/src/main.tsx'),
      true,
      'fingerprint should include Vite app source files',
    );
    assertEqual(
      inputs.files.includes('apps/web-vite/src/app/page.tsx'),
      true,
      'fingerprint should include shared frontend source files',
    );
    assertEqual(
      inputs.files.includes('public/home-brand-crop.png'),
      true,
      'fingerprint should include public assets copied into the Vite build',
    );
    assertEqual(
      inputs.files.some((filePath) => filePath.startsWith('apps/web-vite/dist/')),
      false,
      'fingerprint must exclude generated dist files',
    );

    assertEqual(result.repeat, result.baseline, 'fingerprint should be deterministic');
    assertEqual(result.afterDistChange, result.baseline, 'dist output changes should not affect source fingerprint');
    assertEqual(
      result.afterSourceChange === result.baseline,
      false,
      'source file changes should affect fingerprint',
    );
    assertEqual(
      result.afterEnvChange === result.afterSourceChange,
      false,
      'Vite runtime environment changes should affect fingerprint',
    );
    assertEqual(
      result.afterDebugEnvChange === result.baseline,
      false,
      'frontend debug env consumed by source code should affect fingerprint',
    );
  });

  return 'source/config/env inputs are deterministic, dist output is excluded, and source/env changes alter the fingerprint.';
}
