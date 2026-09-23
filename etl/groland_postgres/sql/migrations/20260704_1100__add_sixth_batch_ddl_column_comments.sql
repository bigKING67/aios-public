COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_system IS
  '来源系统标识，当前为 yuntu。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_task_name IS
  '来源采集任务名称，用于区分云图带货短视频和直播引流短视频采集任务。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.scrape_run_id IS
  '采集运行批次标识，来自 ODS scrape_run_id。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.industry_name IS
  '行业名称，来自千川行业素材榜页面。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.qianchuan_scene IS
  '千川场景编码，例如 qianchuan_live 或 qianchuan_short_video。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.video_type IS
  '视频类型编码，例如 goods_short_video 或 live_lead_short_video。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_page_number IS
  '来源榜单分页页码。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_item_index IS
  '来源榜单页内条目序号。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_page_url IS
  '来源榜单页面 URL。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.raw_exposure_count IS
  '页面原始曝光数文本，解析后写入 exposure_count。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_video_id IS
  '来源页面提取的视频 ID。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_material_id IS
  '来源页面提取的素材 ID。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.aweme_id IS
  '抖音 aweme_id，用于关联抖音视频实体。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.item_id IS
  '来源平台 item_id，用于关联平台侧素材条目。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.group_id IS
  '来源平台 group_id，用于关联同组视频或素材。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.douyin_video_url IS
  '抖音视频播放或详情 URL。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.duration_seconds IS
  '视频时长，单位为秒。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.width IS
  '视频画面宽度，单位为像素。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.height IS
  '视频画面高度，单位为像素。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_first_seen_at IS
  '来源素材首次被采集到的时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_archived_at IS
  '来源素材归档完成时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_failed_at IS
  '来源素材处理失败时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiratio.source_updated_at IS
  '来源素材在 ODS 中的更新时间。';
