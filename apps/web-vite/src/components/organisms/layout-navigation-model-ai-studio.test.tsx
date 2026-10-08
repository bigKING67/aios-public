import { describe, expect, it } from 'vitest';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { buildLayoutMenuItems, type LayoutMenuItems } from './layout-navigation-model';

function contentChildren(items: LayoutMenuItems) {
  const content = items.find((item) => item && 'key' in item && item.key === 'content');
  return content && 'children' in content && Array.isArray(content.children) ? content.children : [];
}

function childKeys(items: LayoutMenuItems) {
  return contentChildren(items).map((item) => (item && 'key' in item ? String(item.key) : ''));
}

describe('content hub AI studio navigation', () => {
  it('places AI 创作中心 between 素材库 and 直播中台 for signed-in accounts', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    });

    expect(childKeys(items)).toEqual([
      ROUTE_PATHS.marketingContentAssets,
      ROUTE_PATHS.contentAiStudio,
      ROUTE_PATHS.contentLiveCenter,
    ]);
  });

  it('opens in a new tab like its content hub siblings and marks studio sub-pages as current', () => {
    const items = buildLayoutMenuItems({
      pathname: `${ROUTE_PATHS.contentAiStudioEditing}/run-1`,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: true,
    });
    const studio = contentChildren(items).find((item) => item && 'key' in item && item.key === ROUTE_PATHS.contentAiStudio);

    expect(studio && 'className' in studio ? studio.className : '').toContain('is-current');
    const label = studio && 'label' in studio ? studio.label : null;
    expect(label && typeof label === 'object' && 'props' in label ? label.props : {}).toMatchObject({
      target: '_blank',
      to: ROUTE_PATHS.contentAiStudio,
    });
  });

  it('hides the studio entry from anonymous visitors', () => {
    const items = buildLayoutMenuItems({
      pathname: ROUTE_PATHS.home,
      permissions: [],
      roles: [],
      user: null,
      isAuthenticated: false,
    });

    expect(childKeys(items)).not.toContain(ROUTE_PATHS.contentAiStudio);
  });
});
