import { describe, expect, it, vi } from 'vitest';
import type { DocsPageKey, DocsPageModel } from './docs-workspace-contracts';
import {
  DOCS_WORKSPACE_SNAPSHOT_URL,
  loadDocsWorkspaceSnapshot,
  parseDocsWorkspaceSnapshot,
} from './docs-workspace-loader';
import { resolveDocsPage, resolveDocsPageKey } from './docs-workspace-model';

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

  it('keeps guide sub-pages, sidebar children and figures', () => {
    const snapshot = validSnapshot();
    snapshot.pageLinks[1] = { ...snapshot.pageLinks[1], children: [{ href: '/docs/guide/module', label: 'Module' }] } as never;
    (snapshot.detailPages as Record<string, DocsPageModel>)['/docs/guide/module'] = {
      ...page('guide'),
      path: '/docs/guide/module',
      sections: [{
        id: 'module',
        title: 'Module',
        figures: [{ src: '/docs-media/x.webp', alt: 'Screen' }],
        video: { src: '/docs-media/intro.mp4', poster: '/docs-media/intro.webp', title: 'Intro' },
      }],
    };
    const parsed = parseDocsWorkspaceSnapshot(snapshot);
    expect(parsed.pageLinks[1].children).toEqual([{ href: '/docs/guide/module', label: 'Module' }]);
    expect(resolveDocsPageKey(parsed, '/docs/guide/module/')).toBe('guide');
    expect(resolveDocsPage(parsed, '/docs/guide/module').sections[0].figures).toEqual([
      { src: '/docs-media/x.webp', alt: 'Screen', caption: undefined },
    ]);
    expect(resolveDocsPage(parsed, '/docs/guide/module').sections[0].video?.src).toBe('/docs-media/intro.mp4');
    // An unknown guide sub-page falls back to the guide overview.
    expect(resolveDocsPage(parsed, '/docs/guide/missing').path).toBe('/docs/guide');

    const invalid = validSnapshot();
    invalid.pages.home.sections[0] = { id: 'bad', title: 'Bad', figures: [{ src: '/x.webp' }] } as never;
    expect(() => parseDocsWorkspaceSnapshot(invalid)).toThrow('docsWorkspace.pages.home.sections[0].figures[0].alt must be a string');
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
