import path from 'node:path';
import { readFileSync } from 'node:fs';

import {
  createFixtureWorkspace,
} from '../shared/gate-fixture-utils.mjs';
import {
  checkInlineVisualStyleAudit,
  formatInlineVisualStyleDebtSummary,
} from './inline-visual-style-audit.mjs';

export function runInlineVisualStyleAuditBehavior({
  allowlistPath,
  assertions,
  guardLabel,
  outOfScopeFile,
  outOfScopeMessage,
  passingFileCount,
  sourceDescription,
  sourceRoot,
  tempRepoPrefix,
}) {
  const { assertEqual, assertIncludes, assertNotIncludes } = assertions;

  function allowlistJson(allowed = []) {
    return JSON.stringify(
      {
        version: 1,
        description: `Fixture ${sourceDescription} inline visual-style budget.`,
        allowed,
      },
      null,
      2,
    );
  }

  function createTempRepo(options = {}) {
    const {
      allowlist = [],
      files = {},
    } = options;
    const fixture = createFixtureWorkspace({
      git: false,
      packageJson: { name: 'inline-visual-styles-fixture', private: true },
      prefix: tempRepoPrefix,
    });
    fixture.write({
      [allowlistPath]: `${allowlistJson(allowlist)}\n`,
      ...files,
    });
    fixture.sourceFiles = Object.keys(files)
      .filter((file) => file.startsWith(`${sourceRoot}/`) && /\.(?:tsx|jsx)$/.test(file))
      .sort();

    return fixture;
  }

  function runAudit(repoRoot, files) {
    const config = JSON.parse(fixtureRead(repoRoot, allowlistPath));
    const allowlist = new Map(config.allowed.map((entry) => [entry.path, entry]));
    const audit = checkInlineVisualStyleAudit({
      allowlist,
      files,
      repoRoot,
      sourceDescription,
    });
    return {
      audit,
      files,
      status: hasFailures(audit) ? 1 : 0,
      stderr: formatFailureOutput(audit),
      stdout: hasFailures(audit)
        ? ''
        : `[${guardLabel}] OK: scanned ${files.length} ${sourceDescription} files; ${formatInlineVisualStyleDebtSummary(audit.total)}\n`,
    };
  }

  function withTempRepo(options, assertion) {
    const fixture = createTempRepo(options);
    try {
      assertion(runAudit(fixture.repoRoot, fixture.sourceFiles));
    } finally {
      fixture.cleanup();
    }
  }

  const goodFile = `${sourceRoot}/GoodPage.tsx`;
  const badColorFile = `${sourceRoot}/BadColor.tsx`;
  const badBackgroundFile = `${sourceRoot}/BadBackground.tsx`;
  const legacyAllowedFile = `${sourceRoot}/LegacyAllowed.tsx`;
  const legacyExceededFile = `${sourceRoot}/LegacyExceeded.tsx`;
  const legacyStaleFile = `${sourceRoot}/LegacyStale.tsx`;
  const missingLegacyFile = `${sourceRoot}/MissingLegacy.tsx`;
  const legacyReducedFile = `${sourceRoot}/LegacyReduced.tsx`;
  const stringLiteralFile = `${sourceRoot}/StringLiteralPage.tsx`;
  const commentLiteralFile = `${sourceRoot}/CommentLiteralPage.tsx`;
  const templateLiteralFile = `${sourceRoot}/TemplateLiteralPage.tsx`;

  function fixtureRead(repoRoot, file) {
    return readFileSync(path.join(repoRoot, file), 'utf8');
  }

  function hasFailures(audit) {
    return audit.missingAllowlistEntries.length > 0
      || audit.reducedAllowlistCaps.length > 0
      || audit.staleAllowlistEntries.length > 0
      || audit.violations.length > 0;
  }

  function formatFailureOutput(audit) {
    const lines = [];
    if (audit.missingAllowlistEntries.length > 0) {
      lines.push(`[${guardLabel}] Found allowlist entries for missing files:`);
      for (const file of audit.missingAllowlistEntries) {
        lines.push(`- ${file}`);
      }
      lines.push('', `Remove stale entries from ${allowlistPath}.`);
    }
    if (audit.staleAllowlistEntries.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(`[${guardLabel}] Found allowlisted files with no inline visual styles:`);
      for (const file of audit.staleAllowlistEntries) {
        lines.push(`- ${file}`);
      }
      lines.push('', `Remove these entries from ${allowlistPath}.`);
    }
    if (audit.reducedAllowlistCaps.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(`[${guardLabel}] Found allowlist caps above current inline visual style counts:`);
      for (const entry of audit.reducedAllowlistCaps) {
        lines.push(`- ${entry.file}: current=${entry.count} cap=${entry.maxCount}`);
      }
      lines.push('', `Lower these caps in ${allowlistPath}.`);
    }
    if (audit.violations.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(`[${guardLabel}] ${sourceDescription} inline visual style violations found.`);
      lines.push(`[${guardLabel}] Prefer CSS Modules, Tailwind token aliases, or component props. Existing legacy inline visual styles are frozen and must not grow.`, '');
      for (const violation of audit.violations) {
        lines.push(`- ${violation.file}: ${violation.count} > ${violation.maxInlineVisualStyles}`);
        lines.push(`  ${violation.reason}`);
        for (const finding of violation.findings.slice(0, 8)) {
          lines.push(`  ${finding.file}:${finding.lineNumber}: ${finding.line}`);
        }
      }
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }

  withTempRepo(
    {
      files: {
        [goodFile]: `
export function GoodPage() {
  return <div style={{ width: '100%' }}>OK</div>;
}
`,
        [outOfScopeFile]: `
export function OutOfScope() {
  return <div style={{ color: 'red' }}>${outOfScopeMessage}</div>;
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 0, `non-visual ${sourceDescription} styles and out-of-scope files should pass`);
      assertIncludes(
        result.stdout,
        `scanned ${passingFileCount} ${sourceDescription} files; clean baseline; no frozen inline visual styles.`,
        'passing output should identify a zero inline-style budget as a clean baseline',
      );
    },
  );

  withTempRepo(
    {
      files: {
        [badColorFile]: `
export function BadColor() {
  return <div style={{ color: 'red' }}>Bad</div>;
}
`,
        [badBackgroundFile]: `
export function BadBackground() {
  return (
    <section
      style={{
        backgroundColor: 'red',
      }}
    >
      Bad
    </section>
  );
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'inline visual style violations should fail in one batched fixture');
      assertIncludes(
        result.stderr,
        `[${guardLabel}] ${sourceDescription} inline visual style violations found.`,
        'visual inline style violation header should be reported',
      );
      assertIncludes(
        result.stderr,
        `${badColorFile}: 1 > 0`,
        'non-allowlisted source file should exceed zero budget',
      );
      assertIncludes(
        result.stderr,
        `${badColorFile}:3: style={{ color: 'red' }}>Bad</div>;`,
        'failing line should be reported',
      );
      assertIncludes(
        result.stderr,
        `${badBackgroundFile}:5: style={{`,
        'multiline style opening line should be reported',
      );
    },
  );

  withTempRepo(
    {
      allowlist: [
        {
          path: legacyAllowedFile,
          maxInlineVisualStyles: 1,
          reason: 'legacy fixture keeps one inline visual style frozen',
        },
      ],
      files: {
        [legacyAllowedFile]: `
export function LegacyAllowed() {
  return <div style={{ color: 'red' }}>Allowed legacy</div>;
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 0, 'allowlisted frozen inline visual style should pass at cap');
      assertIncludes(
        result.stdout,
        `scanned 1 ${sourceDescription} files; 1 frozen inline visual styles.`,
        'allowlisted visual style count should be reported',
      );
    },
  );

  withTempRepo(
    {
      allowlist: [
        {
          path: legacyExceededFile,
          maxInlineVisualStyles: 1,
          reason: 'legacy fixture keeps one inline visual style frozen',
        },
      ],
      files: {
        [legacyExceededFile]: `
export function LegacyExceeded() {
  return (
    <div style={{ color: 'red' }}>
      <span style={{ fontSize: 12 }}>Too many</span>
    </div>
  );
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'allowlisted file exceeding cap should fail');
      assertIncludes(
        result.stderr,
        `${legacyExceededFile}: 2 > 1`,
        'cap growth should be reported',
      );
      assertIncludes(
        result.stderr,
        'inline visual styles exceeded frozen cap',
        'cap growth reason should be reported',
      );
    },
  );

  withTempRepo(
    {
      allowlist: [
        {
          path: legacyStaleFile,
          maxInlineVisualStyles: 1,
          reason: 'legacy fixture should be removed once clean',
        },
        {
          path: missingLegacyFile,
          maxInlineVisualStyles: 1,
          reason: 'legacy fixture points at a missing file',
        },
        {
          path: legacyReducedFile,
          maxInlineVisualStyles: 2,
          reason: 'legacy fixture cap should be lowered when debt shrinks',
        },
      ],
      files: {
        [legacyStaleFile]: `
export function LegacyStale() {
  return <div style={{ width: '100%' }}>No visual debt</div>;
}
`,
        [legacyReducedFile]: `
export function LegacyReduced() {
  return <div style={{ color: 'red' }}>Only one now</div>;
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'allowlist stale, missing, and reduced-cap maintenance should fail in one batched fixture');
      assertIncludes(
        result.stderr,
        'Found allowlist entries for missing files:',
        'missing allowlist header should be reported',
      );
      assertIncludes(result.stderr, missingLegacyFile, 'missing allowlist path should be reported');
      assertIncludes(
        result.stderr,
        'Found allowlisted files with no inline visual styles:',
        'stale allowlist header should be reported',
      );
      assertIncludes(result.stderr, legacyStaleFile, 'stale allowlist path should be reported');
      assertIncludes(
        result.stderr,
        'Found allowlist caps above current inline visual style counts:',
        'reduced cap header should be reported',
      );
      assertIncludes(result.stderr, 'current=1 cap=2', 'reduced cap detail should be reported');
    },
  );

  withTempRepo(
    {
      files: {
        [stringLiteralFile]: `
export function StringLiteralPage() {
  return <div style={{ width: '100%', content: 'color: red' }}>Not a style prop key</div>;
}
`,
        [commentLiteralFile]: `
// return <div style={{ color: 'red' }}>Commented example</div>;
/*
export function CommentBlock() {
  return <section style={{ backgroundColor: 'red' }}>Commented block</section>;
}
*/
export function CommentLiteralPage() {
  return <div style={{ width: '100%' }}>No visual inline style</div>;
}
`,
        [templateLiteralFile]: `
const example = \`
  <div style={{ color: 'red' }}>Template example only</div>
\`;

export function TemplateLiteralPage() {
  return <div style={{ width: '100%' }}>{example.length}</div>;
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 0, 'string, commented, and quoted style examples should not be over-blocked');
      assertNotIncludes(
        result.stderr,
        'inline visual style violations found',
        'string/comment/template false positives should not report violations',
      );
    },
  );
}
