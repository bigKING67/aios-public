import type {
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
} from './content-assets-types';

export interface ContentAssetAnalysisOption {
  key: ContentAssetAnalysisProfile;
  source: ContentAssetAnalysisSource;
  profile: ContentAssetAnalysisProfile;
  title: string;
  helper: string;
  badge: string;
}

export const CONTENT_ASSET_ANALYSIS_OPTIONS: ContentAssetAnalysisOption[] = [
  {
    key: 'preview_fast',
    source: 'preview',
    profile: 'preview_fast',
    title: '快速分析',
    helper: '默认策略。使用预览视频控成本、响应快，适合批量标签与初筛。',
    badge: '预览视频 · 每秒 1 帧',
  },
  {
    key: 'raw_deep',
    source: 'raw',
    profile: 'raw_deep',
    title: '原片深度',
    helper: '使用原片视频和深度推理，适合重点素材复盘、投放归因与复剪建议。',
    badge: '原片视频 · 每秒 2 帧',
  },
  {
    key: 'action_detail',
    source: 'raw',
    profile: 'action_detail',
    title: '动作细节',
    helper: '提高抽帧密度，适合快剪节奏、动作逻辑、风险点与镜头级诊断。',
    badge: '原片视频 · 每秒 5 帧',
  },
];
