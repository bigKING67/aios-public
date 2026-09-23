export const EXPECTED_REPORT_ECHARTS = Object.freeze([
  { sectionId: 'business-overview', builder: 'buildMonthlyTrendOption' },
  { sectionId: 'platform-role', builder: 'buildPlatformGsvShareStructureOption' },
  { sectionId: 'tmall-driver', builder: 'buildTmallDriverDeltaRankOption' },
  { sectionId: 'douyin-channel', builder: 'buildDouyinChannelStackOption' },
  { sectionId: 'douyin-live', builder: 'buildDouyinLiveTopOption' },
  { sectionId: 'douyin-card', builder: 'buildDouyinCardSourceOption' },
  { sectionId: 'douyin-qianchuan', builder: 'buildDouyinQianchuanRoiOption' },
  { sectionId: 'douyin-short-video', builder: 'buildDouyinShortVideoTouchpointOption' },
]);

export const EXPECTED_STATIC_DOM_VISUAL_NAMES = Object.freeze([
  'PlatformMayReadinessBenchmark',
  'PromotionSignalEvidenceTable',
  'TmallProductContributionVisual',
  'TmallProductTrendVisualTable',
  'TmallProductDeltaContributionTable',
  'TmallProductAttributionMatrix',
  'TmallTrafficFlowVisual',
  'TmallTrafficSourceRoleVisual',
  'TmallTrafficProductSourceMatrix',
  'TmallTrafficSourceDeltaVisual',
  'TmallTrafficActionBoard',
  'TmallWanxiangtaiPaidSourceMeters',
  'PriorityImpactEvidenceMatrix',
]);

export const EXPECTED_EVIDENCE_DRAWER_SECTION_IDS = Object.freeze([
  'tmall-wanxiangtai',
  'tmall-driver',
  'douyin-channel',
  'douyin-live',
  'douyin-card',
  'douyin-qianchuan',
  'douyin-short-video',
  'business-actions',
]);

export const EXPECTED_ECHARTS_CHART_NODE_COUNT = EXPECTED_REPORT_ECHARTS.length;
export const EXPECTED_STATIC_DOM_VISUAL_COUNT = EXPECTED_STATIC_DOM_VISUAL_NAMES.length;
