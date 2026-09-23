const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
});

function advisoryId(via) {
  if (typeof via.url === 'string') {
    const id = via.url.split('/').filter(Boolean).at(-1);
    if (id) {
      return id;
    }
  }
  return String(via.source ?? '').trim();
}

export function collectNpmAuditFindings(report) {
  const findings = [];
  for (const [packageName, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
    const advisoryEntries = (vulnerability.via ?? []).filter((via) => (
      via && typeof via === 'object' && !Array.isArray(via)
    ));
    if (advisoryEntries.length === 0) {
      findings.push({
        id: `package:${packageName}`,
        package: packageName,
        severity: vulnerability.severity,
        title: `Transitive vulnerability summary for ${packageName}`,
      });
      continue;
    }
    for (const via of advisoryEntries) {
      findings.push({
        id: advisoryId(via),
        package: packageName,
        severity: via.severity ?? vulnerability.severity,
        title: via.title ?? packageName,
      });
    }
  }
  return findings;
}

function validateException(exception, today) {
  for (const field of ['id', 'package', 'reason', 'owner', 'expiresOn', 'remediationTask']) {
    if (typeof exception?.[field] !== 'string' || exception[field].trim() === '') {
      return `npm exception must include non-empty ${field}`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(exception.expiresOn)) {
    return `npm exception ${exception.id} has invalid expiresOn ${exception.expiresOn}`;
  }
  if (exception.expiresOn < today) {
    return `npm exception ${exception.id} expired on ${exception.expiresOn}`;
  }
  return '';
}

export function evaluateNpmDependencyAudit({
  config,
  now = new Date(),
  report,
}) {
  const today = now.toISOString().slice(0, 10);
  const minimumSeverity = config?.minimumSeverity ?? 'high';
  const minimumRank = SEVERITY_RANK[minimumSeverity];
  const failures = [];
  if (!Number.isInteger(minimumRank)) {
    failures.push(`unsupported minimumSeverity ${minimumSeverity}`);
  }
  if (config?.version !== 1 || !Array.isArray(config?.npm)) {
    failures.push('dependency audit exception config must use version 1 with an npm array');
  }

  const exceptions = new Map();
  for (const exception of config?.npm ?? []) {
    const validationFailure = validateException(exception, today);
    if (validationFailure) {
      failures.push(validationFailure);
      continue;
    }
    const key = `${exception.package}:${exception.id}`;
    if (exceptions.has(key)) {
      failures.push(`duplicate npm exception ${key}`);
      continue;
    }
    exceptions.set(key, exception);
  }

  const usedExceptions = new Set();
  const actionable = collectNpmAuditFindings(report).filter((finding) => (
    (SEVERITY_RANK[finding.severity] ?? -1) >= (minimumRank ?? Number.POSITIVE_INFINITY)
  ));
  for (const finding of actionable) {
    const key = `${finding.package}:${finding.id}`;
    if (exceptions.has(key)) {
      usedExceptions.add(key);
      continue;
    }
    failures.push(`${finding.severity} ${finding.package} ${finding.id}: ${finding.title}`);
  }
  for (const key of exceptions.keys()) {
    if (!usedExceptions.has(key)) {
      failures.push(`unused npm exception ${key}; remove it or verify advisory identity drift`);
    }
  }

  return {
    actionable,
    allowed: [...usedExceptions],
    failures,
  };
}
