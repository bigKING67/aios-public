COMMENT ON COLUMN ads.marketing_content_asset_sources.source_id IS
  '内容资产来源记录主键。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.asset_id IS
  '关联的内容资产 ID，可为空表示尚未落资产的来源线索。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.source_kind IS
  '来源类型：feishu_attachment、baidu_netdisk、douyin_link、feishu_link、manual_upload 或 other。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.source_url IS
  '来源链接地址，例如飞书、外部视频、网盘或平台素材 URL。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.source_title IS
  '来源记录标题或素材标题。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_file_token IS
  '飞书附件文件 token。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_spreadsheet_token IS
  '飞书电子表格 token。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_sheet_id IS
  '飞书来源 sheet ID。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_sheet_name IS
  '飞书来源 sheet 名称。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_row_index IS
  '飞书来源行号。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.feishu_cell_ref IS
  '飞书来源单元格引用。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.external_platform IS
  '外部来源平台编码，例如 qianchuan、douyin 或 feishu。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.external_status IS
  '外部来源处理状态：ingested、pending_manual_upload、ignored 或 failed。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.metadata IS
  '来源补充元数据 JSON，保存原始行、排行、采集页、CDN 证据和导入上下文。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.created_at IS
  '来源记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_sources.updated_at IS
  '来源记录最近更新时间，由更新时间触发器维护。';

COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_id IS
  '内容资产字幕记录 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.asset_id IS
  '关联的内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.source_object_key IS
  '用于生成字幕的源媒体对象 key。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_object_key IS
  '转写结果 JSON 对象 key。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.provider IS
  '转写或视频理解服务商编码。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.model IS
  '生成字幕所使用的模型名称。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.language IS
  '识别或生成的语言编码。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.status IS
  '字幕记录状态：active、superseded、deleted 或 failed。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.transcript_text IS
  '完整转写文本。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.script_text IS
  '整理后的口播脚本文本，用于页面展示、复制和分析。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.srt_text IS
  '标准 SRT 字幕文本。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.segments IS
  '字幕分段 JSON，保存起止时间、文本和置信度。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.duration_seconds IS
  '字幕覆盖的媒体时长，单位为秒。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.word_count IS
  '脚本或转写文本字数统计。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.confidence IS
  '字幕识别整体置信度。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.metadata IS
  '字幕生成元数据 JSON，保存模型响应、输入策略、处理阶段和用量等明细。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.created_at IS
  '字幕记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_transcripts.updated_at IS
  '字幕记录最近更新时间，由更新时间触发器维护。';
