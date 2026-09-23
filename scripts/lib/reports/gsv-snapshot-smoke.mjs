export function auditGsvSnapshotBoundary(files, paths, findings) {
  const loader = files[paths.snapshotLoader];
  const parser = files[paths.snapshotParser];
  const source = files[paths.contentData];
  const artifact = files[paths.snapshotArtifact];

  requireIncludes(findings, paths.snapshotLoader, loader, 'parseGsvMonthlyChannelReport', 'Report loader must validate the external JSON boundary');
  requireIncludes(findings, paths.snapshotLoader, loader, '../_content/gsv-monthly-channel-report-parser', 'Report loader must use the shared snapshot parser');
  requireIncludes(findings, paths.snapshotParser, parser, 'report snapshot meta contract is invalid', 'Shared snapshot parser must retain meta validation');
  requireIncludes(findings, paths.content, files[paths.content], 'parseGsvMonthlyChannelReport', 'Build-time snapshot composition must use the shared parser');
  requireIncludes(findings, paths.snapshotLoader, loader, "cache: 'force-cache'", 'Versioned report JSON should use immutable browser caching');
  requireIncludes(findings, paths.snapshotArtifactCheck, files[paths.snapshotArtifactCheck], 'snapshot parity drift', 'Report artifact must keep a source parity check');

  try {
    const sourceSnapshot = JSON.parse(source);
    const publicSnapshot = JSON.parse(artifact);
    if (sourceSnapshot?.meta?.id !== 'gsv-monthly-channel-2026-ytd-05') {
      findings.push(`${paths.contentData}: versioned source snapshot meta id drifted`);
    }
    if (publicSnapshot?.meta?.id !== 'gsv-monthly-channel-2026-ytd-05') {
      findings.push(`${paths.snapshotArtifact}: versioned snapshot meta id drifted`);
    }
    for (const composedField of [
      'operatingPriorities',
      'evidenceStatus',
      'referenceBands',
      'insights',
      'actions',
      'methodologyNotes',
    ]) {
      if (Object.hasOwn(sourceSnapshot, composedField)) {
        findings.push(`${paths.contentData}: composed field ${composedField} must stay in its focused TypeScript owner`);
      }
    }
  } catch (error) {
    findings.push(`GSV report source/public JSON is invalid (${error.message})`);
  }
}

function requireIncludes(findings, filePath, source, needle, message) {
  if (!source.includes(needle)) {
    findings.push(`${message}: ${filePath} must include ${JSON.stringify(needle)}.`);
  }
}
