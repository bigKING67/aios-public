import {
  DEPLOY_CONFIG_GATES,
  DEPLOY_SCRIPT_CONFIG_GATES,
} from './quality-affected-gates.mjs';
import {
  BACKEND_CARGO_GOVERNANCE_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';
import {
  isDeployConfigFile,
  isDeployScriptConfigFile,
} from './quality-affected-path-rules.mjs';

export function deployAffectedRule(file) {
  if (file === 'scripts/build/prepare-docker-dependencies.mjs') {
    return {
      gates: [...DEPLOY_SCRIPT_CONFIG_GATES, 'verify:frontend:docker-dependency-cache-behavior'],
      reason: `${file}: frontend Docker dependency preparation`,
    };
  }
  if (isDeployConfigFile(file)) {
    return {
      gates: [
        ...DEPLOY_CONFIG_GATES,
        ...(file === 'Dockerfile.vite' ? ['verify:frontend:docker-dependency-cache-behavior'] : []),
      ],
      reason: `${file}: deploy/container config`,
    };
  }

  if (isDeployScriptConfigFile(file)) {
    return {
      gates: [
        ...DEPLOY_SCRIPT_CONFIG_GATES,
        ...(file === 'scripts/lib/deploy/aios-service-processes.sh'
          ? BACKEND_CARGO_GOVERNANCE_GATE_NAMES
          : []),
      ],
      reason: `${file}: deploy/container script config`,
    };
  }

  return null;
}
