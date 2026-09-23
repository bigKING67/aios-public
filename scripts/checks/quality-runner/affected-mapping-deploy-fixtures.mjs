import {
  DEPLOY_CONFIG_GATES,
  DEPLOY_SCRIPT_CONFIG_GATES,
} from '../../lib/quality/quality-affected-gates.mjs';
import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertDeployAffectedMapping({
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  const deployDockerfile = selectAffectedGates(registry, ['Dockerfile']);
  assertIncludesAll(
    deployDockerfile.names,
    DEPLOY_CONFIG_GATES,
    'Dockerfile should select deploy config gates',
  );
  assertFalse(
    deployDockerfile.names.includes('verify:backend:check'),
    'Dockerfile should not use backend safe fallback',
  );
  assertFalse(
    deployDockerfile.names.includes('verify:frontend:preflight'),
    'Dockerfile should not use frontend preflight safe fallback',
  );

  const deployCompose = selectAffectedGates(registry, ['docker-compose.yml']);
  assertIncludesAll(
    deployCompose.names,
    DEPLOY_CONFIG_GATES,
    'docker-compose.yml should select deploy config gates',
  );
  assertFalse(deployCompose.names.includes('verify:backend:check'), 'docker-compose.yml should not use backend safe fallback');

  const deployProdCompose = selectAffectedGates(registry, ['docker-compose.prod.yml']);
  assertIncludesAll(
    deployProdCompose.names,
    DEPLOY_CONFIG_GATES,
    'docker-compose.prod.yml should select deploy config gates',
  );

  const deployDragonflyCompose = selectAffectedGates(registry, ['docker-compose.dragonfly.yml']);
  assertIncludesAll(
    deployDragonflyCompose.names,
    DEPLOY_CONFIG_GATES,
    'docker-compose.dragonfly.yml should select deploy config gates',
  );

  const deployNginx = selectAffectedGates(registry, ['docker/nginx-vite.conf']);
  assertIncludesAll(
    deployNginx.names,
    DEPLOY_CONFIG_GATES,
    'docker/nginx-vite.conf should select deploy config gates',
  );

  const deployPrefectConfig = selectAffectedGates(registry, ['etl/groland_postgres/prefect.yaml']);
  assertIncludesAll(
    deployPrefectConfig.names,
    DEPLOY_CONFIG_GATES,
    'Prefect project config should select deploy config gates',
  );

  const deployDetectScope = selectAffectedGates(registry, ['scripts/ops/detect-build-scope.sh']);
  assertIncludesAll(
    deployDetectScope.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/ops/detect-build-scope.sh should select deploy config and shell syntax gates',
  );
  assertTrue(
    deployDetectScope.names.includes('verify:shell:syntax'),
    'deploy scope detector should keep shell syntax coverage',
  );

  const deployVpsUp = selectAffectedGates(registry, ['scripts/vps-up.sh']);
  assertIncludesAll(
    deployVpsUp.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/vps-up.sh should select deploy config and shell syntax gates',
  );

  const deployVpsUpImpl = selectAffectedGates(registry, ['scripts/ops/vps-up.sh']);
  assertIncludesAll(
    deployVpsUpImpl.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/ops/vps-up.sh should select deploy config and shell syntax gates',
  );

  const deployMacDeploy = selectAffectedGates(registry, ['scripts/deploy-vps.sh']);
  assertIncludesAll(
    deployMacDeploy.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/deploy-vps.sh should select deploy config and shell syntax gates',
  );

  const deployMacDeployImpl = selectAffectedGates(registry, ['scripts/ops/deploy-vps.sh']);
  assertIncludesAll(
    deployMacDeployImpl.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/ops/deploy-vps.sh should select deploy config and shell syntax gates',
  );

  const deployVpsGitSync = selectAffectedGates(registry, ['scripts/ops/vps-git-sync.sh']);
  assertIncludesAll(
    deployVpsGitSync.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'scripts/ops/vps-git-sync.sh should select deploy config and shell syntax gates',
  );

  const deployVpsPasswordAuth = selectAffectedGates(registry, ['scripts/lib/deploy/vps-password-auth.sh']);
  assertIncludesAll(
    deployVpsPasswordAuth.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'VPS password auth helper should select deploy config and shell syntax gates',
  );

  for (const file of [
    'scripts/lib/deploy/vps-git-state.sh',
    'scripts/lib/deploy/vps-remote-git-sync.sh',
    'scripts/lib/deploy/vps-remote-deploy.sh',
    'scripts/ops/vps-prepush-guard.sh',
    'scripts/ops/vps-hotfix.sh',
    'scripts/ops/integrate-vps-hotfix.sh',
  ]) {
    const selection = selectAffectedGates(registry, [file]);
    assertIncludesAll(
      selection.names,
      DEPLOY_SCRIPT_CONFIG_GATES,
      `${file} should select deploy config and shell syntax gates`,
    );
  }

  const deployLatencySystemd = selectAffectedGates(registry, [
    'scripts/ops/install-dashboard-api-latency-observation-systemd.sh',
  ]);
  assertIncludesAll(
    deployLatencySystemd.names,
    DEPLOY_SCRIPT_CONFIG_GATES,
    'dashboard latency systemd installer should select deploy config and shell syntax gates',
  );

  const deployLatencySystemdBehavior = selectAffectedGates(registry, [
    'scripts/checks/deploy/dashboard-latency-systemd.behavior.mjs',
  ]);
  assertTrue(
    deployLatencySystemdBehavior.names.includes('verify:deploy:dashboard-latency-systemd-behavior'),
    'dashboard latency systemd behavior checker should select itself',
  );

  const deployCheckBehavior = selectAffectedGates(registry, ['scripts/checks/deploy/config.behavior.mjs']);
  assertIncludesAll(
    deployCheckBehavior.names,
    DEPLOY_CONFIG_GATES,
    'deploy behavior checker should select deploy config gates',
  );
  assertTrue(
    deployCheckBehavior.names.includes('verify:quality-runner:registry'),
    'deploy behavior checker should keep quality-runner registry self-check coverage',
  );

  const deployConfigHelper = selectAffectedGates(registry, ['scripts/lib/deploy/deploy-config-core.mjs']);
  assertTrue(deployConfigHelper.names.includes('lint:scripts'), 'deploy config helper should keep script lint coverage');
  assertIncludesAll(
    deployConfigHelper.names,
    DEPLOY_CONFIG_GATES,
    'deploy config helper should select deploy config gates',
  );
  assertFalse(
    deployConfigHelper.names.includes('verify:backend:check'),
    'deploy config helper should not use backend safe fallback',
  );

  const deployConfigBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/deploy/deploy-config-behavior-fixtures.mjs']);
  assertTrue(deployConfigBehaviorFixture.names.includes('lint:scripts'), 'deploy config behavior fixture should keep script lint coverage');
  assertTrue(
    deployConfigBehaviorFixture.names.includes('verify:deploy:config-behavior'),
    'deploy config behavior fixture should select behavior coverage',
  );
  assertFalse(
    deployConfigBehaviorFixture.names.includes('verify:backend:check'),
    'deploy config behavior fixture should not use backend safe fallback',
  );

  for (const file of [
    'scripts/lib/deploy/api-deploy-proof.sh',
    'scripts/lib/deploy/api-deploy-proof-fixtures.mjs',
  ]) {
    const selected = selectAffectedGates(registry, [file]);
    assertTrue(
      selected.names.includes('verify:deploy:config-behavior'),
      `${file} should select API deployment recovery coverage`,
    );
  }

  const sampleInventoryDeployFixture = selectAffectedGates(registry, [
    'scripts/lib/deploy/sample-inventory-public-access-preflight-fixtures.mjs',
  ]);
  assertTrue(
    sampleInventoryDeployFixture.names.includes('verify:deploy:config-behavior'),
    'sample inventory access fixture should select deploy behavior coverage',
  );
  assertFalse(
    sampleInventoryDeployFixture.names.includes('verify:backend:check'),
    'sample inventory access fixture should not use backend safe fallback',
  );

  const vpsGitStateBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/deploy/vps-git-state-behavior-fixtures.mjs']);
  assertTrue(vpsGitStateBehaviorFixture.names.includes('lint:scripts'), 'VPS Git state behavior fixture should keep script lint coverage');
  assertTrue(
    vpsGitStateBehaviorFixture.names.includes('verify:deploy:vps-git-state:smoke'),
    'VPS Git state behavior fixture should select its runtime coverage',
  );
  assertFalse(
    vpsGitStateBehaviorFixture.names.includes('verify:backend:check'),
    'VPS Git state behavior fixture should not use backend safe fallback',
  );
}
