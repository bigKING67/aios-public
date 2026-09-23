import type { ContentAssetSort, ContentAssetTodoFilter } from './content-assets-types';

export const CONTENT_ASSET_SORT_OPTIONS: { label: string; value: ContentAssetSort }[] = [
  { label: '推荐排序', value: 'recommended' },
  { label: '最近更新', value: 'updated_desc' },
  { label: '最近上传', value: 'uploaded_desc' },
  { label: '标题排序', value: 'title_asc' },
  { label: 'ROI 优先', value: 'roi_desc' },
];

export const CONTENT_ASSET_EXTERNAL_OPTIONS = [
  { label: '全部素材', value: 'all' },
  { label: '已入库', value: 'false' },
  { label: '待补源', value: 'true' },
] as const;

export const CONTENT_ASSET_TODO_OPTIONS: { label: string; value: ContentAssetTodoFilter }[] = [
  { label: '待 AI 分析', value: 'missing_ai' },
  { label: '待生成脚本', value: 'missing_transcript' },
  { label: '待绑定视频 ID', value: 'missing_platform_video' },
  { label: '待绑定素材 ID', value: 'missing_ad_material' },
  { label: '授权待确认', value: 'authorization_unknown' },
  { label: '复剪权限待确认', value: 'repurpose_unknown' },
];
