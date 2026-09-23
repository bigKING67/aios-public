import {
  withFixtureWorkspace,
} from '../shared/gate-fixture-utils.mjs';
import {
  checkFrontendDesignEvolution,
  parseFrontendDesignEvolutionGitStatusLine,
} from './frontend-design-evolution-core.mjs';

function baseFixtureFiles(files = {}) {
  return {
    'DESIGN.md': '# Fixture Design\n\nCurrent baseline.\n',
    'apps/web-vite/src/app/page.tsx': 'export default function Page() { return null; }\n',
    'apps/web-vite/src/app/page.module.css': '.page { color: var(--text-primary); }\n',
    ...files,
  };
}

function entry(file, status = 'M') {
  return {
    file,
    isNew: /[A?R]/.test(status),
    source: 'fixture',
    status,
  };
}

function runCheck(repoRoot, options = {}) {
  return checkFrontendDesignEvolution({
    changedFilesEnv: '',
    requiredEnv: '',
    repoRoot,
    styleAuthorityModeEnv: '',
    ...options,
  });
}

function resultFor(files, entries, options = {}) {
  return withFixtureWorkspace(
    {
      files: baseFixtureFiles(files),
      git: false,
      packageJson: null,
      prefix: 'aios-design-evolution-',
    },
    ({ repoRoot }) => runCheck(repoRoot, {
      entries,
      ...options,
    }),
  );
}

function resultForChangedFilesEnv(files, changes, options = {}) {
  return withFixtureWorkspace(
    {
      files: baseFixtureFiles(files),
      git: false,
      packageJson: null,
      prefix: 'aios-design-evolution-',
    },
    ({ repoRoot }) => runCheck(repoRoot, {
      changedFilesEnv: changes.join('\n'),
      ...options,
    }),
  );
}

