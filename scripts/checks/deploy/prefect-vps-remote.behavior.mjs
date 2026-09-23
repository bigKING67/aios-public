#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT_PATHS = [
  'start-services.sh',
  'stop-services.sh',
  'scripts/backend-rust/cargo-with-cache.sh',
  'scripts/dev/start-backend.sh',
  'scripts/ops/deploy-prefect-vps.sh',
  'scripts/dataops/check-prefect-remote.sh',
  'scripts/dataops/check-postgres-remote.sh',
  'scripts/lib/deploy/aios-service-processes.sh',
  'scripts/lib/deploy/vps-password-auth.sh',
  'scripts/lib/deploy/vps-git-state.sh',
  'scripts/lib/deploy/vps-remote-status.sh',
  'scripts/lib/deploy/vps-remote-git-sync.sh',
  'scripts/lib/deploy/vps-remote-prefect-deploy.sh',
];

function runBash(args, options = {}) {
  return spawnSync('bash', args, {
    encoding: 'utf8',
    ...options,
  });
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'aios-prefect-vps-'));
const localRepo = path.join(tempRoot, 'local');
const remoteRepo = path.join(tempRoot, 'remote');
const bareOrigin = path.join(tempRoot, 'origin.git');
const mockSsh = path.join(tempRoot, 'mock-ssh');
const mockCurl = path.join(tempRoot, 'mock-curl');
const mockNc = path.join(tempRoot, 'mock-nc');
const mockCargo = path.join(tempRoot, 'cargo');
const deployMarker = path.join(tempRoot, 'deploy-marker.txt');

try {
  await mkdir(localRepo, { recursive: true });
  git(tempRoot, 'init', '--bare', bareOrigin);
  git(localRepo, 'init');
  git(localRepo, 'config', 'user.email', 'fixture@example.test');
  git(localRepo, 'config', 'user.name', 'Fixture');

  for (const relativePath of SCRIPT_PATHS) {
    const destination = path.join(localRepo, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(REPO_ROOT, relativePath), destination);
  }
  await mkdir(path.join(localRepo, 'etl/groland_postgres/scripts'), { recursive: true });
  await writeFile(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_process_marketing_content_asset_analysis_jobs.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "content-asset-analysis\\n" > "$PREFECT_FIXTURE_MARKER"\n',
    'utf8'
  );
  await writeFile(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_dataops_hub_all.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "all\\n" > "$PREFECT_FIXTURE_MARKER"\n',
    'utf8'
  );
  await writeFile(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_daily_business_brief.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "daily-business-brief\\n" > "$PREFECT_FIXTURE_MARKER"\n',
    'utf8'
  );
  await writeFile(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_marketing_industry_articles.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "marketing-industry-articles\\n" > "$PREFECT_FIXTURE_MARKER"\n',
    'utf8'
  );
  await writeFile(
    path.join(localRepo, '.gitignore'),
    'scripts/config/deploy/vps.local.env\n.env.local\n',
    'utf8'
  );
  for (const relativePath of SCRIPT_PATHS.filter((item) => item.endsWith('.sh'))) {
    await chmod(path.join(localRepo, relativePath), 0o755);
  }
  await chmod(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_process_marketing_content_asset_analysis_jobs.sh'),
    0o755
  );
  await chmod(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_dataops_hub_all.sh'),
    0o755
  );
  await chmod(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_daily_business_brief.sh'),
    0o755
  );
  await chmod(
    path.join(localRepo, 'etl/groland_postgres/scripts/deploy_prefect_marketing_industry_articles.sh'),
    0o755
  );

  git(localRepo, 'add', '.');
  git(localRepo, 'commit', '-m', 'fixture');
  git(localRepo, 'branch', '-M', 'main');
  git(localRepo, 'remote', 'add', 'origin', bareOrigin);
  git(localRepo, 'push', '-u', 'origin', 'main');
  git(tempRoot, 'clone', bareOrigin, remoteRepo);

  await writeFile(
    mockSsh,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" -G "* ]]; then
  printf 'pubkeyauthentication no\\npreferredauthentications password,keyboard-interactive\\nnumberofpasswordprompts 1\\n'
  exit 0
fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift 2 ;;
    *@*) shift; break ;;
    *) shift ;;
  esac
done
exec "$@"
`,
    'utf8'
  );
  await chmod(mockSsh, 0o755);

  await writeFile(
    mockCurl,
    `#!/usr/bin/env bash
