BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_dashboard_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_dashboard(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_detail(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_creator_shortvideo_influencer_roster();

CREATE TABLE IF NOT EXISTS ads.douyin_shortvideo_creator_manual_attrs (
  manual_attr_id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL DEFAULT 'creator',
  platform TEXT NOT NULL DEFAULT 'douyin',
  author_douyin_id TEXT NOT NULL,
  author_name_snapshot TEXT,
  video_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  fans_count BIGINT,
  fans_count_updated_at DATE,
  creator_type TEXT,
  creator_fee_amount NUMERIC(18, 2),
  creator_fee_type TEXT,
  creator_fee_note TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  updated_by_user_id TEXT,
  updated_by_name TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_douyin_shortvideo_creator_manual_attrs_scope
    CHECK (scope_type IN ('creator', 'video')),
  CONSTRAINT chk_douyin_shortvideo_creator_manual_attrs_platform
    CHECK (platform = 'douyin'),
  CONSTRAINT chk_douyin_shortvideo_creator_manual_attrs_creator_scope
    CHECK (
      scope_type <> 'creator'
      OR (video_id = '' AND product_id = '')
    ),
  CONSTRAINT chk_douyin_shortvideo_creator_manual_attrs_fans_non_negative
    CHECK (fans_count IS NULL OR fans_count >= 0),
  CONSTRAINT chk_douyin_shortvideo_creator_manual_attrs_fee_non_negative
    CHECK (creator_fee_amount IS NULL OR creator_fee_amount >= 0)
);

COMMENT ON TABLE ads.douyin_shortvideo_creator_manual_attrs
  IS '短视频挂车达人页面人工维护字段扩展表：基于罗盘/短视频事实达人补充粉丝量、达人类型、达人费用等，不作为达人主数据源。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.scope_type
  IS '维护粒度：creator=达人级字段；video=达人+视频/商品级字段预留。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.author_douyin_id
  IS '罗盘/短视频事实表中的达人抖音ID，页面维护主键。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.author_name_snapshot
  IS '页面保存时的达人名称快照，仅用于审计和兜底展示。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.video_id
  IS '视频ID；达人级维护时为空字符串。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.product_id
  IS '商品ID；达人级维护时为空字符串。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.fans_count
  IS '人工维护粉丝量。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.fans_count_updated_at
  IS '粉丝量最近一次被页面维护的日期。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.creator_type
  IS '人工维护达人类型。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.creator_fee_amount
  IS '人工维护达人费用；不含千川消耗。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.creator_fee_type
  IS '达人费用类型或口径。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.creator_fee_note
  IS '达人费用备注。';

CREATE UNIQUE INDEX IF NOT EXISTS ux_douyin_shortvideo_creator_manual_attrs_key
  ON ads.douyin_shortvideo_creator_manual_attrs (
    scope_type,
    author_douyin_id,
    video_id,
    product_id
  );

CREATE INDEX IF NOT EXISTS idx_douyin_shortvideo_creator_manual_attrs_author
  ON ads.douyin_shortvideo_creator_manual_attrs (author_douyin_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_douyin_shortvideo_creator_manual_attrs_updated_at
  ON ads.douyin_shortvideo_creator_manual_attrs (updated_at DESC);

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_shortvideo_creator_manual_attrs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_douyin_shortvideo_creator_manual_attrs_updated_at
  ON ads.douyin_shortvideo_creator_manual_attrs;

CREATE TRIGGER trg_touch_douyin_shortvideo_creator_manual_attrs_updated_at
BEFORE UPDATE ON ads.douyin_shortvideo_creator_manual_attrs
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_shortvideo_creator_manual_attrs_updated_at();

DROP TABLE IF EXISTS ads.influencer_shortvideo_roster;

COMMIT;
