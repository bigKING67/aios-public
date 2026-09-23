import {
  auditTrellisSpecFiles,
  formatTrellisSpecCompactFindings,
  formatTrellisSpecCompactWarning,
  summarizeTrellisSpecFiles,
} from './trellis-spec-compact-core.mjs';

function repeatLines(prefix, count) {
  return Array.from({ length: count }, (_unused, index) => `${prefix} ${index + 1}`).join('\n');
}

function runAudit(files) {
  const findings = auditTrellisSpecFiles(files);
  const summary = summarizeTrellisSpecFiles(files);
  if (findings.length === 0) {
    const warning = formatTrellisSpecCompactWarning(summary);
    return {
      status: 0,
      stdout: '[trellis-spec-compact] OK: compactness contract holds.\n',
      stderr: warning ? `${warning}\n` : '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatTrellisSpecCompactFindings(findings)}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runTrellisSpecCompactBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      '.trellis/spec/repo/aios-governance.md': [
        '# AIOS Governance',
        '',
        '- Keep Trellis specs short and pointer-based.',
        '- Do not paste cookies, tokens, passwords, large logs, or raw diffs.',
        '- FRONTEND_SMOKE_COOKIE_HEADER="[redacted]" is acceptable policy text.',
      ].join('\n'),
      '.trellis/spec/guides/cross-layer-thinking-guide.md': [
        '# Cross Layer Thinking Guide',
        '',
        repeatLines('- Stable upstream guide line', 150),
      ].join('\n'),
      'docs/ignored.md': `${repeatLines('ignored', 300)}\n`,
    },
    (result) => {
      assertEqual(result.status, 0, 'short specs, redacted values, and the large cross-layer guide should pass');
      assertIncludes(result.stdout, 'compactness contract holds', 'passing output should confirm the compactness contract');
      assertNotIncludes(result.stderr, 'violations were found', 'passing audit should not report findings');
    },
  );

  withFixture(
    Object.fromEntries(Array.from({ length: 11 }, (_unused, index) => [
      `.trellis/spec/repo/low-headroom-${index + 1}.md`,
      `${'x'.repeat(4800)}\n`,
    ])),
    (result) => {
      assertEqual(result.status, 0, 'spec totals below the hard limit should pass');
      assertIncludes(result.stderr, 'WARN: low total spec headroom', 'low headroom should emit a warning');
      assertIncludes(result.stderr, 'Largest specs:', 'warning should list the largest spec files');
      assertIncludes(result.stderr, 'low-headroom-1.md:4801', 'largest-file output should include byte counts');
    },
  );

  withFixture(
    Object.fromEntries(Array.from({ length: 13 }, (_unused, index) => [
      `.trellis/spec/repo/over-budget-${index + 1}.md`,
      `${'y'.repeat(4800)}\n`,
    ])),
    (result) => {
      assertEqual(result.status, 1, 'spec totals above the hard limit should fail');
      assertIncludes(result.stderr, 'total-size-budget', 'hard-limit failure should identify the total budget');
      assertIncludes(result.stderr, 'exceeds 58000 bytes', 'hard-limit failure should report the configured budget');
    },
  );

  withFixture(
    {
      '.trellis/spec/repo/too-long.md': `${repeatLines('- Repeated policy detail', 121)}\n`,
    },
    (result) => {
      assertEqual(result.status, 1, 'default specs over the line budget should fail');
      assertIncludes(result.stderr, 'too-long.md', 'oversized spec path should be reported');
      assertIncludes(result.stderr, 'file-size-budget', 'oversized spec should use the size-budget finding');
      assertIncludes(result.stderr, '120 lines', 'failure should explain the default line budget');
    },
  );

  withFixture(
    {
      '.trellis/spec/repo/secret.md': [
        '# Secret fixture',
        '',
        'Cookie: aios_session=fixturefixturefixturefixture; path=/',
        'Authorization: Bearer fixturefixturefixturefixturefixturefixture',
        'aios_access_token=fixturefixturefixturefixture',
        'password=fixturefixturefixture',
        '/Users/fixture/Library/Application Support/Google/Chrome/Default/Cookies',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'actual-looking cookie, bearer, token, and password values should fail');
      assertIncludes(result.stderr, 'secret-cookie-header', 'cookie headers should be reported');
      assertIncludes(result.stderr, 'secret-bearer-token', 'bearer tokens should be reported');
      assertIncludes(result.stderr, 'secret-token-assignment', 'token assignments should be reported');
      assertIncludes(result.stderr, 'secret-password-assignment', 'password assignments should be reported');
      assertIncludes(result.stderr, 'browser-profile-path', 'concrete Chrome profile paths should be reported');
    },
  );

  withFixture(
    {
      '.trellis/spec/frontend/browser-smoke.md': [
        '# Browser smoke fixture',
        '',
        'FRONTEND_SMOKE_COOKIE_HEADER="aios_session=fixturefixturefixturefixture"',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'actual FRONTEND_SMOKE_COOKIE_HEADER values should fail');
      assertIncludes(result.stderr, 'secret-cookie-env', 'cookie env values should be reported');
    },
  );

  withFixture(
    {
      '.trellis/spec/repo/diff.md': [
        '# Diff fixture',
        '',
        '```diff',
        'diff --git a/spec.md b/spec.md',
        repeatLines('+ changed line', 13),
        '```',
      ].join('\n'),
      '.trellis/spec/repo/log.md': [
        '# Log fixture',
        '',
        '```log',
        repeatLines('ERROR fixture line', 25),
        '```',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'large diff and log dumps should fail');
      assertIncludes(result.stderr, 'large-diff-block', 'large diff block should be reported');
      assertIncludes(result.stderr, 'large-log-block', 'large log block should be reported');
    },
  );

  return 'Trellis spec compact fixtures cover headroom warnings and fail for total/file budgets, secrets, diffs, and logs.';
}
