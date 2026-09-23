import { resolveClientErrorMessage, resolveClientErrorStatus } from '@/lib/client-error';

export function resolveCreatorLibraryErrorDescription(error: unknown): string {
  const status = resolveClientErrorStatus(error);
  if (status === 404) {
    return '当前后端尚未加载达人库接口，请重启后端服务或部署最新版本。';
  }
  if (status === 500) {
    return '服务器已命中达人库接口，但数据库表可能尚未迁移，请确认 ads.influencer_library 已创建。';
  }
  return resolveClientErrorMessage(error, '请确认后端接口与数据库迁移已完成。');
}
