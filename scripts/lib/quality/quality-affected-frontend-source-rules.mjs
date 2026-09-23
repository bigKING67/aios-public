import {
  APP_SOURCE_GATES,
  AUTH_POLICY_SOURCE_GATES,
  COMPONENT_SOURCE_GATES,
  CSS_MODULE_SOURCE_GATES,
  CREATOR_SHORT_VIDEO_DASHBOARD_GATES,
  DASHBOARD_DATE_RANGE_GATES,
  FRONTEND_CORE_SOURCE_GATES,
  FRONTEND_EXECUTION_COVERAGE_GATES,
  FRONTEND_HYGIENE_GATES,
  FRONTEND_REGISTRY_GATES,
  REPO_NAMING_GATES,
  ROUTE_POLICY_SOURCE_GATES,
  SPECIAL_REPORT_SMOKE_GATES,
  STYLE_SOURCE_GATES,
  THEME_TOKEN_SOURCE_GATES,
} from './quality-affected-gates.mjs';
import {
  isRepoNamingEnforcedPath,
} from '../repo/repo-governance-gates.mjs';
import {
  isSpecialReportSmokeSourceFile,
} from '../reports/special-report-smoke-gate.mjs';
import {
  addNames,
} from './quality-affected-selection-utils.mjs';

function isAuthPolicySourceFile(file) {
  return file.startsWith('apps/web-vite/src/lib/auth')
    || file.startsWith('apps/web-vite/src/lib/report-permissions')
    || file.includes('Auth')
    || file.includes('auth')
    || file.includes('permission');
}

function isRoutePolicySourceFile(file) {
  return file.startsWith('apps/web-vite/src/lib/route')
    || file.includes('navigation')
    || file.includes('Navigation')
    || file.includes('route')
    || file.includes('Route');
}

function isThemeTokenSourceFile(file) {
  return file.startsWith('apps/web-vite/src/theme/')
    || file === 'apps/web-vite/src/styles/design-tokens.css'
    || file.startsWith('apps/web-vite/src/lib/design-token')
    || file === 'apps/web-vite/src/lib/platform-colors.ts';
}

function isCreatorShortVideoDashboardSourceFile(file) {
  return file === 'apps/web-vite/src/app/dashboard/creator/short-video/page.tsx'
    || file === 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-dashboard-client.tsx'
    || file.startsWith('apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-')
    || file === 'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard.module.css'
    || file === 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard.module.css'
    || file === 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-metrics.module.css';
}

function isDashboardDateRangeSourceFile(file) {
  return file === 'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-resolvers.ts';
}

export function applyFrontendSourceAffectedRule(selected, file, weekly) {
  addNames(selected, FRONTEND_CORE_SOURCE_GATES, `${file}: frontend source can affect lint/type/build`);
  if (/\.[cm]?[jt]sx?$/u.test(file)) {
    addNames(selected, FRONTEND_EXECUTION_COVERAGE_GATES, `${file}: frontend executable source can affect coverage ratchets`);
  }
  addNames(selected, FRONTEND_REGISTRY_GATES, `${file}: frontend registry contract impact`);
  addNames(selected, FRONTEND_HYGIENE_GATES, `${file}: frontend hygiene source impact`);

  if (isRepoNamingEnforcedPath(file)) {
    addNames(selected, REPO_NAMING_GATES, `${file}: migrated repository naming contract impact`);
  }

  if (file.startsWith('apps/web-vite/src/app/')) {
    addNames(selected, APP_SOURCE_GATES, `${file}: app route source impact`);
    if (/\.(?:jsx|tsx)$/u.test(file)) {
      addNames(selected, ['verify:components:size'], `${file}: app TSX/JSX component size impact`);
    }
  }

  if (file.startsWith('apps/web-vite/src/components/')) {
    addNames(selected, COMPONENT_SOURCE_GATES, `${file}: shared component source impact`);
  }

  if (isAuthPolicySourceFile(file)) {
    addNames(selected, AUTH_POLICY_SOURCE_GATES, `${file}: auth/permission source impact`);
  }

  if (isRoutePolicySourceFile(file)) {
    addNames(selected, ROUTE_POLICY_SOURCE_GATES, `${file}: route policy source impact`);
  }

  if (file.includes('/weekly/') || file.includes('/Weekly') || file.includes('weekly')) {
    addNames(selected, weekly, `${file}: weekly source impact`);
  }

  if (isSpecialReportSmokeSourceFile(file)) {
    addNames(selected, SPECIAL_REPORT_SMOKE_GATES, `${file}: special report smoke impact`);
  }

  if (isCreatorShortVideoDashboardSourceFile(file)) {
    addNames(selected, CREATOR_SHORT_VIDEO_DASHBOARD_GATES, `${file}: creator short video dashboard behavior impact`);
  }

  if (isDashboardDateRangeSourceFile(file)) {
    addNames(selected, DASHBOARD_DATE_RANGE_GATES, `${file}: dashboard date range behavior impact`);
  }

  if (file.endsWith('.module.css')) {
    addNames(selected, CSS_MODULE_SOURCE_GATES, `${file}: CSS Module style/design token impact`);
  } else if (file.endsWith('.css')) {
    addNames(selected, STYLE_SOURCE_GATES, `${file}: global style/design token impact`);
  }

  if (isThemeTokenSourceFile(file)) {
    addNames(selected, THEME_TOKEN_SOURCE_GATES, `${file}: runtime theme/token source impact`);
  }
}

export function applyFrontendSourceAffectedRuleForFile(selected, file, weekly) {
  if (!file.startsWith('apps/web-vite/src/') && !file.startsWith('apps/web-vite/')) {
    return false;
  }

  applyFrontendSourceAffectedRule(selected, file, weekly);
  return true;
}
