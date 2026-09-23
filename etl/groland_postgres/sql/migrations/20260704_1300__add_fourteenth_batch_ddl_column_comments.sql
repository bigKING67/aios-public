COMMENT ON COLUMN ads.marketing_content_assets.asset_id IS
  '营销内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_assets.title IS
  '内容资产标题，用于素材库列表、检索和运营识别。';
COMMENT ON COLUMN ads.marketing_content_assets.asset_type IS
  '资产类型：video、image、document 或 other。';
COMMENT ON COLUMN ads.marketing_content_assets.asset_status IS
  '资产处理状态：external_only、uploading、pending_processing、processing、ready、failed 或 archived。';
COMMENT ON COLUMN ads.marketing_content_assets.profile_status IS
  '资产资料完整度状态：incomplete、basic_complete、platform_bound、performance_ready 或 verified。';
COMMENT ON COLUMN ads.marketing_content_assets.lifecycle_status IS
  '资产运营生命周期状态：draft、waiting_analysis、testable、testing、scaling、repurpose、rejected 或 expired。';
COMMENT ON COLUMN ads.marketing_content_assets.source_type IS
  '资产来源类型，例如 manual_upload、feishu_bootstrap 或 yuntu_archive。';
COMMENT ON COLUMN ads.marketing_content_assets.source_platform IS
  '资产来源平台编码，例如 qianchuan、douyin、feishu 或 manual。';
COMMENT ON COLUMN ads.marketing_content_assets.source_url IS
  '资产来源链接地址。';
COMMENT ON COLUMN ads.marketing_content_assets.source_record_id IS
  '外部来源记录 ID，用于回溯导入行、平台素材或归档记录。';
COMMENT ON COLUMN ads.marketing_content_assets.source_sheet_id IS
  '飞书或表格来源 sheet ID。';
COMMENT ON COLUMN ads.marketing_content_assets.source_sheet_name IS
  '飞书或表格来源 sheet 名称。';
COMMENT ON COLUMN ads.marketing_content_assets.source_row_index IS
  '飞书或表格来源行号。';
COMMENT ON COLUMN ads.marketing_content_assets.external_only IS
  '是否只有外部链接或外部素材身份，未直接托管原始文件。';
COMMENT ON COLUMN ads.marketing_content_assets.bucket IS
  '资产默认对象存储桶名称。';
COMMENT ON COLUMN ads.marketing_content_assets.raw_object_key IS
  '原始素材文件对象 key。';
COMMENT ON COLUMN ads.marketing_content_assets.preview_object_key IS
  '预览视频或轻量预览文件对象 key。';
COMMENT ON COLUMN ads.marketing_content_assets.cover_object_key IS
  '封面图片对象 key。';
COMMENT ON COLUMN ads.marketing_content_assets.transcript_object_key IS
  '字幕或脚本转写结果对象 key。';
COMMENT ON COLUMN ads.marketing_content_assets.analysis_object_key IS
  'AI 分析结果对象 key。';
COMMENT ON COLUMN ads.marketing_content_assets.raw_sha256 IS
  '原始素材文件 SHA-256 校验值，用于去重和一致性校验。';
COMMENT ON COLUMN ads.marketing_content_assets.file_ext IS
  '原始素材文件扩展名。';
COMMENT ON COLUMN ads.marketing_content_assets.mime_type IS
  '原始素材 MIME 类型。';
COMMENT ON COLUMN ads.marketing_content_assets.duration_seconds IS
  '原始音视频时长，单位为秒。';
COMMENT ON COLUMN ads.marketing_content_assets.width IS
  '原始素材宽度，单位为像素。';
COMMENT ON COLUMN ads.marketing_content_assets.height IS
  '原始素材高度，单位为像素。';
COMMENT ON COLUMN ads.marketing_content_assets.file_size_bytes IS
  '原始素材文件大小，单位为字节。';
COMMENT ON COLUMN ads.marketing_content_assets.preview_size_bytes IS
  '预览文件大小，单位为字节。';
COMMENT ON COLUMN ads.marketing_content_assets.platform IS
  '资产默认投放或发布平台编码，兼容单平台筛选。';
COMMENT ON COLUMN ads.marketing_content_assets.product_name IS
  '资产默认关联产品名称，兼容单产品展示。';
COMMENT ON COLUMN ads.marketing_content_assets.creator_name IS
  '内容创作者或达人名称。';
COMMENT ON COLUMN ads.marketing_content_assets.owner_name IS
  '资产运营负责人名称。';