set -euo pipefail
output_file=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output_file="$2"; shift 2 ;;
    -w|--max-time|-H|-u|-X|--data) shift 2 ;;
    -sS) shift ;;
    http://*|https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
[ -n "$output_file" ]
case "$url" in
  */health)
    health_status="\${PREFECT_FIXTURE_HEALTH_HTTP_STATUS:-200}"
    if [ "$health_status" = '200' ]; then
      printf 'true' > "$output_file"
    else
      printf 'false' > "$output_file"
    fi
    printf '%s' "$health_status"
    exit 0
    ;;
  */deployments/filter)
    if [ "\${PREFECT_FIXTURE_BAD_ENTRYPOINT:-0}" = '1' ]; then
      printf '[{"entrypoint":"/Users/fixture/bad.py:flow"}]' > "$output_file"
    else
      printf '[{"name":"ads-21-marketing-industry-articles-inc","entrypoint":"/opt/docker/compose/aios/etl/flow.py:flow"},{"name":"ads-21-marketing-industry-articles-cache-sweep","entrypoint":"/opt/docker/compose/aios/etl/flow.py:flow"},{"name":"ads-21-marketing-industry-articles-content-retry","entrypoint":"/opt/docker/compose/aios/etl/flow.py:flow"}]' > "$output_file"
    fi
    ;;
  */deployments/name/*)
    printf '{"id":"deployment-1","entrypoint":"/opt/docker/compose/aios/etl/groland_postgres/scripts/prefect_process_marketing_content_asset_analysis_jobs.py:process_marketing_content_asset_analysis_jobs_flow"}' > "$output_file"
    ;;
  *) exit 22 ;;
esac
printf '200'
`,
    'utf8'
  );
  await chmod(mockCurl, 0o755);

  await writeFile(
    mockNc,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${POSTGRES_FIXTURE_TCP_STATUS:-0}" != '0' ]; then
  exit "\${POSTGRES_FIXTURE_TCP_STATUS}"
fi
exit 0
`,
    'utf8'
  );
  await chmod(mockNc, 0o755);

  await writeFile(
    mockCargo,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'fixture cargo %s runtime_read_only=%s target_dir=%s args=%s\n' "\${1:-}" "\${AIOS_RUNTIME_READ_ONLY:-unset}" "\${CARGO_TARGET_DIR:-unset}" "$*"
`,
    'utf8'
  );
  await chmod(mockCargo, 0o755);

  const configPath = path.join(localRepo, 'scripts/config/deploy/vps.local.env');
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    [
      'VPS_HOST=fixture',
      'VPS_USER=fixture',
      `VPS_PROJECT_DIR=${remoteRepo}`,
      'DEPLOY_BRANCH=main',
      `VPS_PASSWORD_SSH_COMMAND=${mockSsh}`,
      'REMOTE_SUDO_I=0',
      'PREFECT_VPS_API_URL=http://100.64.0.1:4200/api',
      'PREFECT_VPS_AUTH_MODE=none',
      `PREFECT_REMOTE_CURL_BIN=${mockCurl}`,
      '',
    ].join('\n'),
    'utf8'
  );

  const env = { ...process.env, PREFECT_FIXTURE_MARKER: deployMarker };
  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api',
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      '',
    ].join('\n'),
    'utf8'
  );

  const remoteStartMode = runBash(
    [
      '-c',
      'source ./start-services.sh; configure_backend_mode; printf "mode=%s\\nprefect=%s\\n" "$BACKEND_MODE" "$DATAOPS_PREFECT_API_URL"',
    ],
    {
      cwd: localRepo,
      env: {
        ...env,
        DATAOPS_PREFECT_AUTH_MODE: 'none',
        PREFECT_REMOTE_CURL_BIN: mockCurl,
      },
    }
  );
  assert.equal(remoteStartMode.status, 0, remoteStartMode.stderr || remoteStartMode.stdout);
  assert.match(remoteStartMode.stdout, /mode=vps-prefect/u);
  assert.match(remoteStartMode.stdout, /prefect=http:\/\/100\.64\.0\.1:4200\/api/u);

  const localStartMode = runBash(
    [
      '-c',
      'source ./start-services.sh; configure_backend_mode; printf "mode=%s\\nprefect=%s\\n" "$BACKEND_MODE" "${DATAOPS_PREFECT_API_URL:-}"',
    ],
    {
      cwd: localRepo,
      env: {
        ...env,
        AIOS_DEV_BACKEND_MODE: 'local',
        PREFECT_FIXTURE_HEALTH_HTTP_STATUS: '503',
        PREFECT_REMOTE_CURL_BIN: mockCurl,
      },
    }
  );
  assert.equal(localStartMode.status, 0, localStartMode.stderr || localStartMode.stdout);
  assert.match(localStartMode.stdout, /mode=local/u);
  assert.match(localStartMode.stdout, /prefect=http:\/\/127\.0\.0\.1:4200\/api/u);

  const failedRemoteStart = runBash(
    ['-c', 'source ./start-services.sh; configure_backend_mode'],
    {
      cwd: localRepo,
      env: {
        ...env,
        DATAOPS_PREFECT_AUTH_MODE: 'none',
        PREFECT_FIXTURE_HEALTH_HTTP_STATUS: '503',
        PREFECT_REMOTE_CURL_BIN: mockCurl,
      },
    }
  );
  assert.notEqual(failedRemoteStart.status, 0, 'unhealthy remote Prefect must block startup');
  assert.match(
    `${failedRemoteStart.stdout}\n${failedRemoteStart.stderr}`,
    /Prefect remote health check failed/u
  );

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api',
      'AIOS_VPS_PREFECT_API_URL=http://127.0.0.1:4200/api',
      '',
    ].join('\n'),
    'utf8'
  );
  const loopbackStartMode = runBash(
    ['-c', 'source ./start-services.sh; configure_backend_mode'],
    {
      cwd: localRepo,
      env: {
        ...env,
        DATAOPS_PREFECT_AUTH_MODE: 'none',
        PREFECT_REMOTE_CURL_BIN: mockCurl,
      },
    }
  );
  assert.notEqual(loopbackStartMode.status, 0, 'default all-in-one mode must reject loopback Prefect');
  assert.match(`${loopbackStartMode.stdout}\n${loopbackStartMode.stderr}`, /refuses loopback URL/u);

  const stopServicesSource = await readFile(path.join(localRepo, 'stop-services.sh'), 'utf8');
  assert.doesNotMatch(
    stopServicesSource,
    /deploy-prefect-vps|check-prefect-remote|:4200|prefect\s+(?:server|worker)|\bssh\b/iu,
    'stop-services.sh must remain local-only'
  );

  for (const backendBinary of [
    '.cache/cargo-target/backend-rust/debug/aios-backend-rust',
    'backend-rust/target/debug/aios-backend-rust',
  ]) {
    const classifiedBackend = runBash(
      [
        '-c',
        `PROJECT_ROOT="$1"
source "$PROJECT_ROOT/scripts/lib/deploy/aios-service-processes.sh"
aios_pid_command() { printf '%s\\n' "$FIXTURE_PROCESS_COMMAND"; }
aios_pid_cwd() { printf '%s\\n' "$FIXTURE_PROCESS_CWD"; }
aios_is_project_backend_pid 999`,
        'backend-classifier',
        localRepo,
      ],
      {
        env: {
          ...env,
          FIXTURE_PROCESS_COMMAND: path.join(localRepo, backendBinary),
          FIXTURE_PROCESS_CWD: tempRoot,
        },
      }
    );
    assert.equal(classifiedBackend.status, 0, `backend process classifier should accept ${backendBinary}`);
  }

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api',
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      '',
    ].join('\n'),
    'utf8'
  );

  const loopbackPrefect = runBash(
    ['scripts/dataops/check-prefect-remote.sh', 'http://[::1]:4200/api'],
    {
      cwd: localRepo,
      env: {
        ...env,
        DATAOPS_PREFECT_AUTH_MODE: 'none',
        PREFECT_REMOTE_CURL_BIN: mockCurl,
        PREFECT_REMOTE_REQUIRE_NON_LOCAL: '1',
      },
    }
  );
  assert.notEqual(loopbackPrefect.status, 0, 'remote mode must reject IPv6 loopback');
  assert.match(`${loopbackPrefect.stdout}\n${loopbackPrefect.stderr}`, /refuses loopback URL/u);

  const status = runBash(['scripts/ops/deploy-prefect-vps.sh', 'status'], { cwd: localRepo, env });
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /Prefect remote health: PASS/u);
  assert.match(status.stdout, /Prefect deployment postcheck: PASS/u);

  const deploy = runBash(
    ['scripts/ops/deploy-prefect-vps.sh', 'deploy', 'content-asset-analysis'],
    { cwd: localRepo, env }
  );
  assert.equal(deploy.status, 0, deploy.stderr || deploy.stdout);
  assert.equal((await readFile(deployMarker, 'utf8')).trim(), 'content-asset-analysis');
  assert.match(deploy.stdout, /Running Prefect deployment from VPS checkout/u);

  const dailyBriefDeploy = runBash(
    ['scripts/ops/deploy-prefect-vps.sh', 'deploy', 'daily-business-brief'],
    { cwd: localRepo, env }
  );
  assert.equal(
    dailyBriefDeploy.status,
    0,
    dailyBriefDeploy.stderr || dailyBriefDeploy.stdout
  );
  assert.equal((await readFile(deployMarker, 'utf8')).trim(), 'daily-business-brief');
  assert.match(dailyBriefDeploy.stdout, /Running Prefect deployment from VPS checkout/u);

  const marketingIndustryDeploy = runBash(
    ['scripts/ops/deploy-prefect-vps.sh', 'deploy', 'marketing-industry-articles'],
    { cwd: localRepo, env }
  );
  assert.equal(
    marketingIndustryDeploy.status,
    0,
    marketingIndustryDeploy.stderr || marketingIndustryDeploy.stdout
  );
  assert.equal((await readFile(deployMarker, 'utf8')).trim(), 'marketing-industry-articles');
  assert.match(marketingIndustryDeploy.stdout, /Running Prefect deployment from VPS checkout/u);

  const badPath = runBash(['scripts/ops/deploy-prefect-vps.sh', 'status'], {
    cwd: localRepo,
    env: { ...env, PREFECT_FIXTURE_BAD_ENTRYPOINT: '1' },
  });
  assert.notEqual(badPath.status, 0, 'MacBook /Users entrypoint must fail the postcheck');
  assert.match(`${badPath.stdout}\n${badPath.stderr}`, /contains a MacBook \/Users path/u);

  await writeFile(path.join(localRepo, 'dirty.txt'), 'dirty\n', 'utf8');
  const dirtyDeploy = runBash(
    ['scripts/ops/deploy-prefect-vps.sh', 'deploy', 'content-asset-analysis'],
    { cwd: localRepo, env }
  );
  assert.notEqual(dirtyDeploy.status, 0, 'dirty local worktree must block deployment');
  assert.match(`${dirtyDeploy.stdout}\n${dirtyDeploy.stderr}`, /local worktree is dirty/u);

  await mkdir(path.join(localRepo, 'backend-rust'), { recursive: true });
  await writeFile(path.join(localRepo, 'backend-rust/.env'), 'DATABASE_URL=postgresql://local-fixture\n', 'utf8');

  const backendEnv = {
    ...env,
    BACKEND_PORT: '49321',
    CARGO_TARGET_DIR: '',
    AIOS_DEV_BACKEND_MODE: 'vps-prefect',
    AIOS_RUNTIME_READ_ONLY: 'true',
    DATAOPS_PREFECT_AUTH_MODE: 'none',
    PATH: `${tempRoot}:${process.env.PATH}`,
    POSTGRES_REMOTE_NC_BIN: mockNc,
    PREFECT_REMOTE_CURL_BIN: mockCurl,
  };
  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      'DATABASE_URL=postgresql://fixture-user:super-secret@100.64.0.8:5544/groland?sslmode=disable',
      'AIOS_RUNTIME_READ_ONLY=false',
      '',
    ].join('\n'),
    'utf8'
  );
  const backendRemoteStart = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: backendEnv,
  });
  assert.equal(backendRemoteStart.status, 0, backendRemoteStart.stderr || backendRemoteStart.stdout);
  assert.match(backendRemoteStart.stdout, /PostgreSQL remote TCP: PASS/u);
  assert.match(backendRemoteStart.stdout, /PostgreSQL host: 100\.64\.0\.8/u);
  assert.match(backendRemoteStart.stdout, /PostgreSQL port: 5544/u);
  assert.match(backendRemoteStart.stdout, /fixture cargo run runtime_read_only=true/u);
  assert.match(backendRemoteStart.stdout, /target_dir=.*\/\.cache\/cargo-target\/backend-rust/u);
  assert.match(backendRemoteStart.stdout, /args=run --bin aios-backend-rust/u);
  assert.doesNotMatch(
    `${backendRemoteStart.stdout}\n${backendRemoteStart.stderr}`,
    /fixture-user|super-secret|groland\?sslmode/iu,
    'remote startup output must not expose PostgreSQL credentials or raw URL'
  );

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      'DATABASE_URL=postgresql://fixture:secret@127.0.0.1:5432/groland',
      '',
    ].join('\n'),
    'utf8'
  );
  const backendProcessDatabaseOverride = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: {
      ...backendEnv,
      DATABASE_URL: 'postgresql://process-user:process-secret@100.64.0.9:5433/groland',
    },
  });
  assert.equal(
    backendProcessDatabaseOverride.status,
    0,
    backendProcessDatabaseOverride.stderr || backendProcessDatabaseOverride.stdout
  );
  assert.match(backendProcessDatabaseOverride.stdout, /PostgreSQL host: 100\.64\.0\.9/u);
  assert.match(backendProcessDatabaseOverride.stdout, /PostgreSQL port: 5433/u);
  assert.doesNotMatch(
    `${backendProcessDatabaseOverride.stdout}\n${backendProcessDatabaseOverride.stderr}`,
    /process-user|process-secret/iu,
    'explicit process DATABASE_URL must win without exposing credentials'
  );

  await writeFile(
    path.join(localRepo, '.env.local'),
    'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api\n',
    'utf8'
  );
  const backendMissingDatabase = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: backendEnv,
  });
  assert.notEqual(backendMissingDatabase.status, 0, 'missing remote DATABASE_URL must fail');
  assert.match(
    `${backendMissingDatabase.stdout}\n${backendMissingDatabase.stderr}`,
    /vps-prefect .*DATABASE_URL/u
  );
  assert.doesNotMatch(backendMissingDatabase.stdout, /fixture cargo run/u);

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      'DATABASE_URL=postgresql://fixture:secret@127.0.0.1:5432/groland',
      '',
    ].join('\n'),
    'utf8'
  );
  const backendLoopbackDatabase = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: backendEnv,
  });
  assert.notEqual(backendLoopbackDatabase.status, 0, 'loopback remote PostgreSQL must fail');
  assert.match(
    `${backendLoopbackDatabase.stdout}\n${backendLoopbackDatabase.stderr}`,
    /refuses local or unspecified host/u
  );

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      'DATABASE_URL=postgresql://fixture:secret@100.64.0.8:70000/groland',
      '',
    ].join('\n'),
    'utf8'
  );
  const backendInvalidDatabase = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: backendEnv,
  });
  assert.notEqual(backendInvalidDatabase.status, 0, 'invalid remote PostgreSQL port must fail');
  assert.match(
    `${backendInvalidDatabase.stdout}\n${backendInvalidDatabase.stderr}`,
    /invalid port/u
  );

  await writeFile(
    path.join(localRepo, '.env.local'),
    [
      'AIOS_VPS_PREFECT_API_URL=http://100.64.0.1:4200/api',
      'DATABASE_URL=postgresql://fixture:secret@100.64.0.8:5432/groland',
      '',
    ].join('\n'),
    'utf8'
  );
  const backendUnreachableDatabase = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: { ...backendEnv, POSTGRES_FIXTURE_TCP_STATUS: '1' },
  });
  assert.notEqual(backendUnreachableDatabase.status, 0, 'unreachable remote PostgreSQL must fail');
  assert.match(
    `${backendUnreachableDatabase.stdout}\n${backendUnreachableDatabase.stderr}`,
    /Remote PostgreSQL TCP check failed/u
  );
  assert.doesNotMatch(backendUnreachableDatabase.stdout, /fixture cargo run/u);

  await writeFile(path.join(localRepo, '.env.local'), '', 'utf8');
  const backendLocalStart = runBash(['scripts/dev/start-backend.sh'], {
    cwd: localRepo,
    env: { ...backendEnv, AIOS_DEV_BACKEND_MODE: 'local' },
  });
  assert.equal(backendLocalStart.status, 0, backendLocalStart.stderr || backendLocalStart.stdout);
  assert.match(backendLocalStart.stdout, /Backend mode: local/u);
  assert.match(backendLocalStart.stdout, /fixture cargo run runtime_read_only=true/u);
  assert.match(backendLocalStart.stdout, /target_dir=.*\/\.cache\/cargo-target\/backend-rust/u);
  assert.match(backendLocalStart.stdout, /args=run --bin aios-backend-rust/u);
  assert.doesNotMatch(backendLocalStart.stdout, /PostgreSQL remote TCP/u);

  console.log('prefect-vps-remote-behavior: OK');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
