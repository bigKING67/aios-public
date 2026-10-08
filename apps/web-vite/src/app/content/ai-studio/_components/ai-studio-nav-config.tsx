import {
  AppstoreOutlined,
  FileImageOutlined,
  HomeOutlined,
  PlaySquareOutlined,
  RobotOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export interface AiStudioNavItem {
  path: string;
  label: string;
  icon: ReactNode;
  /** Only match the exact path; the studio home must not stay active on child routes. */
  end?: boolean;
}

export interface AiStudioNavGroup {
  title: string;
  items: AiStudioNavItem[];
}

// Industry trends (/trends) stays routable but is intentionally absent until its
// data source is evaluated; AI generation has no entry until a real capability ships.
export const AI_STUDIO_NAV_GROUPS: AiStudioNavGroup[] = [
  {
    title: '核心工作台',
    items: [
      { path: ROUTE_PATHS.contentAiStudio, label: '首页', icon: <HomeOutlined />, end: true },
      { path: ROUTE_PATHS.contentAiStudioAssets, label: '原片', icon: <FileImageOutlined /> },
      { path: ROUTE_PATHS.contentAiStudioSegments, label: '片段素材', icon: <AppstoreOutlined /> },
      { path: ROUTE_PATHS.contentAiStudioOutputs, label: '成片', icon: <PlaySquareOutlined /> },
    ],
  },
  {
    title: '处理链路',
    items: [
      { path: ROUTE_PATHS.contentAiStudioAnalysis, label: 'AI 分析', icon: <RobotOutlined /> },
      { path: ROUTE_PATHS.contentAiStudioEditing, label: 'AI 剪辑', icon: <ScissorOutlined /> },
    ],
  },
];
