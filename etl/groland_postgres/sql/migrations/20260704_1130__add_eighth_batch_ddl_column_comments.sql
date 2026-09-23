COMMENT ON COLUMN ads.influencer_live_roster.id IS
  '直播达人名册快照记录主键。';
COMMENT ON COLUMN ads.influencer_live_roster.sequence_no IS
  '来源飞书名册中的排序序号。';
COMMENT ON COLUMN ads.influencer_live_roster.influencer_name IS
  '达人名称；来源为空时刷新过程写入未命名达人兜底值。';
COMMENT ON COLUMN ads.influencer_live_roster.influencer_id IS
  '达人平台 ID，用于与直播达人明细按平台和达人 ID 关联。';
COMMENT ON COLUMN ads.influencer_live_roster.anchor_desc IS
  '达人定位或主播描述，来自飞书直播达人名册。';
COMMENT ON COLUMN ads.influencer_live_roster.anchor_level IS
  '达人层级，例如 S、A 等飞书名册口径。';
COMMENT ON COLUMN ads.influencer_live_roster.platform IS
  '达人主要直播平台，后端查询会归一为抖音、天猫、小红书或多平台口径。';
COMMENT ON COLUMN ads.influencer_live_roster.main_platform_fans IS
  '主平台粉丝量文本，保留飞书名册原始展示口径。';
COMMENT ON COLUMN ads.influencer_live_roster.sales_30d IS
  '近 30 天销售额区间文本，保留飞书名册原始展示口径。';
COMMENT ON COLUMN ads.influencer_live_roster.sales_90d IS
  '近 90 天销售额区间文本，保留飞书名册原始展示口径。';
COMMENT ON COLUMN ads.influencer_live_roster.cooperation_status IS
  '合作状态原始文本，来自飞书直播达人名册。';
COMMENT ON COLUMN ads.influencer_live_roster.cooperation_desc IS
  '合作进展或备注说明，来自飞书直播达人名册。';
COMMENT ON COLUMN ads.influencer_live_roster.owner_name IS
  '内部负责人名称，来自飞书直播达人名册。';
COMMENT ON COLUMN ads.influencer_live_roster.source_file_name IS
  '来源飞书文件名或导入文件名。';
COMMENT ON COLUMN ads.influencer_live_roster.created_at IS
  'ADS 名册快照记录创建时间。';
COMMENT ON COLUMN ads.influencer_live_roster.updated_at IS
  'ADS 名册快照记录最近更新时间。';
