import type {
  DouyinAttributionSectionDescriptor,
} from './platform-tab-douyin-section-list-contracts';
import type { DouyinSectionData } from './platform-tab-douyin-section-data';

type DouyinAttributionSectionVisibility = Pick<
  DouyinSectionData,
  'showDouyinLiveSection' | 'showDouyinShortvideoSection' | 'showDouyinCardSection'
>;

export function buildDouyinAttributionSectionList(
  visibility: DouyinAttributionSectionVisibility,
): DouyinAttributionSectionDescriptor[] {
  const sections: DouyinAttributionSectionDescriptor[] = [];

  if (visibility.showDouyinLiveSection) {
    sections.push({ kind: 'live' });
  }

  if (visibility.showDouyinShortvideoSection) {
    sections.push({ kind: 'shortvideo' });
  }

  if (visibility.showDouyinCardSection) {
    sections.push({ kind: 'card' });
  }

  return sections;
}
