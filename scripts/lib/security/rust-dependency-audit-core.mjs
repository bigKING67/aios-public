const PACKAGE_LINE = /^([A-Za-z0-9][A-Za-z0-9_-]*) v([^\s(]+)(?:\s|$)/u;

export function parseCargoTreePackages(cargoTree) {
  if (typeof cargoTree !== 'string' || cargoTree.trim() === '') {
    return {
      failures: ['cargo tree output is empty'],
      packages: new Set(),
    };
  }

  const packages = new Set();
  for (const rawLine of cargoTree.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }
    const match = PACKAGE_LINE.exec(line);
    if (match) {
      packages.add(`${match[1]}@${match[2]}`);
    }
  }

  return {
    failures: packages.size === 0
      ? ['cargo tree output contains no package identities']
      : [],
    packages,
  };
}

function normalizeVulnerability(entry, index) {
  const id = entry?.advisory?.id;
  const packageName = entry?.package?.name;
  const version = entry?.package?.version;
  if (
    typeof id !== 'string'
    || id.trim() === ''
    || typeof packageName !== 'string'
    || packageName.trim() === ''
    || typeof version !== 'string'
    || version.trim() === ''
  ) {
    return {
      failure: `cargo audit vulnerability ${index} is missing advisory/package identity`,
    };
  }
  return {
    finding: {
      id,
      package: packageName,
      title: typeof entry.advisory.title === 'string' ? entry.advisory.title : packageName,
      version,
    },
  };
}

function normalizeWarning(entry, group, index) {
  const packageName = entry?.package?.name;
  const version = entry?.package?.version;
  const kind = typeof entry?.kind === 'string' && entry.kind.trim() !== ''
    ? entry.kind
    : group;
  if (
    typeof packageName !== 'string'
    || packageName.trim() === ''
    || typeof version !== 'string'
    || version.trim() === ''
    || typeof kind !== 'string'
    || kind.trim() === ''
  ) {
    return {
      failure: `cargo audit warning ${group}[${index}] is missing kind/package identity`,
    };
  }
  return {
    finding: {
      id: typeof entry?.advisory?.id === 'string'
        ? entry.advisory.id
        : `${kind}:${packageName}`,
      kind,
      package: packageName,
      title: typeof entry?.advisory?.title === 'string'
        ? entry.advisory.title
        : `${kind} package warning`,
      version,
    },
  };
}

function collectAuditWarnings(report) {
  const warnings = report?.warnings;
  if (!warnings || typeof warnings !== 'object' || Array.isArray(warnings)) {
    return {
      failures: ['cargo audit report has an invalid warnings block'],
      findings: [],
    };
  }
  const failures = [];
  const findings = [];
  for (const [group, entries] of Object.entries(warnings)) {
    if (!Array.isArray(entries)) {
      failures.push(`cargo audit warning group ${group} is not an array`);
      continue;
    }
    entries.forEach((entry, index) => {
      const normalized = normalizeWarning(entry, group, index);
      if (normalized.failure) {
        failures.push(normalized.failure);
      } else {
        findings.push(normalized.finding);
      }
    });
  }
  return { failures, findings };
}

export function evaluateRustDependencyAudit({ cargoTree, report }) {
  const tree = parseCargoTreePackages(cargoTree);
  const failures = [...tree.failures];
  const active = [];
  const activeWarnings = [];
  const lockOnly = [];
  const lockOnlyWarnings = [];
  const vulnerabilityBlock = report?.vulnerabilities;
  const warnings = collectAuditWarnings(report);
  failures.push(...warnings.failures);

  if (
    !report?.database
    || !Number.isInteger(report.database['advisory-count'])
    || !report?.lockfile
    || !Number.isInteger(report.lockfile['dependency-count'])
  ) {
    failures.push('cargo audit report is missing database or lockfile evidence');
  }

  if (
    !vulnerabilityBlock
    || typeof vulnerabilityBlock.found !== 'boolean'
    || !Number.isInteger(vulnerabilityBlock.count)
    || !Array.isArray(vulnerabilityBlock.list)
  ) {
    failures.push('cargo audit report has an invalid vulnerabilities block');
    return {
      active,
      activeWarnings,
      failures,
      lockOnly,
      lockOnlyWarnings,
    };
  }

  if (vulnerabilityBlock.count !== vulnerabilityBlock.list.length) {
    failures.push(
      `cargo audit vulnerability count mismatch: ${vulnerabilityBlock.count} != ${vulnerabilityBlock.list.length}`,
    );
  }
  if (vulnerabilityBlock.found !== (vulnerabilityBlock.list.length > 0)) {
    failures.push('cargo audit vulnerability found flag does not match its finding list');
  }

  vulnerabilityBlock.list.forEach((entry, index) => {
    const normalized = normalizeVulnerability(entry, index);
    if (normalized.failure) {
      failures.push(normalized.failure);
      return;
    }
    const finding = normalized.finding;
    const identity = `${finding.package}@${finding.version}`;
    if (tree.packages.has(identity)) {
      active.push(finding);
      failures.push(
        `${finding.id} affects enabled dependency ${identity}: ${finding.title}`,
      );
      return;
    }
    lockOnly.push(finding);
  });

  for (const finding of warnings.findings) {
    const identity = `${finding.package}@${finding.version}`;
    if (tree.packages.has(identity)) {
      activeWarnings.push(finding);
      failures.push(
        `${finding.id} is an active ${finding.kind} warning for enabled dependency ${identity}: ${finding.title}`,
      );
    } else {
      lockOnlyWarnings.push(finding);
    }
  }

  return {
    active,
    activeWarnings,
    failures,
    lockOnly,
    lockOnlyWarnings,
  };
}
