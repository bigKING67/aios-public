import { describe, expect, it, vi } from 'vitest';
import type { DocsPageKey, DocsPageModel } from './docs-workspace-contracts';
import {
  DOCS_WORKSPACE_SNAPSHOT_URL,
  loadDocsWorkspaceSnapshot,
  parseDocsWorkspaceSnapshot,
} from './docs-workspace-loader';

const pageKeys: DocsPageKey[] = [
  'home',
  'guide',
  'analysis-frameworks',
  'analysis-plans',
  'references',
];

function page(key: DocsPageKey): DocsPageModel {
  return {
    key,
    path: key === 'home' ? '/docs' : `/docs/${key}`,
    eyebrow: 'Docs',
    title: key,
    subtitle: 'Fixture',
    sections: [{ id: `${key}-section`, title: 'Section' }],
  };
}

function validSnapshot() {
  return {
    version: 1,
    pageLinks: pageKeys.map((key) => ({
      key,
      href: page(key).path,
      label: key,
      helper: 'Fixture',
    })),
    pages: Object.fromEntries(pageKeys.map((key) => [key, page(key)])),
    detailPages: {
      '/docs/analysis-plans/detail': {
        ...page('analysis-plans'),
        path: '/docs/analysis-plans/detail',
      },
    },
  };
}

describe('docs workspace snapshot boundary', () => {
  it('accepts the versioned docs snapshot contract', () => {
    const parsed = parseDocsWorkspaceSnapshot(validSnapshot());
    expect(parsed.pages.home.path).toBe('/docs');
    expect(parsed.detailPages['/docs/analysis-plans/detail'].sections).toHaveLength(1);
  });

  it('rejects invalid nested table rows', () => {
    const invalid = validSnapshot();
    invalid.pages.home.sections[0] = {
      id: 'invalid',
      title: 'Invalid',
      tables: [{ headers: ['Name'], rows: [[42]] }],
    } as never;
    expect(() => parseDocsWorkspaceSnapshot(invalid)).toThrow(
      'docsWorkspace.pages.home.sections[0].tables[0].rows[0] must be a string array',
    );
  });

  it('surfaces HTTP failures instead of rendering an empty workspace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadDocsWorkspaceSnapshot()).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledWith(DOCS_WORKSPACE_SNAPSHOT_URL, {
      cache: 'force-cache',
      signal: undefined,
    });
    vi.unstubAllGlobals();
  });
});