export function runFrontendDesignEvolutionBehaviorFixtures(assertions) {
  const { assertEqual, assertIncludes } = assertions;

  {
    const result = resultFor(
      {
        'apps/web-vite/src/app/page.module.css': '.page { color: var(--text-primary); padding: 16px; }\n',
      },
      [entry('apps/web-vite/src/app/page.module.css', 'M')],
    );
    assertEqual(result.status, 0, `ordinary existing route style edit should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'no design-evolution trigger found', 'non-evolution edit should report no trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
      },
      ['A:apps/web-vite/src/app/marketing/new-campaign/page.tsx'],
    );
    assertEqual(result.status, 1, 'new route page without DESIGN.md update should fail');
    assertIncludes(result.stderr, 'Design evolution requires DESIGN.md', 'failure should name DESIGN.md requirement');
    assertIncludes(result.stderr, 'apps/web-vite/src/app/marketing/new-campaign/page.tsx', 'failure should list new page trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
        'apps/web-vite/src/app/marketing/new-campaign/new-campaign.module.css': '.page { color: var(--text-primary); }\n',
      },
      [
        'A:apps/web-vite/src/app/marketing/new-campaign/page.tsx',
        'A:apps/web-vite/src/app/marketing/new-campaign/new-campaign.module.css',
      ],
      {
        styleAuthorityModeEnv: 'enforce',
      },
    );
    assertEqual(result.status, 0, `style_authority_mode=enforce should keep new route candidates on the current baseline\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, '2 candidate(s) explicitly classified under the current DESIGN.md baseline', 'enforce mode should report its auditable baseline classification');
    assertEqual(result.baselineCandidates.length, 2, 'enforce mode should return the reclassified candidate list');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
      },
      ['A:apps/web-vite/src/app/marketing/new-campaign/page.tsx'],
      {
        requiredEnv: '1',
        styleAuthorityModeEnv: 'enforce',
      },
    );
    assertEqual(result.status, 1, 'enforce mode must not override an explicit design evolution requirement');
    assertIncludes(result.stderr, 'explicit design evolution requirement', 'conflicting explicit evolution requirement should remain observable');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'DESIGN.md': '# Fixture Design\n\nCurrent baseline.\n\n## Campaign shell\n\nNew route language.\n',
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
      },
      [
        'A:apps/web-vite/src/app/marketing/new-campaign/page.tsx',
        'M:DESIGN.md',
      ],
    );
    assertEqual(result.status, 0, `new route page with DESIGN.md update should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'covered by DESIGN.md', 'passing output should report authority coverage');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/landing.module.css': '.hero { color: var(--text-primary); }\n',
      },
      ['A:apps/web-vite/src/app/marketing/new-campaign/landing.module.css'],
    );
    assertEqual(result.status, 1, 'new route-level CSS module without DESIGN.md should fail');
    assertIncludes(result.stderr, 'new route-level CSS module', 'failure should list route-level CSS trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/creator-library/creator-library.module.css': '.page { color: var(--text-primary); }\n',
        'apps/web-vite/src/app/marketing/creator-library/creator-library-shared.module.css': '.levelTag { color: var(--text-secondary); }\n',
      },
      [
        'M:apps/web-vite/src/app/marketing/creator-library/creator-library.module.css',
        'A:apps/web-vite/src/app/marketing/creator-library/creator-library-shared.module.css',
      ],
    );
    assertEqual(result.status, 0, `new structural shared CSS split should not force design evolution\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'no design-evolution trigger found', 'structural CSS split should stay in the non-evolution lane');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/creator-library/creator-library-shared.module.css': '.hero { color: var(--text-primary); }\n',
      },
      ['A:apps/web-vite/src/app/marketing/creator-library/creator-library-shared.module.css'],
    );
    assertEqual(result.status, 1, 'new shared route-level CSS without an existing shell split should still fail');
    assertIncludes(result.stderr, 'new route-level CSS module', 'shared CSS without a shell split should remain an evolution trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/reports/special/special-report-brand-management.module.css': '.section { color: var(--text-primary); }\n',
        'apps/web-vite/src/app/reports/special/special-report-brand-total.module.css': '.section { color: var(--text-secondary); }\n',
      },
      [
        'M:apps/web-vite/src/app/reports/special/special-report-brand-management.module.css',
        'A:apps/web-vite/src/app/reports/special/special-report-brand-total.module.css',
      ],
    );
    assertEqual(result.status, 0, `new sibling route CSS split with shared business prefix should not force design evolution\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'no design-evolution trigger found', 'sibling CSS split should stay in the non-evolution lane');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/reports/special/special-report-brand-management.module.css': '.section { color: var(--text-primary); }\n',
        'apps/web-vite/src/app/reports/special/hero-experiment.module.css': '.hero { color: var(--text-secondary); }\n',
      },
      [
        'M:apps/web-vite/src/app/reports/special/special-report-brand-management.module.css',
        'A:apps/web-vite/src/app/reports/special/hero-experiment.module.css',
      ],
    );
    assertEqual(result.status, 1, 'new unrelated route CSS beside a modified route stylesheet should still fail');
    assertIncludes(result.stderr, 'new route-level CSS module', 'unrelated sibling CSS should remain an evolution trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
      },
      ['apps/web-vite/src/app/marketing/new-campaign/page.tsx'],
    );
    assertEqual(result.status, 1, 'statusless explicit changed files should preserve legacy new-file detection');
    assertIncludes(result.stderr, 'Design evolution requires DESIGN.md', 'statusless explicit file should still probe HEAD when needed');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/marketing/new-campaign/page.tsx': 'export default function Campaign() { return null; }\n',
      },
      ['M:apps/web-vite/src/app/marketing/new-campaign/page.tsx'],
    );
    assertEqual(result.status, 0, `explicit M-prefixed changed files should use the no-HEAD-probe fast path\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'no design-evolution trigger found', 'M-prefixed explicit changed files should avoid git HEAD probes');
  }

  {
    const fixtureFiles = baseFixtureFiles();
    const changedFiles = [];
    for (let index = 0; index < 300; index += 1) {
      const file = `apps/web-vite/src/app/bulk/route-${index}/page.tsx`;
      fixtureFiles[file] = `export default function Page${index}() { return null; }\n`;
      changedFiles.push(file);
    }
    const result = withFixtureWorkspace(
      {
        files: fixtureFiles,
        git: true,
        packageJson: null,
        prefix: 'aios-design-evolution-bulk-',
      },
      (fixture) => {
        const { repoRoot } = fixture;
        fixture.run('git', ['config', 'user.email', 'fixture@example.invalid']);
        fixture.run('git', ['config', 'user.name', 'Fixture']);
        fixture.run('git', ['add', '.']);
        fixture.run('git', ['commit', '--quiet', '--no-gpg-sign', '-m', 'baseline']);
        fixture.write(Object.fromEntries(changedFiles.map((file, index) => [
          file,
          `export default function Page${index}() { return ${index}; }\n`,
        ])));
        return runCheck(repoRoot);
      },
    );
    assertEqual(result.status, 0, `bulk existing route edits should stay on the batched HEAD lookup path\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'scanned 300 changed files', 'bulk fixture should exercise many status-derived changed files');
    assertIncludes(result.stdout, 'no design-evolution trigger found', 'bulk existing route edits should not be misclassified as new pages');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'apps/web-vite/src/app/dashboard/_components/new-card.module.css': '.card { color: var(--text-primary); }\n',
      },
      ['A:apps/web-vite/src/app/dashboard/_components/new-card.module.css'],
    );
    assertEqual(result.status, 0, `new private component CSS module should not force design evolution\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  {
    const result = resultFor({}, [], {
      requiredEnv: '1',
    });
    assertEqual(result.status, 1, 'explicit design evolution requirement without DESIGN.md should fail');
    assertIncludes(result.stderr, 'explicit design evolution requirement', 'failure should explain explicit env trigger');
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'DESIGN.md': '# Fixture Design\n\nEvolved.\n',
      },
      ['M:DESIGN.md'],
      {
        styleAuthorityModeEnv: 'evolve',
      },
    );
    assertEqual(result.status, 0, `style_authority_mode=evolve with DESIGN.md update should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  {
    const result = resultForChangedFilesEnv(
      {
        'DESIGN.md': '# Fixture Design\n\nEvolved.\n',
        'apps/web-vite/src/app/reports/new-report/page.tsx': 'export default function NewReport() { return null; }\n',
        'apps/web-vite/src/styles/design-tokens.css': ':root { --text-primary: #111; }\n',
      },
      [
        'A:apps/web-vite/src/app/reports/new-report/page.tsx',
        'M:DESIGN.md',
        'M:apps/web-vite/src/styles/design-tokens.css',
      ],
    );
    assertEqual(result.status, 0, `explicit changed files should support status prefixes\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'supporting authority updates: apps/web-vite/src/styles/design-tokens.css', 'passing output should list supporting authority files');
  }

  {
    const parsed = parseFrontendDesignEvolutionGitStatusLine(' M DESIGN.md');
    assertEqual(parsed.file, 'DESIGN.md', 'git status parser should preserve leading status column for modified DESIGN.md');
    assertEqual(parsed.status, ' M', 'git status parser should preserve fixed-width status');
  }

  return 'ordinary edit, new page, enforce baseline classification, explicit evolution precedence, route CSS, structural shared CSS split, explicit fast-path changes, statusless changed files, private CSS, explicit evolve env, style authority mode, and explicit changed-files cases passed.';
}
