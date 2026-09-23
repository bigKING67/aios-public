export function parseQianchuanProductionMigrationReviewQueueArgs(args) {
  const options = {
    decisionsPath: null,
    decisionsSha256: null,
    help: false,
    json: false,
    manifestPath: null,
    outputPath: null,
    requireReviewed: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--require-reviewed') options.requireReviewed = true;
    else if (argument === '--decisions' || argument === '--decisions-sha256'
      || argument === '--manifest' || argument === '--output') {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      if (argument === '--decisions') options.decisionsPath = value;
      else if (argument === '--decisions-sha256') options.decisionsSha256 = value;
      else if (argument === '--manifest') options.manifestPath = value;
      else options.outputPath = value;
    } else if (argument.startsWith('--decisions=')) {
      options.decisionsPath = argument.slice('--decisions='.length) || null;
    } else if (argument.startsWith('--decisions-sha256=')) {
      options.decisionsSha256 = argument.slice('--decisions-sha256='.length) || null;
    } else if (argument.startsWith('--manifest=')) {
      options.manifestPath = argument.slice('--manifest='.length) || null;
    } else if (argument.startsWith('--output=')) {
      options.outputPath = argument.slice('--output='.length) || null;
    } else throw new Error(`Unknown qianchuan migration review queue option: ${argument}.`);
  }
  if (!options.help && !options.manifestPath) {
    throw new Error('--manifest is required for the offline migration review queue.');
  }
  if (!options.help && Boolean(options.decisionsPath) !== Boolean(options.decisionsSha256)) {
    throw new Error('--decisions and --decisions-sha256 must be provided together.');
  }
  return options;
}

export function qianchuanProductionMigrationReviewQueueExitCode(result, requireReviewed) {
  return requireReviewed && result.summary.queuedEntries > 0 ? 1 : 0;
}

function countText(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(',');
}

export function formatQianchuanProductionMigrationReviewQueue(result, artifact = null) {
  const lines = [
    '[qianchuan-production-migration-review-queue]',
    `mode=${result.mode} source_entries=${result.summary.sourceEntries} queued=${result.summary.queuedEntries} resolved=${result.summary.resolvedEntries}`,
    `priorities=${countText(result.summary.byPriority)}`,
    `lanes=${countText(result.summary.byLane)}`,
    `target_prefix total=${result.summary.targetPrefix.total} conflicts=${result.summary.targetPrefix.schemaConflict} present_candidates=${result.summary.targetPrefix.schemaPresentCandidate} manual=${result.summary.targetPrefix.manualProof}`,
    `source=${result.sourceArtifact.path} bytes=${result.sourceArtifact.bytes} sha256=${result.sourceArtifact.sha256}`,
  ];
  if (result.decisionArtifact) {
    lines.push(`decisions=${result.decisionArtifact.path} bytes=${result.decisionArtifact.bytes} sha256=${result.decisionArtifact.sha256}`);
  }
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
