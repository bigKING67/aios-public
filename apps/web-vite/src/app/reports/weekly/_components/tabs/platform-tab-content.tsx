import { PlatformTabDouyinContent } from './platform-tab-douyin-content';
import { PlatformTabTmallContent } from './platform-tab-tmall-content';
import { PlatformTabTrendContent } from './platform-tab-trend-content';
import {
  buildDouyinPlatformContentProps,
  buildTmallPlatformContentProps,
  buildTrendPlatformContentProps,
} from './platform-tab-content-adapters';
import type { PlatformTabContentProps } from './platform-tab-content-props';
import { resolvePlatformTabContentKind } from './platform-tab-content-routing';

export function PlatformTabContent(contentProps: PlatformTabContentProps) {
  const { isTmallPlatform, isDouyinPlatform } = contentProps;
  const contentKind = resolvePlatformTabContentKind({
    isTmallPlatform,
    isDouyinPlatform,
  });

  if (contentKind === 'tmall') {
    return (
      <PlatformTabTmallContent
        {...buildTmallPlatformContentProps(contentProps)}
      />
    );
  }

  if (contentKind === 'douyin') {
    return (
      <PlatformTabDouyinContent
        {...buildDouyinPlatformContentProps(contentProps)}
      />
    );
  }

  return (
    <PlatformTabTrendContent
      {...buildTrendPlatformContentProps(contentProps)}
    />
  );
}
