export function assertRegistryDeployInputs({ assertTrue, registry }) {
  for (const [input, description] of [
    ['Dockerfile', 'legacy web Dockerfile'],
    ['Dockerfile.vite', 'Vite web Dockerfile'],
    ['docker-compose*.yml', 'compose config files'],
    ['docker/nginx-vite.conf', 'nginx static runner config'],
    ['scripts/ops/detect-build-scope.sh', 'build-scope detector'],
    ['scripts/ops/vps-up.sh', 'VPS compose deploy implementation'],
    ['scripts/ops/deploy-vps.sh', 'Mac-to-VPS deploy implementation'],
    [
      'scripts/ops/install-dashboard-api-latency-observation-systemd.sh',
      'dashboard latency systemd installer',
    ],
    ['scripts/vps-up.sh', 'VPS compose deploy wrapper'],
    ['scripts/deploy-vps.sh', 'Mac-to-VPS deploy wrapper'],
    ['.env.example', 'env example deploy defaults'],
    ['.env.vps.example', 'VPS sample inventory access defaults'],
    ['scripts/config/deploy/vps.local.env.example', 'VPS local deploy env example'],
    ['scripts/dataops/check-dataops-runtime-postgres.sh', 'host PostgreSQL SQL check helper'],
  ]) {
    assertTrue(
      registry.byName.get('verify:deploy:config')?.inputs.includes(input),
      `deploy config gate cache key should include ${description}`,
    );
  }

  for (const [input, description] of [
    ['scripts/checks/deploy/config.mjs', 'paired deploy config production checker'],
    ['scripts/checks/deploy/config.behavior.mjs', 'its own behavior checker'],
    ['scripts/lib/deploy/deploy-config-behavior-fixtures.mjs', 'split behavior fixtures'],
    ['scripts/lib/deploy/api-deploy-proof-fixtures.mjs', 'API recovery fixtures'],
    ['scripts/lib/deploy/api-deploy-proof.sh', 'API recovery implementation'],
    [
      'scripts/lib/deploy/sample-inventory-public-access-preflight-fixtures.mjs',
      'sample inventory access fixtures',
    ],
  ]) {
    assertTrue(
      registry.byName.get('verify:deploy:config-behavior')?.inputs.includes(input),
      `deploy config behavior gate cache key should include ${description}`,
    );
  }

  assertTrue(
    registry.byName.get('verify:deploy:vps-git-state:smoke')?.inputs.includes('scripts/lib/deploy/vps-git-state-behavior-fixtures.mjs'),
    'VPS Git state smoke cache key should include its runtime fixtures',
  );
  assertTrue(
    registry.byName.get('verify:deploy:vps-git-state:smoke')?.inputs.includes('scripts/ops/vps-hotfix.sh'),
    'VPS Git state smoke cache key should include the hotfix lifecycle script',
  );
  for (const gateName of [
    'verify:deploy:config',
    'verify:deploy:config-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/deploy/deploy-config-core.mjs'),
      `${gateName} cache key should include split deploy config helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:deploy:config')?.modes.includes('quick'),
    'deploy config gate should participate in quick/prepush profiles',
  );
  assertTrue(
    registry.byName.get('verify:deploy:config-behavior')?.modes.includes('quick'),
    'deploy config behavior gate should participate in quick/prepush profiles',
  );
  assertTrue(
    registry.byName.get('verify:deploy:config')?.modes.includes('ci'),
    'deploy config gate should participate in full ci profile',
  );
  assertTrue(
    registry.byName.get('verify:deploy:config-behavior')?.modes.includes('ci'),
    'deploy config behavior gate should participate in full ci profile',
  );
  assertTrue(
    registry.byName.get('verify:deploy:vps-git-state:smoke')?.modes.includes('ci'),
    'VPS Git state smoke should participate in full ci profile',
  );
}
