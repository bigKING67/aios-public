BEGIN;

DROP INDEX IF EXISTS ads.idx_creator_live_trade_daily_anchor_date_norm;

CREATE INDEX IF NOT EXISTS idx_creator_live_trade_daily_platform_anchor_date
  ON ads.creator_live_trade_daily (platform, anchor_id, stat_date DESC);

DROP INDEX IF EXISTS ads.idx_creator_live_influencer_roster_influencer_id_norm;

CREATE INDEX IF NOT EXISTS idx_creator_live_influencer_roster_platform_influencer_id
  ON ads.creator_live_influencer_roster (platform, influencer_id);

COMMENT ON INDEX ads.idx_creator_live_trade_daily_platform_anchor_date
IS '直播达人事实按 platform+anchor_id+date 查询索引（看板关联键）。';

COMMENT ON INDEX ads.idx_creator_live_influencer_roster_platform_influencer_id
IS '直播达人名册按 platform+influencer_id 查询索引（看板关联键）。';

COMMIT;
