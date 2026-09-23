COMMENT ON TABLE ads.creator_library_bd_identity IS
  '创作者库 BD 身份映射表：维护系统用户、用户名、展示名与业务 owner alias 的对应关系。';

COMMENT ON TABLE ads.influencer_library_follow_log IS
  '达人库跟进日志表：记录达人跟进备注、创建/更新人员与软删除审计信息。';

COMMENT ON TABLE ads.marketing_content_ad_materials IS
  '营销内容广告素材关联表：沉淀外部广告平台素材、账户、视频素材与内容资产的匹配关系。';

COMMENT ON TABLE ads.marketing_content_asset_events IS
  '营销内容资产事件表：记录资产上传、处理、绑定、归档等操作事件及上下文 payload。';

COMMENT ON TABLE ads.marketing_content_asset_import_runs IS
  '营销内容资产导入批次表：记录飞书或外部来源导入任务的范围、状态、统计与错误信息。';

COMMENT ON TABLE ads.marketing_content_asset_objects IS
  '营销内容资产对象表：记录原始文件、预览、封面、转写结果等存储对象及媒体元数据。';

COMMENT ON TABLE ads.marketing_content_asset_processing_jobs IS
  '营销内容资产处理任务表：承载预览、封面、字幕、分析等异步任务的队列状态与执行元数据。';

COMMENT ON TABLE ads.marketing_content_asset_sources IS
  '营销内容资产来源表：记录资产来自飞书、外部平台、手工上传等来源的定位信息。';

COMMENT ON TABLE ads.marketing_content_asset_transcripts IS
  '营销内容资产字幕表：保存音视频转写文本、标准 SRT、分段结果、模型信息与处理状态。';

COMMENT ON TABLE ads.marketing_content_assets IS
  '营销内容资产主表：统一管理素材资产生命周期、存储对象、AI 分析状态、业务分类和归属信息。';

COMMENT ON TABLE ads.marketing_content_platform_videos IS
  '营销内容平台视频映射表：维护内容资产与抖音、小红书等平台视频或笔记 ID 的绑定关系。';

COMMENT ON TABLE dwd.marketing_content_ad_material_stats_di IS
  'DWD-营销内容广告素材日指标表：按广告素材与内容资产维度沉淀投放消耗、曝光、点击、转化和 GMV 指标。';

COMMENT ON TABLE dwd.marketing_content_platform_video_stats_di IS
  'DWD-营销内容平台视频日指标表：按平台视频或笔记维度沉淀自然内容曝光、互动、点击和转化指标。';

COMMENT ON TABLE dws.marketing_content_asset_daily_summary IS
  'DWS-营销内容资产日汇总表：按资产、日期、平台和账户聚合素材投放与自然内容表现。';

COMMENT ON TABLE dws.marketing_content_asset_lifetime_summary IS
  'DWS-营销内容资产生命周期汇总表：按资产聚合累计表现及近 7/30 天投放效果。';

COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_upload_id IS
  'TOS 分片上传 uploadId：用于直播录屏断点续传；单次普通上传时为空。';

COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_part_size_bytes IS
  'TOS 分片上传单片大小（字节）：用于恢复录屏上传时保持分片边界一致。';

COMMENT ON COLUMN ads.douyin_live_session_recording_segments.multipart_expires_at IS
  '最近一批分片上传签名 URL 的过期时间：续传时会重新签发有效 URL。';
