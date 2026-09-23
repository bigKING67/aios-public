import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export interface MarketingModule {
  key: string;
  label: string;
  title: string;
  description: string;
  points: readonly string[];
  hint: string;
  href: string;
}

export const MARKETING_MODULES = [
  {
    key: 'creator-library',
    label: '优先建设',
    title: '达人库',
    description: '沉淀达人画像、合作记录与复盘标签，支持后续快速选人和协同执行。',
    points: [
      '沉淀达人基础资料、合作记录和复盘标签，避免重复找人。',
      '统一记录内容方向、平台表现和合作备注，便于团队协同跟进。',
      '为后续选人、复投和活动复盘沉淀长期资产。',
    ],
    hint: '适合作为营销协同的核心资产库先落起来。',
    href: ROUTE_PATHS.marketingCreatorLibrary,
  },
  {
    key: 'industry-news',
    label: '持续跟踪',
    title: '行业资讯',
    description: '聚合行业动态、平台政策与竞品动作，帮助团队统一外部信息视角。',
    points: [
      '集中查看平台政策、竞品动作和重要行业变化。',
      '让策略判断基于同一份外部信息，而不是各自截图转发。',
    ],
    hint: '偏信息汇总与判断支持。',
    href: ROUTE_PATHS.marketingIndustryNews,
  },
] as const satisfies readonly MarketingModule[];
