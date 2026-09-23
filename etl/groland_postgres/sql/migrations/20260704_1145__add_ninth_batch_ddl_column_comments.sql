COMMENT ON COLUMN ads.influencer_library.id IS
  '营销达人库记录主键。';
COMMENT ON COLUMN ads.influencer_library.platform IS
  '达人主要平台，来源为空时使用未分类。';
COMMENT ON COLUMN ads.influencer_library.influencer_name IS
  '达人名称，页面与筛选展示使用的主名称。';
COMMENT ON COLUMN ads.influencer_library.influencer_id IS
  '达人平台 ID，用于平台内去重和外部数据关联。';
COMMENT ON COLUMN ads.influencer_library.douyin_handle IS
  '抖音号或抖音主页账号标识。';
COMMENT ON COLUMN ads.influencer_library.phone IS
  '达人或商务联系手机号。';
COMMENT ON COLUMN ads.influencer_library.mcn IS
  '达人所属 MCN 机构名称。';
COMMENT ON COLUMN ads.influencer_library.category IS
  '达人类目或内容分类。';
COMMENT ON COLUMN ads.influencer_library.anchor_desc IS
  '达人定位、主播描述或人群标签原始文本。';
COMMENT ON COLUMN ads.influencer_library.anchor_level IS
  '达人层级，例如 S、A、B、C、D 等运营口径。';
COMMENT ON COLUMN ads.influencer_library.main_platform_fans IS
  '主平台粉丝量原始文本，保留飞书或页面输入口径。';
COMMENT ON COLUMN ads.influencer_library.main_platform_fans_count IS
  '主平台粉丝量解析数值，由原始文本解析生成。';
COMMENT ON COLUMN ads.influencer_library.sales_30d IS
  '近 30 天销售额原始文本，保留飞书或页面输入口径。';
COMMENT ON COLUMN ads.influencer_library.sales_30d_amount IS
  '近 30 天销售额解析金额，由原始文本解析生成。';
COMMENT ON COLUMN ads.influencer_library.sales_90d IS
  '近 90 天销售额原始文本，保留飞书或页面输入口径。';
COMMENT ON COLUMN ads.influencer_library.sales_90d_amount IS
  '近 90 天销售额解析金额，由原始文本解析生成。';
COMMENT ON COLUMN ads.influencer_library.tags IS
  '达人标签数组，来自飞书标签拆分或页面维护。';
COMMENT ON COLUMN ads.influencer_library.cooperation_status IS
  '合作状态原始文本，保留飞书或页面输入口径。';
COMMENT ON COLUMN ads.influencer_library.cooperation_desc IS
  '合作进展、合作模式或备注说明。';
COMMENT ON COLUMN ads.influencer_library.owner_name IS
  '达人内部负责人或 BD 名称。';
COMMENT ON COLUMN ads.influencer_library.is_cooperable IS
  '是否适合继续合作或跟进，供达人库汇总指标使用。';
COMMENT ON COLUMN ads.influencer_library.last_followed_at IS
  '最近一次有效跟进日期，由跟进日志最新记录回填。';
COMMENT ON COLUMN ads.influencer_library.next_follow_at IS
  '已废弃：旧版下次跟进日期字段，当前以跟进日志作为真相源。';
COMMENT ON COLUMN ads.influencer_library.follow_note IS
  '最近一次有效跟进备注，由跟进日志最新记录回填。';
COMMENT ON COLUMN ads.influencer_library.source_file_name IS
  '来源飞书文件名、CSV 文件名或导入文件名。';
COMMENT ON COLUMN ads.influencer_library.source_etl_loaded_at IS
  '来源 ODS 批次加载时间。';
COMMENT ON COLUMN ads.influencer_library.created_by IS
  '记录创建者展示名；飞书初始化记录为 migration。';
COMMENT ON COLUMN ads.influencer_library.updated_by IS
  '最近一次编辑、导入或迁移覆盖记录的操作者展示名。';
COMMENT ON COLUMN ads.influencer_library.created_at IS
  '达人库记录创建时间。';
COMMENT ON COLUMN ads.influencer_library.updated_at IS
  '达人库记录最近更新时间，由更新时间触发器维护。';
COMMENT ON COLUMN ads.influencer_library.owner_user_id IS
  '负责人绑定的系统用户 ID，由 BD 身份映射按 owner_name 回填。';
