import type {
  DouyinShortvideoAttributionSubsectionDescriptor,
} from './platform-tab-douyin-shortvideo-section-contracts';

export function buildDouyinShortvideoAttributionSubsectionList():
  DouyinShortvideoAttributionSubsectionDescriptor[] {
  return [
    { kind: 'overview' },
    { kind: 'analysis' },
  ];
}
