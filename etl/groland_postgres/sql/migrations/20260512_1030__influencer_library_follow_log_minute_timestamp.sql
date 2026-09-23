BEGIN;

ALTER TABLE IF EXISTS ads.influencer_library_follow_log
  ALTER COLUMN followed_at TYPE TIMESTAMP WITHOUT TIME ZONE
  USING followed_at::TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE IF EXISTS ads.influencer_library_follow_log
  ALTER COLUMN followed_at SET DEFAULT date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai');

COMMENT ON COLUMN ads.influencer_library_follow_log.followed_at
IS '跟进时间。页面新增跟进时默认使用北京时间当前时间，精确到分钟。';

WITH latest_follow AS (
  SELECT DISTINCT ON (follow_log.influencer_library_id)
    follow_log.influencer_library_id,
    follow_log.followed_at::DATE AS last_followed_at,
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
  last_followed_at = latest_follow.last_followed_at,
  follow_note = latest_follow.follow_note,
  updated_by = COALESCE(library.updated_by, 'migration'),
  updated_by_user_id = library.updated_by_user_id
FROM latest_follow
WHERE library.id = latest_follow.influencer_library_id
  AND library.is_deleted = FALSE;

COMMIT;
