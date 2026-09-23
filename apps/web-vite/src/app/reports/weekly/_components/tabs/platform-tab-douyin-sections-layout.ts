import type { DouyinSectionData } from './platform-tab-douyin-section-data';

type DouyinAttributionSectionVisibility = Pick<
  DouyinSectionData,
  'showDouyinLiveSection' | 'showDouyinShortvideoSection' | 'showDouyinCardSection'
>;

export interface DouyinAttributionSectionsLayout {
  hasAttributionSections: boolean;
  showEmptyAttributionSection: boolean;
}

export function resolveDouyinAttributionSectionsLayout(
  visibility: DouyinAttributionSectionVisibility,
): DouyinAttributionSectionsLayout {
  const hasAttributionSections =
    visibility.showDouyinLiveSection ||
    visibility.showDouyinShortvideoSection ||
    visibility.showDouyinCardSection;

  return {
    hasAttributionSections,
    showEmptyAttributionSection: !hasAttributionSections,
  };
}
