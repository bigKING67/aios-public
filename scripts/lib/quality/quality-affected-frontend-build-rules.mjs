import {
  FRONTEND_BUILD_CONFIG_GATES,
  FRONTEND_BUILD_ENV_FILE_GATES,
  FRONTEND_BUNDLE_BUDGET_CONFIG_GATES,
  FRONTEND_COVERAGE_RATCHET_CONFIG_GATES,
  FRONTEND_PUBLIC_ASSET_GATES,
  FRONTEND_SMOKE_CONFIG_GATES,
  FRONTEND_TYPED_BUILD_CONFIG_GATES,
} from './quality-affected-gates.mjs';
import {
  isFrontendBuildEnvFile,
  isFrontendHtmlBuildInputFile,
  isPostcssConfigFile,
  isTypedViteConfigFile,
  isViteConfigFile,
} from './quality-affected-path-rules.mjs';

function rule(gates, reason) {
  return {
    gates,
    reason,
  };
}

export function frontendBuildAffectedRule(file) {
  if (isFrontendBuildEnvFile(file)) {
    return rule(FRONTEND_BUILD_ENV_FILE_GATES, `${file}: frontend build env file can affect Vite production output`);
  }

  if (isPostcssConfigFile(file)) {
    return rule(FRONTEND_BUILD_CONFIG_GATES, `${file}: PostCSS config can affect Vite production CSS output`);
  }

  if (isViteConfigFile(file)) {
    return rule(
      isTypedViteConfigFile(file) ? FRONTEND_TYPED_BUILD_CONFIG_GATES : FRONTEND_BUILD_CONFIG_GATES,
      `${file}: Vite config can affect production build output${isTypedViteConfigFile(file) ? ' and TypeScript config validity' : ''}`,
    );
  }

  if (isFrontendHtmlBuildInputFile(file)) {
    return rule(FRONTEND_BUILD_CONFIG_GATES, `${file}: Vite HTML entry can affect production build output`);
  }

  if (file === 'scripts/config/frontend/bundle-budget.json') {
    return rule(FRONTEND_BUNDLE_BUDGET_CONFIG_GATES, `${file}: frontend bundle budget policy config`);
  }

  if (file === 'scripts/config/frontend/coverage-ratchet.json') {
    return rule(FRONTEND_COVERAGE_RATCHET_CONFIG_GATES, `${file}: frontend coverage ratchet policy config`);
  }

  if (file === 'scripts/config/frontend/smoke-routes.json') {
    return rule(FRONTEND_SMOKE_CONFIG_GATES, `${file}: frontend smoke route expectation config`);
  }

  if (file.startsWith('public/')) {
    return rule(FRONTEND_PUBLIC_ASSET_GATES, `${file}: public frontend asset can affect Vite build output`);
  }

  return null;
}
