import path from 'node:path';
import { defineConfig } from 'vitest/config';

const projectRoot = path.resolve(__dirname, '../..');
const browserSessionTests = [
  'apps/web-vite/src/test/request-client.test.ts',
  'apps/web-vite/src/test/request-client-compatibility.test.ts',
];
const domLogicTests = [
  'apps/web-vite/src/lib/echarts/lean-tooltip.test.ts',
  'apps/web-vite/src/components/organisms/layout-mobile-navigation.test.ts',
];
const setupFiles = ['apps/web-vite/src/test/setup.ts'];

export default defineConfig({
  resolve: {
    alias: [
      // The published ESM entry retains named exports when prebundling the icon barrel.
      { find: /^@ant-design\/icons$/, replacement: path.resolve(projectRoot, 'node_modules/@ant-design/icons/es/index.js') },
      { find: '@', replacement: path.resolve(projectRoot, 'apps/web-vite/src') },
    ],
  },
  test: {
    pool: process.platform === 'linux' ? 'threads' : 'forks',
    isolate: true,
    // Two workers avoid CPU oversubscription on the private Linux CI runner.
    maxWorkers: process.platform === 'linux' ? 2 : 4,
    projects: [
      {
        extends: true,
        test: {
          name: 'runtime-isolation',
          environment: 'happy-dom',
          maxWorkers: 1,
          include: ['apps/web-vite/src/test/runtime-isolation/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: ['apps/web-vite/src/**/*.{test,spec}.ts'],
          exclude: [...browserSessionTests, ...domLogicTests, 'apps/web-vite/src/test/runtime-isolation/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser-session',
          environment: 'jsdom',
          include: browserSessionTests,
          setupFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'happy-dom',
          include: ['apps/web-vite/src/**/*.{test,spec}.tsx', ...domLogicTests],
          setupFiles,
          deps: { optimizer: { client: { enabled: true, include: ['antd', '@ant-design/icons'] } } },
        },
      },
    ],
  },
});
