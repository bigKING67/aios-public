import assert from 'node:assert/strict';

import {
  buildCompletedInfluencerTagForwardRepairFixture,
  influencerTagAuditArtifact,
} from './content-assets-qianchuan-production-migration-influencer-tag-forward-repair-fixtures.mjs';
import {
  formatQianchuanInfluencerTagForwardRepairDecisions,
  parseQianchuanInfluencerTagForwardRepairDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions-cli.mjs';
import {
  buildQianchuanInfluencerTagForwardRepairDecisions,
  validateQianchuanInfluencerTagForwardRepairDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs';
import {
  validateQianchuanProductionMigrationOwnerDecisionArtifact,
} from '../../lib/migrations/aios-qianchuan-production-migration-owner-decision-artifact.mjs';
import {
  buildReviewedQianchuanProductionMigrationP1Packet,
} from '../../lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs';

export async function assertInfluencerTagForwardRepairDecisionBehavior({
  manifest,
  manifestArtifact,
  priorDecisions,
  priorDecisionsArtifact,
}) {
  const fixture = await buildCompletedInfluencerTagForwardRepairFixture();
  const input = {
    confirmed: true,
    generatedAt: '2026-07-25T11:01:00.000Z',
    plan: fixture.plan,
    planArtifact: fixture.planArtifact,
    planSha256: fixture.planArtifact.sha256,
    postrepairProbe: fixture.postrepairProbe,
    postrepairProbeArtifact: fixture.postrepairProbeArtifact,
    postrepairProbeSha256: fixture.postrepairProbeArtifact.sha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256: priorDecisionsArtifact.sha256,
    reviewedAt: '2026-07-25T11:00:00.000Z',
    reviewer: 'repository-owner',
    stage1: fixture.stage1,
    stage1Artifact: fixture.stage1Artifact,
    stage1Sha256: fixture.stage1Artifact.sha256,
    stage2Checkpoint: fixture.stage2Checkpoint,
    stage2CheckpointArtifact: fixture.stage2CheckpointArtifact,
    stage2CheckpointSha256: fixture.stage2CheckpointArtifact.sha256,
  };
  const decisions = buildQianchuanInfluencerTagForwardRepairDecisions(input);
  assert.equal(validateQianchuanInfluencerTagForwardRepairDecisions(decisions, {
    manifest,
    manifestArtifact,
    plan: fixture.plan,
    postrepairProbe: fixture.postrepairProbe,
    priorDecisions,
    stage1: fixture.stage1,
    stage2Checkpoint: fixture.stage2Checkpoint,
  }), decisions);
  assert.equal(validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions, {
    manifest,
    manifestArtifact,
  }), decisions);
  assert.equal(decisions.schemaVersion, 5);
  assert.equal(decisions.summary.decisions, 22);
  assert.equal(decisions.summary.unresolvedP1dEntries, 2);
  assert.deepEqual(decisions.summary.decisionsByType, {
    not_applicable: 20,
    verified_forward_repaired: 2,
  });
  assert.equal(decisions.decisions.at(-1).decision, 'verified_forward_repaired');
  assert.equal(decisions.decisions.at(-1).historicalExecution, false);
  assert.equal(decisions.decisions.at(-1).ledgerAction, 'do_not_record');
  const decisionsArtifact = influencerTagAuditArtifact(
    decisions,
    '/tmp/influencer-tag-forward-repair-decisions.json',
  );
  const reviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
    decisions,
    decisionsArtifact,
    decisionsSha256: decisionsArtifact.sha256,
    manifest,
    sourceArtifact: manifestArtifact,
  });
  assert.equal(reviewedP1.summary.resolvedEntries, 21);
  assert.equal(reviewedP1.summary.queuedEntries, 2);
  assert.deepEqual(reviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 0, P1D: 2 });

  assert.throws(() => buildQianchuanInfluencerTagForwardRepairDecisions({
    ...input,
    confirmed: false,
  }), /explicit confirmation flag/);
  assert.throws(() => buildQianchuanInfluencerTagForwardRepairDecisions({
    ...input,
    stage2CheckpointSha256: '0'.repeat(64),
  }), /completed Stage 2 SHA-256 differs from the explicit pin/i);
  assert.throws(() => buildQianchuanInfluencerTagForwardRepairDecisions({
    ...input,
    postrepairProbe: {
      ...fixture.postrepairProbe,
      generatedAt: fixture.stage2Checkpoint.generatedAt,
    },
  }), /postrepair does not prove/);
  assert.throws(() => validateQianchuanInfluencerTagForwardRepairDecisions({
    ...decisions,
    decisions: decisions.decisions.map((entry, index) => (
      index === decisions.decisions.length - 1
        ? { ...entry, historicalExecution: true }
        : entry
    )),
  }), /owner decision is invalid/);

  assert.deepEqual(parseQianchuanInfluencerTagForwardRepairDecisionArgs([
    '--prior-decisions', '/tmp/prior.json', `--prior-decisions-sha256=${'a'.repeat(64)}`,
    '--plan', '/tmp/plan.json', `--plan-sha256=${'b'.repeat(64)}`,
    '--stage1', '/tmp/stage1.json', `--stage1-sha256=${'c'.repeat(64)}`,
    '--stage2-checkpoint', '/tmp/stage2.json', `--stage2-checkpoint-sha256=${'d'.repeat(64)}`,
    '--postrepair-probe', '/tmp/postrepair.json', `--postrepair-probe-sha256=${'e'.repeat(64)}`,
    '--reviewer', 'repository-owner', '--reviewed-at', '2026-07-25T11:00:00.000Z',
    '--output', '/tmp/decisions.json', '--confirm-influencer-tag-forward-repair-decision',
    '--json',
  ]), {
    confirmed: true,
    help: false,
    json: true,
    outputPath: '/tmp/decisions.json',
    planPath: '/tmp/plan.json',
    planSha256: 'b'.repeat(64),
    postrepairProbePath: '/tmp/postrepair.json',
    postrepairProbeSha256: 'e'.repeat(64),
    priorDecisionsPath: '/tmp/prior.json',
    priorDecisionsSha256: 'a'.repeat(64),
    reviewedAt: '2026-07-25T11:00:00.000Z',
    reviewer: 'repository-owner',
    stage1Path: '/tmp/stage1.json',
    stage1Sha256: 'c'.repeat(64),
    stage2CheckpointPath: '/tmp/stage2.json',
    stage2CheckpointSha256: 'd'.repeat(64),
  });
  const formatted = formatQianchuanInfluencerTagForwardRepairDecisions(
    decisions,
    decisionsArtifact,
  );
  assert.match(formatted, /decisions=22/);
  assert.match(formatted, /unresolved_p1d=2/);
  assert.match(formatted, /historical_execution=false/);
  assert.doesNotMatch(formatted, /服装|穿搭|beforeSha256/);
  for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--repair']) {
    assert.throws(
      () => parseQianchuanInfluencerTagForwardRepairDecisionArgs([option]),
      /Unknown influencer-tag forward-repair decision option/,
    );
  }
}
