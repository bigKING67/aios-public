import {
  BarChartOutlined,
  FileImageOutlined,
  HomeOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export type ContentAssetsModuleKey =
  | 'home'
  | 'assets'
  | 'ai'
  | 'video'
  | 'review'
  | 'publish'
  | 'matching'
  | 'tasks'
  | 'stats'
  | 'settings';

// AI editing moved to the AI studio; the library keeps a transitional link for one release.
type ContentAssetsModuleNavItem =
  | { key: ContentAssetsModuleKey; label: string; icon: ReactNode; href?: undefined }
  | { key: 'production'; label: string; icon: ReactNode; href: string };

export const CONTENT_ASSETS_MODULE_GROUPS: Array<{
  title: string;
  items: ContentAssetsModuleNavItem[];
}> = [
  {
    title: '核心工作台',
    items: [
      { key: 'home', label: '首页', icon: <HomeOutlined /> },
      { key: 'assets', label: '素材库', icon: <FileImageOutlined /> },
      { key: 'production', label: 'AI 剪辑', icon: <VideoCameraOutlined />, href: ROUTE_PATHS.contentAiStudioEditing },
    ],
  },
  {
    title: '处理链路',
    items: [
      { key: 'ai', label: 'AI分析中心', icon: <RobotOutlined /> },
      { key: 'video', label: '视频处理', icon: <VideoCameraOutlined /> },
      { key: 'review', label: '内容审核', icon: <SafetyCertificateOutlined /> },
      { key: 'publish', label: '发布管理', icon: <SendOutlined /> },
      { key: 'matching', label: '回流匹配', icon: <LinkOutlined /> },
      { key: 'tasks', label: '协作任务', icon: <TeamOutlined /> },
    ],
  },
  {
    title: '资产运营',
    items: [
      { key: 'stats', label: '数据统计', icon: <BarChartOutlined /> },
      { key: 'settings', label: '系统设置', icon: <SettingOutlined /> },
    ],
  },
];

export const CONTENT_ASSETS_NAV_OPTIONS = CONTENT_ASSETS_MODULE_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => (item.href === undefined ? [{ label: item.label, value: item.key }] : []))
);
