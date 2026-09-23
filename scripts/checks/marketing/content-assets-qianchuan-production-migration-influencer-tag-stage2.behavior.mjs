#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createInfluencerTagStage2Fixture,
  influencerTagAuditArtifact,
} from './content-assets-qianchuan-production-migration-influencer-tag-forward-repair-fixtures.mjs';

import {
  closeMigrationAuditReservation,
  reserveExclusiveMigrationAuditJson,
  writeReservedMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  formatQianchuanInfluencerTagStage2Result,
  parseQianchuanInfluencerTagStage2Args,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2-cli.mjs';
import {
  assertQianchuanInfluencerTagStage2Authorization,
  assertQianchuanInfluencerTagStage2GitState,
  runQianchuanInfluencerTagStage2Batch,
  validateQianchuanInfluencerTagStage2Checkpoint,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2.mjs';

const reservationEvents = [];
const reservation = reserveExclusiveMigrationAuditJson('/tmp/reserved-stage2.json', {
  openFile: (path, flag) => {
    reservationEvents.push(['open', path, flag]);
    return 42;
  },
});
const reservationArtifact = writeReservedMigrationAuditJson(
  reservation,
  { ok: true },
  {
    closeFile: (descriptor) => reservationEvents.push(['close', descriptor]),
    writeFile: (descriptor, content, encoding) => {
      reservationEvents.push(['write', descriptor, content, encoding]);
    },
  },
);
assert.deepEqual(reservationEvents.map(([event]) => event), ['open', 'write', 'close']);
assert.equal(reservationArtifact.path, '/tmp/reserved-stage2.json');
assert.equal(reservationArtifact.bytes, Buffer.byteLength('{\n  "ok": true\n}\n'));
assert.equal(reservation.written, true);
assert.throws(
  () => writeReservedMigrationAuditJson(reservation, { ok: false }),
  /invalid or already written/,
);
const abandoned = reserveExclusiveMigrationAuditJson('/tmp/abandoned-stage2.json', {
  openFile: () => 43,
});
assert.equal(closeMigrationAuditReservation(abandoned, { closeFile: () => {} }), true);
assert.equal(closeMigrationAuditReservation(abandoned, { closeFile: () => {} }), false);

const {
  createClient,
  plan,
  planArtifact,
  stage1,
  stage1Artifact,
} = createInfluencerTagStage2Fixture();
const firstClient = createClient();
const firstEvents = [];
const first = await runQianchuanInfluencerTagStage2Batch({
  batchSize: 1,
  client: firstClient,
  git: stage1.git,
  now: () => new Date('2026-07-25T06:02:00.000Z'),
  onEvent: (event) => firstEvents.push(event),
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  stage1,
  stage1Artifact,
  stage1Sha256: stage1Artifact.sha256,
});
assert.equal(validateQianchuanInfluencerTagStage2Checkpoint(first), first);
assert.equal(first.status, 'in_progress');
assert.equal(first.updatedRows, 1);
assert.equal(first.cumulativeUpdatedRows, 1);
assert.equal(first.remainingMismatchRows, 1);
assert.equal(first.nextCursor, '2');
assert.equal(first.policy.fullBackfillExecuted, false);
assert.equal(first.policy.independentPostrepairVerified, false);
assert.deepEqual(firstEvents.map((event) => event.stage), [
  'preflight_passed',
  'transaction_boundary_verified',
  'batch_verified_in_transaction',
  'stage2_batch_committed',
  'postcheck_passed',
]);

const firstArtifact = influencerTagAuditArtifact(
  { ...first, events: firstEvents },
  '/tmp/influencer-tag-stage2-first.json',
);
const secondEvents = [];
const second = await runQianchuanInfluencerTagStage2Batch({
  batchSize: 1,
  checkpoint: { ...first, events: firstEvents },
  checkpointArtifact: firstArtifact,
  checkpointSha256: firstArtifact.sha256,
  client: firstClient,
  git: stage1.git,
  now: () => new Date('2026-07-25T06:03:00.000Z'),
  onEvent: (event) => secondEvents.push(event),
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  stage1,
  stage1Artifact,
  stage1Sha256: stage1Artifact.sha256,
});
assert.equal(validateQianchuanInfluencerTagStage2Checkpoint(second), second);
assert.equal(second.status, 'completed');
assert.equal(second.batchNumber, 2);
assert.equal(second.cumulativeUpdatedRows, 2);
assert.equal(second.remainingMismatchRows, 0);
assert.equal(second.nextCursor, null);
assert.equal(second.policy.fullBackfillExecuted, true);
assert.equal(second.policy.independentPostrepairVerified, false);
assert.equal(firstClient.queries.filter(({ sql }) => sql === 'COMMIT').length, 2);
assert.equal(firstClient.queries.some(({ sql }) => /SKIP\s+LOCKED/i.test(sql)), false);
const batchSql = firstClient.queries.find(({ sql }) => (
  sql.includes('aios_qianchuan_influencer_tag_stage2:batch_update')
))?.sql;
assert.match(batchSql, /selected AS MATERIALIZED/);
assert.match(batchSql, /ORDER BY library\.id\s+FOR UPDATE OF library/);

const rollbackClient = createClient({ failBatchGuard: true });
await assert.rejects(
  runQianchuanInfluencerTagStage2Batch({
    batchSize: 2,
    client: rollbackClient,
    git: stage1.git,
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    stage1,
    stage1Artifact,
    stage1Sha256: stage1Artifact.sha256,
  }),
  /exact batch row count differs/,
);
assert.equal(rollbackClient.queries.at(-1).sql, 'ROLLBACK');
assert.equal(rollbackClient.queries.some(({ sql }) => sql === 'COMMIT'), false);

const committedPostcheckClient = createClient({ failCommittedPostcheck: true });
await assert.rejects(
  runQianchuanInfluencerTagStage2Batch({
    batchSize: 2,
    client: committedPostcheckClient,
    git: stage1.git,
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    stage1,
    stage1Artifact,
    stage1Sha256: stage1Artifact.sha256,
  }),
  (error) => {
    assert.match(error.message, /summary differs/);
    assert.equal(error.stage2Committed, true);
    return true;
  },
);
assert.equal(committedPostcheckClient.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);

assert.equal(assertQianchuanInfluencerTagStage2GitState({
  branch: 'main',
  expectedGitSha: '1'.repeat(40),
  head: '1'.repeat(40),
  originMain: '1'.repeat(40),
  status: '',
}), true);
assert.throws(
  () => assertQianchuanInfluencerTagStage2GitState({
    branch: 'main',
    expectedGitSha: '1'.repeat(40),
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    status: ' M package.json',
  }),
  /refuses a dirty Git worktree/,
);
assert.deepEqual(
  assertQianchuanInfluencerTagStage2Authorization({
    confirmed: true,
    env: {
      AIOS_QC_ALLOW_LIVE_WRITE: '1',
      AIOS_QC_INFLUENCER_TAG_WRITE_ACK: 'stage2-batch',
      AIOS_QC_EXPECTED_GIT_SHA: '1'.repeat(40),
      DATABASE_URL: 'postgres://fixture',
    },
  }),
  {
    connectionString: 'postgres://fixture',
    expectedGitSha: '1'.repeat(40),
  },
);

assert.deepEqual(
  parseQianchuanInfluencerTagStage2Args([
    '--plan', '/tmp/plan.json',
    `--plan-sha256=${'a'.repeat(64)}`,
    '--stage1', '/tmp/stage1.json',
    '--stage1-sha256', 'b'.repeat(64),
    '--checkpoint', '/tmp/previous.json',
    '--checkpoint-sha256', 'c'.repeat(64),
    '--batch-size', '25',
    '--output', '/tmp/stage2.json',
    '--confirm-stage2-batch',
  ]),
  {
    batchSize: 25,
    checkpointPath: '/tmp/previous.json',
    checkpointSha256: 'c'.repeat(64),
    confirmed: true,
    help: false,
    outputPath: '/tmp/stage2.json',
    planPath: '/tmp/plan.json',
    planSha256: 'a'.repeat(64),
    stage1Path: '/tmp/stage1.json',
    stage1Sha256: 'b'.repeat(64),
  },
);
assert.throws(
  () => parseQianchuanInfluencerTagStage2Args([
    '--plan', '/tmp/plan.json',
    '--plan-sha256', 'a'.repeat(64),
    '--stage1', '/tmp/stage1.json',
    '--stage1-sha256', 'b'.repeat(64),
    '--batch-size', '51',
    '--output', '/tmp/stage2.json',
  ]),
  /integer from 1 to 50/,
);
for (const option of ['--deploy', '--historical-replay', '--ark', '--write-ledger', '--owner-decision']) {
  assert.throws(
    () => parseQianchuanInfluencerTagStage2Args([option]),
    /Unknown qianchuan influencer-tag Stage 2 option/,
  );
}

const formatted = formatQianchuanInfluencerTagStage2Result(second, {
  bytes: 2000,
  path: '/tmp/influencer-tag-stage2.json',
  sha256: 'f'.repeat(64),
});
assert.match(formatted, /status=completed/);
assert.match(formatted, /remaining_mismatch_rows=0/);
assert.match(formatted, /independent_postrepair=false/);
assert.doesNotMatch(formatted, /服装|穿搭|beforeSha256/);

const opsSource = readFileSync(new URL(
  '../../ops/qianchuan-influencer-tag-stage2-batch.mjs',
  import.meta.url,
), 'utf8');
const authorizationIndex = opsSource.indexOf(
  'const authorization = assertQianchuanInfluencerTagStage2Authorization',
);
const gitIndex = opsSource.indexOf('git = readGitState(authorization.expectedGitSha)');
const reserveIndex = opsSource.indexOf(
  'outputReservation = reserveExclusiveMigrationAuditJson(options.outputPath)',
);
const planReadIndex = opsSource.indexOf('readExternalMigrationAuditJson(options.planPath)');
const connectIndex = opsSource.indexOf('new pg.Client');
assert.equal(authorizationIndex >= 0 && authorizationIndex < gitIndex, true);
assert.equal(gitIndex < reserveIndex && reserveIndex < planReadIndex, true);
assert.equal(planReadIndex < connectIndex, true);
assert.match(opsSource, /writeReservedMigrationAuditJson\(outputReservation, \{ \.\.\.result, events \}\)/);
assert.match(opsSource, /stage2Committed: error\?\.stage2Committed === true/);

console.log('[qianchuan-influencer-tag-stage2-behavior] OK: auth/Git/output fail-closed ordering, exact Stage 1 source pins, 1..50 ascending-ID checkpoints, guard rollback, truthful committed-postcheck failure, immutable completed-row evidence, completion without owner/ledger/deploy/Ark, and independent postrepair still required.');
