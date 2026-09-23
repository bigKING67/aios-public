import type {
  DouyinCardAttributionSubsectionDescriptor,
} from './platform-tab-douyin-card-section-contracts';

export function buildDouyinCardAttributionSubsectionList():
  DouyinCardAttributionSubsectionDescriptor[] {
  return [
    { kind: 'product' },
    { kind: 'source' },
    { kind: 'funnel' },
  ];
}
