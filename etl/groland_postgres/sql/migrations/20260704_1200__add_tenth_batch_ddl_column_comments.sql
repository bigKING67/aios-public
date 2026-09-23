COMMENT ON COLUMN ads.marketing_content_ad_materials.ad_material_id IS
  '广告素材关联记录主键。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.asset_id IS
  '关联的内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.platform_video_id IS
  '关联的平台视频记录 ID，可为空表示仅有广告素材身份。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.ad_platform IS
  '广告投放平台编码，例如 qianchuan。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.account_id IS
  '广告账户 ID。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.account_name IS
  '广告账户名称。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.advertiser_id IS
  '广告主或投放主体 ID。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.external_material_id IS
  '外部广告平台素材 ID，千川场景对应 material_id。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.external_video_id IS
  '外部广告平台视频 ID。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.material_name IS
  '广告素材名称。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.material_title IS
  '广告素材标题。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.material_cover_url IS
  '广告素材封面 URL。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.material_status IS
  '广告素材状态，未知时为 unknown。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.created_at_on_platform IS
  '广告素材在外部平台创建时间。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.first_seen_at IS
  '该广告素材关联首次被系统发现时间。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.last_seen_at IS
  '该广告素材关联最近一次被系统发现时间。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.relation_status IS
  '素材与内容资产的关联状态：active、pending_confirm、rejected 或 archived。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.source IS
  '关联来源：manual、api_upload、api_import、report_import 或 fuzzy_match_confirmed。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.confidence IS
  '素材与内容资产匹配置信度，数值越高表示匹配越可信。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.raw_payload IS
  '广告素材关联的原始导入、报表或匹配证据 JSON。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.created_at IS
  '广告素材关联记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_ad_materials.updated_at IS
  '广告素材关联记录最近更新时间，由更新时间触发器维护。';
