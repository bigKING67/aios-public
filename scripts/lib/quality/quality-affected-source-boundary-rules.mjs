import {
  BACKEND_GATES,
  CI_META_GATES,
  FRONTEND_CORE_SOURCE_GATES,
  FRONTEND_EXECUTION_COVERAGE_GATES,
  FRONTEND_REGISTRY_GATES,
  REPORT_API_SOURCE_GATES,
} from './quality-affected-gates.mjs';
import {
  isReportApiSourceFile,
} from './quality-affected-path-rules.mjs';
import {
  isSourceSizeGovernedPath,
  SOURCE_SIZE_GOVERNANCE_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';

function rule(gates, reason, continueSelection = true) {
  return {
    continueSelection,
    gates,
    reason,
  };
}

export function sourceSizeGovernanceAffectedRule(file) {
  if (!isSourceSizeGovernedPath(file)) {
    return null;
  }

  return rule(
    SOURCE_SIZE_GOVERNANCE_GATE_NAMES,
    `${file}: cross-language source-size governance impact`,
    false,
  );
}

export function sourceBoundaryAffectedRule(file) {
  if (file === 'tsconfig.json' || file.startsWith('tsconfig.') || file.startsWith('apps/web-vite/tsconfig')) {
    return rule(
      [
        ...FRONTEND_CORE_SOURCE_GATES,
        ...FRONTEND_EXECUTION_COVERAGE_GATES,
        ...FRONTEND_REGISTRY_GATES,
        ...CI_META_GATES,
      ],
      `${file}: TypeScript project boundary/config change`,
    );
  }

  if (isReportApiSourceFile(file)) {
    return rule(
      [...FRONTEND_CORE_SOURCE_GATES, ...FRONTEND_EXECUTION_COVERAGE_GATES, ...REPORT_API_SOURCE_GATES],
      `${file}: report API client facade contract change`,
    );
  }

  if (file.startsWith('backend-rust/scripts/') && /\.(?:cjs|js|mjs)$/u.test(file)) {
    return rule(['lint:scripts'], `${file}: backend JavaScript script lint surface`, false);
  }

  if (file.startsWith('backend-rust/')) {
    return rule(BACKEND_GATES, `${file}: backend source/config change`);
  }

  if (file.startsWith('etl/') || (!file.startsWith('apps/web-vite/src/') && file.includes('dataops')) || file.endsWith('.sql')) {
    return {
      continueSelection: true,
      entries: [
        rule(BACKEND_GATES, `${file}: dataops/etl/schema change`),
        rule(['verify:dataops-config:sync'], `${file}: dataops config drift risk`),
      ],
    };
  }

  return null;
}
