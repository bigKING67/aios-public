COMMENT ON COLUMN ads.marketing_content_asset_objects.object_id IS
  '内容资产存储对象记录 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.asset_id IS
  '关联的内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.object_role IS
  '对象角色：raw、preview、cover、frame、transcript、analysis 或 analysis_proxy。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.storage_provider IS
  '对象存储服务商编码，当前主要为 tos。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.bucket IS
  '对象所在存储桶名称。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.region IS
  '对象所在存储区域。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.object_key IS
  '对象存储 key，用于定位原片、预览、封面、字幕或分析结果文件。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.content_type IS
  '对象 MIME 类型。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.file_ext IS
  '对象文件扩展名。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.size_bytes IS
  '对象文件大小，单位为字节。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.sha256 IS
  '对象内容 SHA-256 校验值。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.etag IS
  '对象存储返回的 ETag 或等价版本标识。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.width IS
  '图片或视频对象宽度，单位为像素。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.height IS
  '图片或视频对象高度，单位为像素。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.duration_seconds IS
  '音视频对象时长，单位为秒。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.status IS
  '对象状态：active、missing、deleted 或 failed。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.metadata IS
  '对象补充元数据 JSON，保存来源、回填、模型、进度和处理证据等明细。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.created_at IS
  '对象记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_objects.updated_at IS
  '对象记录最近更新时间，由更新时间触发器维护。';

COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.job_id IS
  '内容资产异步处理任务 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.asset_id IS
  '任务所属内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.job_type IS
  '任务类型：preview、cover、frames、transcript 或 analysis。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.status IS
  '任务状态：queued、running、succeeded、failed 或 cancelled。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.attempts IS
  '任务已尝试执行次数。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.max_attempts IS
  '任务允许的最大执行尝试次数。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.input_object_key IS
  '任务输入对象 key，通常指向原片或待处理媒体文件。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.output_object_key IS
  '任务输出对象 key，任务成功后指向预览、封面、字幕或分析结果。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.error_message IS
  '任务失败或重试时记录的错误信息。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.metadata IS
  '任务执行元数据 JSON，保存处理阶段、进度、Prefect 触发信息、模型设置和请求人等明细。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.queued_at IS
  '任务进入队列时间。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.started_at IS
  '任务开始执行时间。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.finished_at IS
  '任务结束执行时间。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.created_at IS
  '任务记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_processing_jobs.updated_at IS
  '任务记录最近更新时间，由更新时间触发器维护。';
