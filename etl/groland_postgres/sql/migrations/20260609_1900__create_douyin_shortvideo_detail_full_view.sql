BEGIN;

CREATE OR REPLACE VIEW ads.v_douyin_shortvideo_detail_full AS
SELECT
  d.*,
  ma.manual_attr_id,
  ma.scope_type AS manual_scope_type,
  ma.platform AS manual_platform,
  ma.author_douyin_id AS manual_author_douyin_id,
  ma.author_name_snapshot AS manual_author_name_snapshot,
  ma.video_id AS manual_video_id,
  ma.product_id AS manual_product_id,
  ma.fans_count AS manual_fans_count,
  ma.fans_count_updated_at AS manual_fans_count_updated_at,
  ma.creator_type AS manual_creator_type,
  ma.creator_fee_amount AS manual_creator_fee_amount,
  ma.creator_fee_type AS manual_creator_fee_type,
  ma.creator_fee_note AS manual_creator_fee_note,
  ma.created_by_user_id AS manual_created_by_user_id,
  ma.created_by_name AS manual_created_by_name,
  ma.updated_by_user_id AS manual_updated_by_user_id,
  ma.updated_by_name AS manual_updated_by_name,
  ma.created_at AS manual_created_at,
  ma.updated_at AS manual_updated_at,
  ma.is_deleted AS manual_is_deleted
FROM ads.douyin_shortvideo_detail d
LEFT JOIN LATERAL (
  SELECT
    ma.manual_attr_id,
    ma.scope_type,
    ma.platform,
    ma.author_douyin_id,
    ma.author_name_snapshot,
    ma.video_id,
    ma.product_id,
    ma.fans_count,
    ma.fans_count_updated_at,
    ma.creator_type,
    ma.creator_fee_amount,
    ma.creator_fee_type,
    ma.creator_fee_note,
    ma.created_by_user_id,
    ma.created_by_name,
    ma.updated_by_user_id,
    ma.updated_by_name,
    ma.created_at,
    ma.updated_at,
    ma.is_deleted
  FROM ads.douyin_shortvideo_creator_manual_attrs ma
  WHERE ma.platform = 'douyin'
    AND ma.is_deleted = FALSE
    AND ma.product_id = ''
    AND ma.author_douyin_id = NULLIF(d.author_douyin_id, '')
    AND ma.scope_type = 'video'
    AND ma.video_id = NULLIF(d.video_id, '')
  ORDER BY
    ma.updated_at DESC,
    ma.manual_attr_id DESC
  LIMIT 1
) ma ON TRUE;

COMMENT ON VIEW ads.v_douyin_shortvideo_detail_full IS
  '短视频挂车完整只读宽表视图：ads.douyin_shortvideo_detail 事实字段 + 素材库分类字段 + 页面按达人+视频维护字段。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.manual_fans_count IS
  '页面按达人+视频维护粉丝量，来自 ads.douyin_shortvideo_creator_manual_attrs。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.manual_creator_type IS
  '页面按达人+视频维护达人类型，来自 ads.douyin_shortvideo_creator_manual_attrs。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.manual_creator_fee_amount IS
  '页面按达人+视频维护合作费用金额，来自 ads.douyin_shortvideo_creator_manual_attrs。';

COMMIT;
