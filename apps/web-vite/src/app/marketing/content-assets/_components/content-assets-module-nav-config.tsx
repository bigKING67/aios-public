import { Bot, ChartColumn, FileImage, House, Link, Send, Settings, ShieldCheck, Users, Video } from 'lucide-react';
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
      { key: 'home', label: '首页', icon: <House size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'assets', label: '素材库', icon: <FileImage size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'production', label: 'AI 剪辑', icon: <Video size={14} strokeWidth={1.8} aria-hidden="true" />, href: ROUTE_PATHS.contentAiStudioEditing },
    ],
  },
  {
    title: '处理链路',
    items: [
      { key: 'ai', label: 'AI分析中心', icon: <Bot size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'video', label: '视频处理', icon: <Video size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'review', label: '内容审核', icon: <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'publish', label: '发布管理', icon: <Send size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'matching', label: '回流匹配', icon: <Link size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'tasks', label: '协作任务', icon: <Users size={14} strokeWidth={1.8} aria-hidden="true" /> },
    ],
  },
  {
    title: '资产运营',
    items: [
      { key: 'stats', label: '数据统计', icon: <ChartColumn size={14} strokeWidth={1.8} aria-hidden="true" /> },
      { key: 'settings', label: '系统设置', icon: <Settings size={14} strokeWidth={1.8} aria-hidden="true" /> },
    ],
  },
];

export const CONTENT_ASSETS_NAV_OPTIONS = CONTENT_ASSETS_MODULE_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => (item.href === undefined ? [{ label: item.label, value: item.key }] : []))
);
