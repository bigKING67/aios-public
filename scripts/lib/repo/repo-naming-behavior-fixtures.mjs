import {
  auditRepoNamingFiles,
  formatRepoNamingFindings,
  listRepoNamingSourceFiles,
} from './repo-naming-core.mjs';

function runAudit(files) {
  const findings = auditRepoNamingFiles(Object.keys(files));
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: '[repo-naming] OK: repository naming contract holds.\n',
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatRepoNamingFindings(findings)}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runRepoNamingBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/app/_components/home-page.tsx': 'export function HomePage() { return null; }\n',
      'apps/web-vite/src/app/admin/users/_components/users-page-client.tsx': 'export function UsersPageClient() { return null; }\n',
      'apps/web-vite/src/app/dashboard/_components/dashboard-page-client.tsx': 'export function DashboardPageClient() { return null; }\n',
      'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard-shell.tsx': 'export function CreatorDashboardShell() { return null; }\n',
      'apps/web-vite/src/app/docs/docs-workspace.tsx': 'export function DocsWorkspace() { return null; }\n',
      'apps/web-vite/src/app/docs/docs-workspace.test.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/docs/docs-workspace.spec.tsx': 'export const ok = true;\n',
      'apps/web-vite/src/app/login/_components/login-page-client.tsx': 'export function LoginPageClient() { return null; }\n',
      'apps/web-vite/src/app/marketing/_components/marketing-page-content.tsx': 'export function MarketingPageContent() { return null; }\n',
      'apps/web-vite/src/app/marketing/content-assets/[assetId]/page.tsx': 'export default function ContentAssetDetailPage() { return null; }\n',
      'apps/web-vite/src/app/marketing/creator-library/page.tsx': 'export default function Page() { return null; }\n',
      'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-detail-drawer.tsx': 'export function CreatorLibraryDetailDrawer() { return null; }\n',
      'apps/web-vite/src/app/marketing/creator-library/_components/creator-library-detail-drawer.module.css': '.root { display: block; }\n',
      'apps/web-vite/src/app/marketing/creator-library/_lib/creator-library-api.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/ops/dataops/_components/dataops-hub-client.tsx': 'export function DataOpsHubClient() { return null; }\n',
      'apps/web-vite/src/app/ops/dataops/_components/dataops-status-tag.tsx': 'export function DataOpsStatusTag() { return null; }\n',
      'apps/web-vite/src/app/profile/_components/profile-page-client.tsx': 'export function ProfilePageClient() { return null; }\n',
      'apps/web-vite/src/app/reports/monthly/_components/monthly-report-client.tsx': 'export function MonthlyReportClient() { return null; }\n',
      'apps/web-vite/src/app/reports/monthly/_components/report-header.tsx': 'export function ReportHeader() { return null; }\n',
      'apps/web-vite/src/app/reports/weekly/_components/weekly-report-client.tsx': 'export function WeeklyReportClient() { return null; }\n',
      'apps/web-vite/src/app/reports/weekly/_components/tabs/weekly-table-cell-props.ts': 'export const ok = true;\n',
      'apps/web-vite/src/components/atoms/badge.tsx': 'export function Badge() { return null; }\n',
      'apps/web-vite/src/components/organisms/layout.tsx': 'export function Layout() { return null; }\n',
      'apps/web-vite/src/context/filter-context.tsx': 'export function FilterProvider() { return null; }\n',
      'apps/web-vite/src/hooks/use-auth.ts': 'export function useAuth() { return null; }\n',
      'apps/web-vite/src/hooks/use-weekly-report.ts': 'export function useWeeklyReport() { return null; }\n',
      'apps/web-vite/src/styles/light-theme/header.css': '.root { display: block; }\n',
      'scripts/checks/repo/naming.behavior.mjs': 'console.log("ok");\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'canonical lower-kebab files in enforced roots should pass');
      assertIncludes(result.stdout, 'repository naming contract holds', 'passing output should confirm the contract');
      assertNotIncludes(result.stderr, 'Non-canonical repository names', 'passing audit should not report findings');
    },
  );

  {
    const fixtureFiles = {
      'apps/web-vite/src/app/_components/home-page.tsx': '',
      'apps/web-vite/src/app/_components/home-page.test.snap': '',
      'apps/web-vite/src/app/_components/nested/private-panel.tsx': '',
      'apps/web-vite/src/app/dashboard/page.tsx': '',
      'apps/web-vite/src/styles/light-theme.css': '',
      'scripts/checks/repo/naming.behavior.mjs': '',
      'scripts/checks/repo/readme.md': '',
    };
    function fixtureStat(filePath) {
      if (Object.hasOwn(fixtureFiles, filePath)) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        };
      }
      const prefix = `${filePath}/`;
      if (Object.keys(fixtureFiles).some((file) => file.startsWith(prefix))) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        };
      }
      throw new Error(`missing fixture path: ${filePath}`);
    }
    function fixtureEntries(dirPath) {
      const prefix = `${dirPath}/`;
      const names = new Set();
      for (const file of Object.keys(fixtureFiles)) {
        if (!file.startsWith(prefix)) {
          continue;
        }
        const rest = file.slice(prefix.length);
        names.add(rest.split('/')[0]);
      }
      return [...names].map((name) => {
        const childPath = `${dirPath}/${name}`;
        const stat = fixtureStat(childPath);
        return {
          isDirectory: () => stat.isDirectory(),
          isFile: () => stat.isFile(),
          name,
        };
      });
    }

    assertEqual(
      listRepoNamingSourceFiles('/repo-fixture', {
        listDirEntries: fixtureEntries,
        statPath: fixtureStat,
      }).join(','),
      [
        'apps/web-vite/src/app/_components/home-page.tsx',
        'apps/web-vite/src/app/_components/nested/private-panel.tsx',
        'apps/web-vite/src/app/dashboard/page.tsx',
        'apps/web-vite/src/styles/light-theme.css',
        'scripts/checks/repo/naming.behavior.mjs',
      ].join(','),
      'listRepoNamingSourceFiles should scan enforced roots recursively and keep only source extensions',
    );
  }

  withFixture(
    {
      'apps/web-vite/src/app/_components/HomePage.tsx': 'export function HomePage() { return null; }\n',
      'apps/web-vite/src/app/admin/users/_components/UsersPageClient.tsx': 'export function UsersPageClient() { return null; }\n',
      'apps/web-vite/src/app/dashboard/_components/DashboardPageClient.tsx': 'export function DashboardPageClient() { return null; }\n',
      'apps/web-vite/src/app/dashboard/creator/_components/CreatorDashboardShell.tsx': 'export function CreatorDashboardShell() { return null; }\n',
      'apps/web-vite/src/app/marketing/creator-library/_components/CreatorLibraryDetailDrawer.tsx': 'export function CreatorLibraryDetailDrawer() { return null; }\n',
      'apps/web-vite/src/app/ops/dataops/_components/DataOpsHubClient.tsx': 'export function DataOpsHubClient() { return null; }\n',
      'apps/web-vite/src/app/reports/monthly/_components/MonthlyReportClient.tsx': 'export function MonthlyReportClient() { return null; }\n',
      'apps/web-vite/src/app/reports/weekly/_components/WeeklyReportClient.tsx': 'export function WeeklyReportClient() { return null; }\n',
      'apps/web-vite/src/components/atoms/Badge.tsx': 'export function Badge() { return null; }\n',
      'apps/web-vite/src/context/FilterContext.tsx': 'export function FilterProvider() { return null; }\n',
      'apps/web-vite/src/hooks/useAuth.ts': 'export function useAuth() { return null; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'PascalCase source files in migrated route domains should fail');
      assertIncludes(result.stderr, 'HomePage.tsx', 'newly enforced shared app component PascalCase filename should be reported');
      assertIncludes(result.stderr, 'UsersPageClient.tsx', 'newly enforced admin PascalCase filename should be reported');
      assertIncludes(result.stderr, 'DashboardPageClient.tsx', 'newly enforced dashboard PascalCase filename should be reported');
      assertIncludes(result.stderr, 'CreatorDashboardShell.tsx', 'newly enforced dashboard creator PascalCase filename should be reported');
      assertIncludes(result.stderr, 'CreatorLibraryDetailDrawer.tsx', 'PascalCase filename should be reported');
      assertIncludes(result.stderr, 'DataOpsHubClient.tsx', 'newly enforced DataOps PascalCase filename should be reported');
      assertIncludes(result.stderr, 'MonthlyReportClient.tsx', 'newly enforced monthly report PascalCase filename should be reported');
      assertIncludes(result.stderr, 'WeeklyReportClient.tsx', 'newly enforced weekly report PascalCase filename should be reported');
      assertIncludes(result.stderr, 'Badge.tsx', 'newly enforced component PascalCase filename should be reported');
      assertIncludes(result.stderr, 'FilterContext.tsx', 'newly enforced context PascalCase filename should be reported');
      assertIncludes(result.stderr, 'useAuth.ts', 'newly enforced hooks camelCase filename should be reported');
      assertIncludes(result.stderr, 'lower-kebab-case', 'failure should explain the canonical filename style');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/marketing/creator-library/_Components/creator-library-detail-drawer.tsx': 'export const bad = true;\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'non-canonical directory segments in migrated domains should fail');
      assertIncludes(result.stderr, '_Components', 'bad directory segment should be reported');
      assertIncludes(result.stderr, 'dynamic page segments may use "[paramName]"', 'failure should document the dynamic route exception');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/reports/daily/_components/DailyReportClient.tsx': 'export function DailyReportClient() { return null; }\n',
      'backend-rust/src/auth.rs': 'pub fn ok() {}\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'legacy frontend domains and ecosystem-specific files should stay out of the phased gate');
      assertNotIncludes(result.stderr, 'DailyReportClient.tsx', 'unmigrated legacy files should not fail yet');
    },
  );

  withFixture(
    {
      'scripts/checks/repo/RepoNaming.ts': 'export const bad = true;\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'repo governance checker files should follow the same lower-kebab naming rule');
      assertIncludes(result.stderr, 'RepoNaming.ts', 'repo checker filename drift should be reported');
    },
  );

  return 'phased lower-kebab roots pass, PascalCase files fail, directory drift fails, and legacy domains remain excluded.';
}
