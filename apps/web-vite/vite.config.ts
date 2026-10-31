import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
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
  // lobe-ui, Base UI, motion and lucide are not grouped: the import graph keeps what the first
  // screen uses in the initial chunks and lets each route chunk carry the components it renders.
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

// Mirrors backend AIOS_MODULE_PROFILE; an unknown value fails the build instead of
// silently shipping every module. Without a value, `vite build` (local and CI, which
// the bundle budget measures) targets the deployed AI 创作中心 profile and the dev
// server keeps every module; build the groland modules with
// VITE_AIOS_MODULE_PROFILE=full. Docker builds always pass the value explicitly.
function resolveModuleProfile(rawProfile: string | undefined, command: 'build' | 'serve'): 'full' | 'ai_studio' {
  const profile = (rawProfile || '').trim() || (command === 'build' ? 'ai_studio' : 'full');
  if (profile !== 'full' && profile !== 'ai_studio') {
    throw new Error(`VITE_AIOS_MODULE_PROFILE must be full or ai_studio; got ${profile}`);
  }
  return profile;
}

function resolveApplicationStyleChunk(id: string): string | null {
  const normalizedId = id.split(path.sep).join('/');
  if (!normalizedId.endsWith('.css')) {
    return null;
  }
  // The precompiled lobe-ui stylesheet is measured by its own budget (vendorLobeUiCssGzipBytes).
  if (normalizedId.includes('/node_modules/@lobehub/ui/')) {
    return 'vendor-lobe-ui';
  }
  if (normalizedId.includes('/node_modules/')) {
    return null;
  }

  if (normalizedId.includes('/app/reports/special/')) {
    return 'styles-special-report';
  }
  // Keep CSS module maps with their consuming route so unused keys can be
  // eliminated. A forced shared JS chunk retains every exported class map.
  if (normalizedId.includes('/app/marketing/content-assets/')) {
    return null;
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
  // AI 创作中心 is a lazy workbench: one stylesheet loaded with its routes, not the shared shell.
  if (normalizedId.includes('/app/content/ai-studio/')) {
    return 'styles-ai-studio';
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
  // Public candidate pages load alone; keep their styles out of the shared shell.
  if (normalizedId.includes('/app/join/')) {
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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const apiGatewayPrefix = resolveGatewayPrefix(env.VITE_API_GATEWAY_PREFIX || '/v1');
  const moduleProfile = resolveModuleProfile(env.VITE_AIOS_MODULE_PROFILE, command);
  const apiGatewayTarget = (env.VITE_API_GATEWAY_TARGET || 'http://localhost:8000')
    .trim()
    .replace(/\/+$/, '');
  const bundleModuleReportPlugin = createBundleModuleReportPlugin(
    process.env.AIOS_BUNDLE_MODULE_REPORT_PATH,
  );

  return {
    root: __dirname,
    publicDir: path.resolve(projectRoot, 'public'),
    plugins: [react(), tailwindcss(), bundleModuleReportPlugin].filter((plugin) => plugin !== null),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    define: {
      // A literal of its own so `routes.tsx` can drop groland chunks from ai_studio builds.
      'process.env.VITE_AIOS_MODULE_PROFILE': JSON.stringify(moduleProfile),
      'process.env': {
        NODE_ENV: mode === 'production' ? 'production' : 'development',
        VITE_API_GATEWAY_PREFIX: apiGatewayPrefix,
        API_GATEWAY_PREFIX: apiGatewayPrefix,
        VITE_API_GATEWAY_TARGET: env.VITE_API_GATEWAY_TARGET || 'http://localhost:8000',
        VITE_REPORT_API: env.VITE_REPORT_API || 'http://localhost:8000/v1',
        VITE_API_URL: env.VITE_API_URL || 'http://localhost:8000/v1',
        VITE_SUPER_ADMIN_ACCOUNTS: env.VITE_SUPER_ADMIN_ACCOUNTS || '',
        VITE_DASHBOARD_MAX_QUERY_DAYS: env.VITE_DASHBOARD_MAX_QUERY_DAYS || '',
        VITE_FORCE_FRESH_DATA: env.VITE_FORCE_FRESH_DATA || '0',
        VITE_API_DEBUG_LOGS: env.VITE_API_DEBUG_LOGS || '0',
        VITE_AIOS_MODULE_PROFILE: moduleProfile,
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
                // React, router and query always load together on the first screen; route-only
                // modules stay lazy.
                test: (id) => resolveVendorChunk(id) === 'vendor-react-query',
                tags: ['$initial'],
                priority: 90,
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