COMMENT ON COLUMN ads.marketing_content_assets.tags IS
  '资产运营标签列表。';
COMMENT ON COLUMN ads.marketing_content_assets.notes IS
  '资产运营备注。';
COMMENT ON COLUMN ads.marketing_content_assets.authorization_status IS
  '授权状态：unknown、authorized、pending、expired 或 restricted。';
COMMENT ON COLUMN ads.marketing_content_assets.commercial_use_allowed IS
  '是否允许商业投放或商业使用。';
COMMENT ON COLUMN ads.marketing_content_assets.repurpose_allowed IS
  '是否允许二创、混剪或复用。';
COMMENT ON COLUMN ads.marketing_content_assets.authorization_starts_at IS
  '授权开始日期。';
COMMENT ON COLUMN ads.marketing_content_assets.authorization_expires_at IS
  '授权到期日期。';
COMMENT ON COLUMN ads.marketing_content_assets.authorization_notes IS
  '授权范围、限制和补充说明。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_summary IS
  'AI 生成的素材内容摘要。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_score IS
  'AI 评估得分。';
COMMENT ON COLUMN ads.marketing_content_assets.roi IS
  '资产聚合投放 ROI。';
COMMENT ON COLUMN ads.marketing_content_assets.ctr IS
  '资产聚合点击率。';
COMMENT ON COLUMN ads.marketing_content_assets.cvr IS
  '资产聚合转化率。';
COMMENT ON COLUMN ads.marketing_content_assets.spend IS
  '资产聚合投放消耗金额。';
COMMENT ON COLUMN ads.marketing_content_assets.gmv IS
  '资产聚合成交金额。';
COMMENT ON COLUMN ads.marketing_content_assets.uploaded_by IS
  '上传人或导入系统标识。';
COMMENT ON COLUMN ads.marketing_content_assets.uploaded_at IS
  '素材上传或归档入库时间。';
COMMENT ON COLUMN ads.marketing_content_assets.created_at IS
  '资产记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_assets.updated_at IS
  '资产记录最近更新时间，由更新时间触发器维护。';
COMMENT ON COLUMN ads.marketing_content_assets.is_deleted IS
  '是否已软删除。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_analysis_source IS
  'AI 分析输入来源：preview、raw 或 auto。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_analysis_model IS
  'AI 分析使用的模型名称。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_analyzed_at IS
  'AI 分析完成时间。';
COMMENT ON COLUMN ads.marketing_content_assets.transcript_source IS
  '字幕生成输入来源：raw、preview 或 auto。';
COMMENT ON COLUMN ads.marketing_content_assets.transcript_model IS
  '字幕生成使用的模型名称。';
COMMENT ON COLUMN ads.marketing_content_assets.transcribed_at IS
  '字幕生成完成时间。';
COMMENT ON COLUMN ads.marketing_content_assets.script_excerpt IS
  '口播脚本摘要或节选。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_suggested_title IS
  'AI 建议的素材标题。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_suggested_tags IS
  'AI 建议的素材标签列表。';
COMMENT ON COLUMN ads.marketing_content_assets.ai_metadata_generated_at IS
  'AI 元数据建议生成时间。';
COMMENT ON COLUMN ads.marketing_content_assets.title_source IS
  '标题来源：manual、upload、feishu_row、file_name、ai_generated、row_fallback、token_fallback 或 unknown。';
COMMENT ON COLUMN ads.marketing_content_assets.tags_source IS
  '标签来源：manual、upload、feishu_row、ai_generated、mixed、empty 或 unknown。';
COMMENT ON COLUMN ads.marketing_content_assets.product_names IS
  '资产关联产品名称集合。';
COMMENT ON COLUMN ads.marketing_content_assets.sku_names IS
  '资产关联 SKU 名称集合。';
COMMENT ON COLUMN ads.marketing_content_assets.owner_user_id IS
  '资产运营负责人用户 ID。';
COMMENT ON COLUMN ads.marketing_content_assets.uploaded_by_user_id IS
  '上传人用户 ID。';
COMMENT ON COLUMN ads.marketing_content_assets.platform_names IS
  '资产可发布、归档或投放的平台列表。';
COMMENT ON COLUMN ads.marketing_content_assets.video_type IS
  '素材运营视频类型，例如 KOL 种草视频、KOC 挂车视频或店播视频。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene IS
  'KOL/KOC 内容场景类型一级分类。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene_group IS
  'KOL/KOC 内容大场景分类。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene_subtype IS
  'KOL/KOC 内容细分场景分类。';
