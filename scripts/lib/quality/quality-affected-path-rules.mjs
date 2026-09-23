import {
  FRONTEND_BUILD_ENV_FILES,
} from './quality-gate-inputs.mjs';

export function isReportApiSourceFile(file) {
  return file === 'apps/web-vite/src/lib/api.ts' || file.startsWith('apps/web-vite/src/lib/report-api/');
}

export function isCreatorLibraryFollowLogContractFile(file) {
  return file.startsWith('backend-rust/src/marketing/repository_follow_logs/')
    || file.startsWith('backend-rust/src/schema_compat/creator_library_follow_log/')
    || file === 'etl/groland_postgres/tests/sql/influencer_library_check.sql'
    || (
      file.startsWith('etl/groland_postgres/sql/migrations/')
      && file.includes('influencer_library_follow_log')
    )
    || file === 'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-follow-modal.tsx'
    || file === 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-formatters.ts';
}

export function isCreatorLibraryCsvContractFile(file) {
  return file === 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-csv.ts'
    || file === 'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts'
    || file === 'backend-rust/src/marketing/types/constants.rs'
    || file === 'backend-rust/src/marketing/handlers/mod.rs'
    || file === 'backend-rust/src/marketing/handlers/import_export/import.rs'
    || file === 'backend-rust/src/marketing/handlers/import_export/xlsx.rs'
    || file.startsWith('backend-rust/src/marketing/creator_library_xlsx/')
    || file === 'backend-rust/src/marketing/template_xlsx/constants.rs'
    || file === 'backend-rust/src/marketing/template_xlsx/help_sheet.rs'
    || file === 'backend-rust/src/marketing/template_xlsx/template_sheet.rs';
}

export function isFrontendBuildEnvFile(file) {
  return FRONTEND_BUILD_ENV_FILES.includes(file);
}

export function isPostcssConfigFile(file) {
  return file === 'postcss.config.js'
    || file === 'postcss.config.cjs'
    || file === 'postcss.config.mjs'
    || file === 'postcss.config.ts';
}

export function isViteConfigFile(file) {
  return file === 'vite.config.js'
    || file === 'vite.config.cjs'
    || file === 'vite.config.mjs'
    || file === 'vite.config.ts'
    || /^apps\/[^/]+\/vite\.config\.(?:cjs|js|mjs|ts)$/u.test(file);
}

export function isTypedViteConfigFile(file) {
  return file === 'vite.config.ts' || /^apps\/[^/]+\/vite\.config\.ts$/u.test(file);
}

export function isFrontendHtmlBuildInputFile(file) {
  return file === 'apps/web-vite/index.html';
}

export function isDeployConfigFile(file) {
  return file === 'etl/groland_postgres/prefect.yaml'
    || file === '.env.vps.example'
    || file === 'Dockerfile'
    || file === 'Dockerfile.vite'
    || file === 'docker/nginx-vite.conf'
    || /^docker-compose(?:\.[^.]+)?\.ya?ml$/u.test(file);
}

export function isDeployScriptConfigFile(file) {
  return file === 'scripts/ops/detect-build-scope.sh'
    || file === 'scripts/ops/vps-up.sh'
    || file === 'scripts/ops/deploy-vps.sh'
    || file === 'scripts/ops/vps-git-sync.sh'
    || file === 'scripts/ops/vps-prepush-guard.sh'
    || file === 'scripts/ops/vps-hotfix.sh'
    || file === 'scripts/ops/vps-hotfix-audit.sh'
    || file === 'scripts/ops/integrate-vps-hotfix.sh'
    || file === 'scripts/ops/trellis-host-init.sh'
    || file === 'scripts/ops/install-dashboard-api-latency-observation-systemd.sh'
    || /^scripts\/lib\/deploy\/.*\.sh$/u.test(file)
    || file === 'scripts/vps-up.sh'
    || file === 'scripts/deploy-vps.sh';
}
