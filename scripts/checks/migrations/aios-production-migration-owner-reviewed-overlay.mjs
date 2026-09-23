#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

import {
  readExternalMigrationAuditJson,
  resolveExternalMigrationAuditArtifactPath,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatAiosProductionMigrationOwnerReviewedOverlay,
  parseAiosProductionMigrationOwnerReviewedOverlayArgs,
} from '../../lib/migrations/aios-production-migration-owner-reviewed-overlay-cli.mjs';
import {
  buildAiosProductionMigrationExceptionDecisions,
  buildAiosProductionMigrationOwnerDecisions,
  buildAiosProductionMigrationReviewedManifest,
} from '../../lib/migrations/aios-production-migration-owner-reviewed-overlay.mjs';

const USAGE = `Usage:
  node scripts/checks/migrations/aios-production-migration-owner-reviewed-overlay.mjs \\
    --manifest /tmp/reconciliation.json --manifest-sha256 <sha256> \\
    --evidence /tmp/evidence-pack.json --evidence-sha256 <sha256> \\
    --review-spec /tmp/review-spec.json --review-spec-sha256 <sha256> \\
    --prior-exception-decisions /tmp/prior-decisions.json \\
    --prior-exception-decisions-sha256 <sha256> \\
    --owner-decisions-output /tmp/owner-decisions.json \\
    --reviewed-manifest-output /tmp/reviewed-manifest.json \\
    --exception-decisions-output /tmp/exception-decisions.json \\
    --confirm-owner-review

This command is offline. It validates checksum-pinned owner intent and evidence,
writes three exclusive artifacts outside the repository, and never connects to a
database, generates SQL, writes the migration ledger, applies migrations, commits,
pushes, or deploys.`;

function predictedArtifact(value, outputPath) {
  const resolvedPath = resolveExternalMigrationAuditArtifactPath(outputPath);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    path: resolvedPath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function assertOutputPathsAvailable(paths) {
  for (const outputPath of paths) {
    const resolved = resolveExternalMigrationAuditArtifactPath(outputPath);
    if (existsSync(resolved)) {
      throw new Error(`Owner-review overlay refuses to overwrite ${resolved}.`);
    }
  }
}

function assertArtifactPrediction(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} artifact metadata differs from its deterministic prediction.`);
  }
}

try {
  const options = parseAiosProductionMigrationOwnerReviewedOverlayArgs(
    process.argv.slice(2),
  );
  if (options.help) {
    console.log(USAGE);
  } else {
    const manifest = readExternalMigrationAuditJson(options.manifestPath);
    const evidence = readExternalMigrationAuditJson(options.evidencePath);
    const reviewSpec = readExternalMigrationAuditJson(options.reviewSpecPath);
    const priorDecisions = readExternalMigrationAuditJson(options.priorDecisionsPath);
    const records = discoverAiosMigrations({ descriptor: readAiosMigrationDescriptor() });
    assertOutputPathsAvailable([
      options.ownerDecisionsOutputPath,
      options.reviewedManifestOutputPath,
      options.exceptionDecisionsOutputPath,
    ]);

    const generatedAt = new Date().toISOString();
    const ownerDecisions = buildAiosProductionMigrationOwnerDecisions({
      evidenceArtifact: evidence.metadata,
      evidenceSha256: options.evidenceSha256,
      generatedAt,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      records,
      reviewSpec: reviewSpec.data,
      reviewSpecArtifact: reviewSpec.metadata,
      reviewSpecSha256: options.reviewSpecSha256,
    });
    const predictedOwnerDecisions = predictedArtifact(
      ownerDecisions,
      options.ownerDecisionsOutputPath,
    );
    const reviewedManifest = buildAiosProductionMigrationReviewedManifest({
      decisions: ownerDecisions,
      decisionsArtifact: predictedOwnerDecisions,
      decisionsSha256: predictedOwnerDecisions.sha256,
      generatedAt,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      manifestSha256: options.manifestSha256,
      records,
    });
    const exceptionDecisions = buildAiosProductionMigrationExceptionDecisions({
      generatedAt,
      manifest: manifest.data,
      manifestArtifact: manifest.metadata,
      ownerDecisions,
      ownerDecisionsArtifact: predictedOwnerDecisions,
      ownerDecisionsSha256: predictedOwnerDecisions.sha256,
      priorDecisions: priorDecisions.data,
      priorDecisionsArtifact: priorDecisions.metadata,
      priorDecisionsSha256: options.priorDecisionsSha256,
      records,
    });
    const predictedReviewedManifest = predictedArtifact(
      reviewedManifest,
      options.reviewedManifestOutputPath,
    );
    const predictedExceptionDecisions = predictedArtifact(
      exceptionDecisions,
      options.exceptionDecisionsOutputPath,
    );

    const artifacts = {
      ownerDecisions: writeExclusiveMigrationAuditJson(
        ownerDecisions,
        options.ownerDecisionsOutputPath,
      ),
      reviewedManifest: writeExclusiveMigrationAuditJson(
        reviewedManifest,
        options.reviewedManifestOutputPath,
      ),
      exceptionDecisions: writeExclusiveMigrationAuditJson(
        exceptionDecisions,
        options.exceptionDecisionsOutputPath,
      ),
    };
    assertArtifactPrediction(artifacts.ownerDecisions, predictedOwnerDecisions, 'Owner decisions');
    assertArtifactPrediction(
      artifacts.reviewedManifest,
      predictedReviewedManifest,
      'Reviewed manifest',
    );
    assertArtifactPrediction(
      artifacts.exceptionDecisions,
      predictedExceptionDecisions,
      'Exception decisions',
    );
    console.log(formatAiosProductionMigrationOwnerReviewedOverlay({
      artifacts,
      exceptionDecisions,
      ownerDecisions,
      reviewedManifest,
    }));
  }
} catch (error) {
  const detail = redactMigrationText(error instanceof Error ? error.message : String(error));
  console.error(`[aios-production-migration-owner-reviewed-overlay] failed: ${detail}`);
  process.exitCode = 1;
}
