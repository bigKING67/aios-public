import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createBundleModuleReportPlugin } from '../../scripts/build/vite-bundle-module-report';
import { resolveCssModulesOptions } from '../../scripts/build/vite-css-module-scoped-name';

const projectRoot = path.resolve(__dirname, '../..');

function resolveNodeModulePackage(id: string): string | null {
  const marker = 'node_modules/';
  const start = id.lastIndexOf(marker);
  if (start === -1) {
    return null;
  }

  const relative = id.slice(start + marker.length);
  const segments = relative.split('/');
  if (!segments.length) {
    return null;
  }

  if (segments[0].startsWith('@') && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

function resolveAntdFamilyChunk(id: string): string | null {
  const normalizedId = id.split(path.sep).join('/');
  const antdMatch = normalizedId.match(/\/node_modules\/antd\/es\/([^/]+)/);
  if (antdMatch) {
    const component = antdMatch[1];
    if (['_util', 'app', 'config-provider', 'locale', 'style', 'theme', 'version'].includes(component)) {
      return 'vendor-antd-lazy-core';
    }
    if (['cascader', 'checkbox', 'date-picker', 'form', 'input', 'input-number', 'radio', 'select', 'switch', 'upload'].includes(component)) {
      return 'vendor-antd-lazy-input';
    }
    if (['descriptions', 'list', 'pagination', 'table', 'tree'].includes(component)) {
      return 'vendor-antd-lazy-data';
    }
    if (['anchor', 'breadcrumb', 'dropdown', 'menu', 'segmented', 'steps', 'tabs'].includes(component)) {
      return 'vendor-antd-lazy-navigation';
    }
    if (['drawer', 'message', 'modal', 'notification', 'popconfirm', 'popover', 'tooltip'].includes(component)) {
      return 'vendor-antd-lazy-overlay';
    }
    return 'vendor-antd-lazy-display';
  }

  const packageName = resolveNodeModulePackage(normalizedId);
  if (!packageName) {
    return null;
  }
  if (packageName.startsWith('@ant-design/')) {
    return 'vendor-antd-lazy-core';
  }
  if (['@rc-component/cascader', '@rc-component/form', '@rc-component/input', '@rc-component/input-number', '@rc-component/picker', '@rc-component/select', '@rc-component/switch', '@rc-component/textarea', '@rc-component/upload', '@rc-component/async-validator', '@rc-component/mini-decimal'].includes(packageName)) {
    return 'vendor-antd-lazy-input';
  }
  if (['@rc-component/pagination', '@rc-component/table', '@rc-component/tree', '@rc-component/virtual-list'].includes(packageName)) {
    return 'vendor-antd-lazy-data';
  }
  if (['@rc-component/dropdown', '@rc-component/menu', '@rc-component/overflow', '@rc-component/segmented', '@rc-component/tabs'].includes(packageName)) {
    return 'vendor-antd-lazy-navigation';
  }
  if (['@rc-component/dialog', '@rc-component/drawer', '@rc-component/notification', '@rc-component/portal', '@rc-component/tooltip', '@rc-component/trigger'].includes(packageName)) {
    return 'vendor-antd-lazy-overlay';
  }
  if (packageName.startsWith('@rc-component/')) {
    return 'vendor-antd-lazy-core';
  }
  return null;
}

function resolveVendorChunk(id: string): string | null {
  const pkg = resolveNodeModulePackage(id);
  if (!pkg) {
    return null;
  }
  if (pkg === 'echarts') {
    return 'vendor-echarts';
  }
  if (pkg === 'zrender') {
    return 'vendor-zrender';
  }
  if (
    pkg === 'react-markdown'
    || pkg === 'react-syntax-highlighter'
    || pkg === 'remark-gfm'
    || pkg.startsWith('remark-')
    || pkg.startsWith('rehype-')
    || pkg.startsWith('micromark')
    || pkg.startsWith('mdast-')
    || pkg.startsWith('hast-')
  ) {
    return 'vendor-markdown';
  }
  if (pkg.startsWith('@tanstack/')) {
    return 'vendor-react-query';
  }
  if (
    pkg === 'react'
    || pkg === 'react-dom'
    || pkg === 'react-router'
    || pkg === 'react-router-dom'
    || pkg === 'scheduler'
  ) {
    return 'vendor-react-query';
  }
  return null;
}

function resolveGatewayPrefix(rawPrefix: string): string {
  const trimmed = (rawPrefix || '').trim();
  if (!trimmed) {
    return '/v1';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');
  return withoutTrailingSlash || '/v1';
}

function resolveApplicationStyleChunk(id: string): string | null {
  const normalizedId = id.split(path.sep).join('/');
  if (!normalizedId.endsWith('.css') || normalizedId.includes('/node_modules/')) {
    return null;
  }

  if (normalizedId.includes('/app/reports/special/')) {
    return 'styles-special-report';
  }
  if (normalizedId.includes('/app/marketing/content-assets/_components/content-assets-inspector')) {
    return 'styles-content-assets-inspector';
  }
  if (normalizedId.includes('/app/marketing/content-assets/')) {
    return 'styles-content-assets';
  }
  if (normalizedId.includes('/app/dashboard/creator/')) {
    return null;
  }
  if (normalizedId.includes('/app/dashboard/industry-material-inspiration/')) {
    return null;
  }
  if (normalizedId.includes('/app/dashboard/')) {
    return normalizedId.includes('qianchuan') || normalizedId.includes('live-')
      ? 'styles-operations'
      : 'styles-dashboard-core';
  }
  if (normalizedId.includes('/app/content/live-center/')) {
    return 'styles-live-center';
  }
  if (normalizedId.includes('/app/reports/')) {
    return null;
  }
  if (normalizedId.includes('/app/marketing/')) {
    return null;
  }
  if (normalizedId.includes('/app/admin/')) {
    return 'styles-admin';
  }
  if (normalizedId.includes('/app/ops/')) {
    return 'styles-operations';
  }
  if (normalizedId.includes('/app/docs/')) {
    return null;
  }
  if (normalizedId.includes('/components/')) {
    return 'styles-shared-shell';
  }
  if (normalizedId.includes('/styles/') || normalizedId.includes('/theme/')) {
    return 'styles-foundation';
  }
  if (normalizedId.includes('/app/')) {
    return 'styles-shared-shell';
  }

  return null;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const apiGatewayPrefix = resolveGatewayPrefix(env.VITE_API_GATEWAY_PREFIX || '/v1');
  const apiGatewayTarget = (env.VITE_API_GATEWAY_TARGET || 'http://localhost:8000')
    .trim()
    .replace(/\/+$/, '');
  const bundleModuleReportPlugin = createBundleModuleReportPlugin(
    process.env.AIOS_BUNDLE_MODULE_REPORT_PATH,
  );

  return {
    root: __dirname,
    publicDir: path.resolve(projectRoot, 'public'),
    plugins: [react(), bundleModuleReportPlugin].filter((plugin) => plugin !== null),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    define: {
      'process.env': {
        NODE_ENV: mode === 'production' ? 'production' : 'development',
        VITE_API_GATEWAY_PREFIX: apiGatewayPrefix,
        API_GATEWAY_PREFIX: apiGatewayPrefix,
        VITE_API_GATEWAY_TARGET: env.VITE_API_GATEWAY_TARGET || 'http://localhost:8000',
        VITE_REPORT_API: env.VITE_REPORT_API || 'http://localhost:8000/v1',
        VITE_API_URL: env.VITE_API_URL || 'http://localhost:8000/v1',
        VITE_SAMPLE_INVENTORY_ACCESS_MODE:
          env.VITE_SAMPLE_INVENTORY_ACCESS_MODE || 'authenticated',
        VITE_SUPER_ADMIN_ACCOUNTS: env.VITE_SUPER_ADMIN_ACCOUNTS || '',
        VITE_DASHBOARD_MAX_QUERY_DAYS: env.VITE_DASHBOARD_MAX_QUERY_DAYS || '',
        VITE_FORCE_FRESH_DATA: env.VITE_FORCE_FRESH_DATA || '0',
        VITE_API_DEBUG_LOGS: env.VITE_API_DEBUG_LOGS || '0',
        AIOS_ACCESS_COOKIE_NAME: env.AIOS_ACCESS_COOKIE_NAME || '',
        AIOS_REFRESH_COOKIE_NAME: env.AIOS_REFRESH_COOKIE_NAME || '',
      },
    },
    css: mode === 'production'
      ? {
          modules: resolveCssModulesOptions(mode, projectRoot),
        }
      : undefined,
    server: {
      host: '0.0.0.0',
      port: Number.parseInt(env.VITE_PORT || '3000', 10),
      strictPort: true,
      proxy: {
        [apiGatewayPrefix]: {
          target: apiGatewayTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: Number.parseInt(env.VITE_PREVIEW_PORT || '4173', 10),
      strictPort: true,
      proxy: {
        [apiGatewayPrefix]: {
          target: apiGatewayTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          passes: 4,
        },
        format: {
          comments: false,
        },
        module: true,
      },
      cssMinify: 'lightningcss',
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: (id) => resolveApplicationStyleChunk(id),
                priority: 100,
              },
              {
                name: 'vendor-ui-initial',
                test: (id) => resolveAntdFamilyChunk(id) !== null,
                tags: ['$initial'],
                priority: 90,
              },
              {
                name: (id) => resolveAntdFamilyChunk(id),
                priority: 80,
              },
              {
                name: (id) => resolveVendorChunk(id),
                priority: 70,
              },
            ],
          },
        },
      },
    },
  };
});
