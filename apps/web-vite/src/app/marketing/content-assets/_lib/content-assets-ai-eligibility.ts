export const CONTENT_ASSET_AI_LONG_VIDEO_SECONDS = 30 * 60;

export const CONTENT_ASSET_LONG_VIDEO_AI_HELPER =
  '视频超过 30 分钟，不建议自动分析或抽脚本；请优先用于归档或人工查看。';

export function isLongFormContentAssetForAi(durationSeconds: number | null | undefined): boolean {
  return typeof durationSeconds === 'number' && durationSeconds >= CONTENT_ASSET_AI_LONG_VIDEO_SECONDS;
}
