import type {
  DocsPageKey,
  DocsPageModel,
  DocsSection,
  DocsWorkspaceSnapshot,
  NavItem,
} from './docs-workspace-contracts';

export function extractHashId(href: string): string {
  return href.startsWith('#') ? href.slice(1) : href;
}

function normalizePath(pathname: string, fallbackPath: string): string {
  return pathname.replace(/\/+$/, '') || fallbackPath;
}

export function resolveDocsPageKey(
  snapshot: DocsWorkspaceSnapshot,
  pathname: string,
): DocsPageKey {
  const homePath = snapshot.pages.home.path;
  const normalizedPath = normalizePath(pathname, homePath);
  const exactMatch = snapshot.pageLinks.find((item) => item.href === normalizedPath);
  const analysisPlansPath = snapshot.pages['analysis-plans'].path;
  if (normalizedPath.startsWith(`${analysisPlansPath}/`)) {
    return 'analysis-plans';
  }

  return exactMatch?.key ?? 'home';
}

export function resolveDocsPage(
  snapshot: DocsWorkspaceSnapshot,
  pathname: string,
): DocsPageModel {
  const normalizedPath = normalizePath(pathname, snapshot.pages.home.path);
  return snapshot.detailPages[normalizedPath]
    ?? snapshot.pages[resolveDocsPageKey(snapshot, normalizedPath)];
}

export function tocForSections(sections: DocsSection[]): NavItem[] {
  return sections.map((section) => ({
    href: `#${section.id}`,
    label: section.title,
  }));
}

export function sectionIdsForSections(sections: DocsSection[]): string[] {
  return Array.from(new Set(sections.map((section) => section.id)));
}
