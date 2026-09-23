CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_updated_active
  ON ads.influencer_library (updated_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_name_trgm_active
  ON ads.influencer_library
  USING GIN (influencer_name gin_trgm_ops)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_influencer_id_trgm_active
  ON ads.influencer_library
  USING GIN (influencer_id gin_trgm_ops)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_tags_gin_active
  ON ads.influencer_library
  USING GIN (tags)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_owner_user_updated_active
  ON ads.influencer_library (owner_user_id, updated_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_created_by_updated_active
  ON ads.influencer_library (created_by_user_id, updated_at DESC, id DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_influencer_library_cooperation_updated_active
  ON ads.influencer_library (cooperation_status_norm, updated_at DESC, id DESC)
  WHERE is_deleted = FALSE;

COMMENT ON INDEX ads.idx_influencer_library_updated_active
IS '达人库默认列表索引：支持 active records 按更新时间倒序分页。';
COMMENT ON INDEX ads.idx_influencer_library_name_trgm_active
IS '达人库关键词模糊搜索索引：支持 influencer_name ILIKE 查询。';
COMMENT ON INDEX ads.idx_influencer_library_influencer_id_trgm_active
IS '达人库关键词模糊搜索索引：支持 influencer_id ILIKE 查询。';
COMMENT ON INDEX ads.idx_influencer_library_tags_gin_active
IS '达人库主播标签数组索引：为后续 tags overlap 筛选优化提供索引基础。';
COMMENT ON INDEX ads.idx_influencer_library_owner_user_updated_active
IS '达人库多人协作索引：支持按归属BD过滤后的默认更新时间排序。';
COMMENT ON INDEX ads.idx_influencer_library_created_by_updated_active
IS '达人库多人协作索引：支持按创建账号过滤后的默认更新时间排序。';
COMMENT ON INDEX ads.idx_influencer_library_cooperation_updated_active
IS '达人库筛选索引：支持按合作状态过滤后的默认更新时间排序。';
