import {
  BACKEND_TOOLCHAIN_CONFIG_GATES,
  CI_META_GATES,
  DESIGN_AUTHORITY_TOKEN_GATES,
  DESIGN_TOKEN_CONFIG_GATES,
  QUALITY_RUNNER_CACHE_EXECUTION_GATES,
  QUALITY_RUNNER_HOOK_GATES,
  QUALITY_RUNNER_REGISTRY_GATES,
  QUALITY_RUNNER_SCHEDULER_GATES,
  TAILWIND_CONFIG_GATES,
} from './quality-affected-gates.mjs';
import {
  TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';

function rule(gates, reason) {
  return {
    gates,
    reason,
  };
}

export function repoConfigAffectedRule(file) {
  if (file === 'tailwind.config.ts' || file === 'tailwind.config.js' || file.startsWith('tailwind.config.')) {
    return rule(TAILWIND_CONFIG_GATES, `${file}: Tailwind config token surface`);
  }

  if (file === 'scripts/config/design/token-color-sync.config.json') {
    return rule(DESIGN_TOKEN_CONFIG_GATES, `${file}: design token sync coverage config`);
  }

  if (file === 'DESIGN_TOKENS.json') {
    return rule(DESIGN_AUTHORITY_TOKEN_GATES, `${file}: design token authority source`);
  }

  if (file === 'rust-toolchain.toml') {
    return rule(BACKEND_TOOLCHAIN_CONFIG_GATES, `${file}: Rust toolchain config`);
  }

  if (file === 'scripts/config/quality/quality-gates.mjs') {
    return rule(
      [...CI_META_GATES, ...QUALITY_RUNNER_REGISTRY_GATES],
      `${file}: canonical quality gate descriptor`,
    );
  }

  if (file === 'scripts/config/security/dependency-audit-exceptions.json') {
    return rule(
      [
        'verify:ci:dependency-audit-behavior',
        'audit:dependencies:npm',
        'audit:dependencies:rust',
      ],
      `${file}: shared dependency audit policy`,
    );
  }

  if (file === '.gitignore') {
    return rule([...CI_META_GATES, 'verify:shell:syntax'], `${file}: repository ignore contract change`);
  }

  if (file === '.trellis/config.yaml') {
    return rule(TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES, `${file}: Trellis finish-work auto-commit contract`);
  }

  if (file === 'eslint.config.mjs' || file === 'eslint.config.js' || file === 'eslint.config.cjs') {
    return rule(
      ['lint', 'lint:scripts', ...CI_META_GATES, ...QUALITY_RUNNER_REGISTRY_GATES],
      `${file}: ESLint config changes affect all lint surfaces`,
    );
  }

  if (file === '.github/workflows/quality-gate.yml') {
    return rule(
      [...CI_META_GATES, ...QUALITY_RUNNER_CACHE_EXECUTION_GATES, ...QUALITY_RUNNER_SCHEDULER_GATES, 'verify:shell:syntax'],
      `${file}: quality workflow cache/scheduler contract change`,
    );
  }

  if (file.startsWith('.github/') || file.startsWith('.githooks/')) {
    return rule([...CI_META_GATES, ...QUALITY_RUNNER_HOOK_GATES, 'verify:shell:syntax'], `${file}: CI/hook contract change`);
  }

  return null;
}
