import type {
  DouyinLiveAttributionSubsectionDescriptor,
} from './platform-tab-douyin-live-section-contracts';

export function buildDouyinLiveAttributionSubsectionList():
  DouyinLiveAttributionSubsectionDescriptor[] {
  return [
    { kind: 'session' },
    { kind: 'funnel' },
  ];
}
