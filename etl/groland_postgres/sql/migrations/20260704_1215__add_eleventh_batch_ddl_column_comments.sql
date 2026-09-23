COMMENT ON COLUMN ads.marketing_content_asset_events.event_id IS
  '内容资产事件记录主键。';
COMMENT ON COLUMN ads.marketing_content_asset_events.asset_id IS
  '关联的内容资产 ID，可为空表示系统级或导入级事件。';
COMMENT ON COLUMN ads.marketing_content_asset_events.event_type IS
  '事件类型编码，例如 transcript_completed、processing_job_worker_triggered 或 upload_completed。';
COMMENT ON COLUMN ads.marketing_content_asset_events.actor IS
  '触发事件的系统、worker 或用户标识。';
COMMENT ON COLUMN ads.marketing_content_asset_events.message IS
  '面向运营侧展示的事件说明文本。';
COMMENT ON COLUMN ads.marketing_content_asset_events.payload IS
  '事件上下文 JSON，保存任务 ID、模型、错误、对象存储 key 等结构化明细。';
COMMENT ON COLUMN ads.marketing_content_asset_events.created_at IS
  '事件记录创建时间。';

COMMENT ON COLUMN ads.marketing_content_asset_import_runs.run_id IS
  '内容资产导入批次 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.mode IS
  '导入运行模式：dry_run、sample_upload 或 full_upload。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.status IS
  '导入运行状态：requested、running、succeeded、failed 或 cancelled。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.source_url IS
  '导入来源地址，通常为飞书表格或文档 URL。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.spreadsheet_token IS
  '解析后的飞书电子表格 token。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.sheet_ids IS
  '本次导入覆盖的飞书 sheet ID 列表。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.dry_run_payload IS
  '导入预检或执行结果 JSON，包含样例候选、统计和触发来源等明细。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.total_rows IS
  '本次导入扫描到的源数据行数。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.attachment_count IS
  '本次导入识别到的附件数量。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.uploaded_count IS
  '本次导入成功上传或入库的内容资产数量。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.external_only_count IS
  '本次导入识别为仅外部链接、未直接上传附件的记录数量。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.skipped_count IS
  '本次导入因重复、规则过滤或无需处理而跳过的记录数量。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.failed_count IS
  '本次导入处理失败的记录数量。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.error_message IS
  '导入批次失败或取消时记录的错误说明。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.requested_by IS
  '发起导入的用户、API 或 worker 标识。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.started_at IS
  '导入批次开始处理时间。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.finished_at IS
  '导入批次结束处理时间。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.created_at IS
  '导入批次记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_import_runs.updated_at IS
  '导入批次记录最近更新时间，由更新时间触发器维护。';
