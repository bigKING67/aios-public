BEGIN;

CREATE TABLE IF NOT EXISTS ads.influencer_library_follow_log (
  id BIGSERIAL PRIMARY KEY,
  influencer_library_id BIGINT NOT NULL REFERENCES ads.influencer_library(id) ON DELETE CASCADE,
  followed_at DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE),
  follow_note TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by TEXT,
  deleted_by_user_id TEXT,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  CONSTRAINT chk_influencer_library_follow_log_note_not_blank CHECK (BTRIM(follow_note) <> '')
);

COMMENT ON TABLE ads.influencer_library_follow_log
IS '营销达人库跟进历史表。每行是一条达人跟进记录，列表页的最近跟进由最新未删除记录回填到 ads.influencer_library。';
COMMENT ON COLUMN ads.influencer_library_follow_log.influencer_library_id
IS '关联 ads.influencer_library.id。';
COMMENT ON COLUMN ads.influencer_library_follow_log.followed_at
IS '跟进日期。页面新增跟进时默认使用北京时间当前日期。';
COMMENT ON COLUMN ads.influencer_library_follow_log.follow_note
IS '本次跟进记录内容。';
COMMENT ON COLUMN ads.influencer_library_follow_log.created_by_user_id
IS '创建该跟进记录的账号 ID。NULL 表示由旧主档跟进备注迁移生成的公共历史。';
COMMENT ON COLUMN ads.influencer_library_follow_log.is_deleted
IS '软删除标记。删除历史记录后会重算达人主档最近跟进快照。';
COMMENT ON COLUMN ads.influencer_library.next_follow_at
IS '已废弃：旧版下次跟进日期字段。当前达人库以 ads.influencer_library_follow_log 作为跟进历史真相源。';

CREATE INDEX IF NOT EXISTS idx_influencer_library_follow_log_creator_active
  ON ads.influencer_library_follow_log (
    influencer_library_id,
    followed_at DESC,
    created_at DESC,
    id DESC
  )
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_follow_log_created_by_user_id
  ON ads.influencer_library_follow_log (created_by_user_id)
  WHERE is_deleted = FALSE;

CREATE OR REPLACE FUNCTION ads.fn_touch_influencer_library_follow_log_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_influencer_library_follow_log_updated_at
  ON ads.influencer_library_follow_log;

CREATE TRIGGER trg_touch_influencer_library_follow_log_updated_at
BEFORE UPDATE ON ads.influencer_library_follow_log
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_influencer_library_follow_log_updated_at();

COMMENT ON TRIGGER trg_touch_influencer_library_follow_log_updated_at
ON ads.influencer_library_follow_log
IS '更新跟进历史行时自动刷新 updated_at。';

INSERT INTO ads.influencer_library_follow_log (
  influencer_library_id,
  followed_at,
  follow_note,
  created_by,
  updated_by,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  library.id,
  COALESCE(library.last_followed_at, library.updated_at::DATE, ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE)),
  COALESCE(NULLIF(BTRIM(library.follow_note), ''), '旧系统跟进记录'),
  COALESCE(NULLIF(BTRIM(library.updated_by), ''), NULLIF(BTRIM(library.created_by), ''), 'migration'),
  COALESCE(NULLIF(BTRIM(library.updated_by), ''), NULLIF(BTRIM(library.created_by), ''), 'migration'),
  COALESCE(library.updated_by_user_id, library.created_by_user_id),
  COALESCE(library.updated_by_user_id, library.created_by_user_id),
  COALESCE(library.updated_at, library.created_at, NOW()),
  COALESCE(library.updated_at, library.created_at, NOW())
FROM ads.influencer_library AS library
WHERE library.is_deleted = FALSE
  AND (
    library.last_followed_at IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(library.follow_note, '')), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM ads.influencer_library_follow_log AS existing
    WHERE existing.influencer_library_id = library.id
      AND existing.is_deleted = FALSE
  );

WITH latest_follow AS (
  SELECT DISTINCT ON (follow_log.influencer_library_id)
    follow_log.influencer_library_id,
    follow_log.followed_at,
    follow_log.follow_note
  FROM ads.influencer_library_follow_log AS follow_log
  WHERE follow_log.is_deleted = FALSE
  ORDER BY
    follow_log.influencer_library_id,
    follow_log.followed_at DESC,
    follow_log.created_at DESC,
    follow_log.id DESC
)
UPDATE ads.influencer_library AS library
SET
  last_followed_at = latest_follow.followed_at,
  follow_note = latest_follow.follow_note,
  updated_by = COALESCE(library.updated_by, 'migration'),
  updated_by_user_id = library.updated_by_user_id
FROM latest_follow
WHERE library.id = latest_follow.influencer_library_id
  AND library.is_deleted = FALSE;

COMMIT;
