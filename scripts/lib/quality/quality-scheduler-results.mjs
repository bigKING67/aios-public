function outputTail(text, maxLines = 40) {
  const lines = String(text ?? '').trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) {
    return lines.join('\n');
  }
  return lines.slice(-maxLines).join('\n');
}

export function summarizeResults(results) {
  const summary = {
    passed: 0,
    failed: 0,
    cached: 0,
    total: results.length,
  };
  for (const result of results) {
    if (result.status === 'pass') {
      summary.passed += 1;
    } else {
      summary.failed += 1;
    }
    if (result.cacheHit) {
      summary.cached += 1;
    }
  }
  return summary;
}

export function formatFailure(result) {
  return [
    `[fail] ${result.gate.name} ${result.durationMs}ms`,
    `command: ${result.command}`,
    result.stderr ? `stderr:\n${outputTail(result.stderr)}` : '',
    result.stdout ? `stdout:\n${outputTail(result.stdout)}` : '',
  ].filter(Boolean).join('\n');
}
