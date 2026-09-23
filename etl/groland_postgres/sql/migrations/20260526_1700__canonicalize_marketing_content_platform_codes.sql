UPDATE ads.marketing_content_assets
SET platform = CASE
  WHEN BTRIM(platform) IN ('抖音', 'douyin', 'dy') THEN 'douyin'
  WHEN BTRIM(platform) IN ('千川', '巨量千川', 'qianchuan') THEN 'qianchuan'
  WHEN BTRIM(platform) IN ('小红书', 'xhs', 'xiaohongshu', 'redbook') THEN 'xhs'
  WHEN BTRIM(platform) IN ('快手', 'kuaishou', 'ks') THEN 'kuaishou'
  WHEN BTRIM(platform) IN ('视频号', '微信视频号', 'wechat_channels', 'shipinhao') THEN 'wechat_channels'
  WHEN BTRIM(platform) IN ('其他', 'unknown', 'other') THEN 'other'
  ELSE BTRIM(platform)
END
WHERE platform IS NOT NULL
  AND BTRIM(platform) <> '';

UPDATE ads.marketing_content_platform_videos
SET platform = CASE
  WHEN BTRIM(platform) IN ('抖音', 'douyin', 'dy') THEN 'douyin'
  WHEN BTRIM(platform) IN ('千川', '巨量千川', 'qianchuan') THEN 'qianchuan'
  WHEN BTRIM(platform) IN ('小红书', 'xhs', 'xiaohongshu', 'redbook') THEN 'xhs'
  WHEN BTRIM(platform) IN ('快手', 'kuaishou', 'ks') THEN 'kuaishou'
  WHEN BTRIM(platform) IN ('视频号', '微信视频号', 'wechat_channels', 'shipinhao') THEN 'wechat_channels'
  WHEN BTRIM(platform) IN ('其他', 'unknown', 'other') THEN 'other'
  ELSE BTRIM(platform)
END
WHERE BTRIM(platform) <> '';

UPDATE ads.marketing_content_ad_materials
SET ad_platform = CASE
  WHEN BTRIM(ad_platform) IN ('千川', '巨量千川', 'qianchuan') THEN 'qianchuan'
  WHEN BTRIM(ad_platform) IN ('巨量', '巨量引擎', 'ocean_engine', 'oceanengine') THEN 'ocean_engine'
  WHEN BTRIM(ad_platform) IN ('小红书聚光', '聚光', 'xhs_juguang', 'xhsjuguang') THEN 'xhs_juguang'
  WHEN BTRIM(ad_platform) IN ('抖音', 'douyin', 'dy') THEN 'douyin'
  WHEN BTRIM(ad_platform) IN ('其他', 'unknown', 'other') THEN 'other'
  ELSE BTRIM(ad_platform)
END
WHERE BTRIM(ad_platform) <> '';

UPDATE dwd.marketing_content_ad_material_stats_di
SET ad_platform = CASE
  WHEN BTRIM(ad_platform) IN ('千川', '巨量千川', 'qianchuan') THEN 'qianchuan'
  WHEN BTRIM(ad_platform) IN ('巨量', '巨量引擎', 'ocean_engine', 'oceanengine') THEN 'ocean_engine'
  WHEN BTRIM(ad_platform) IN ('小红书聚光', '聚光', 'xhs_juguang', 'xhsjuguang') THEN 'xhs_juguang'
  WHEN BTRIM(ad_platform) IN ('抖音', 'douyin', 'dy') THEN 'douyin'
  WHEN BTRIM(ad_platform) IN ('其他', 'unknown', 'other') THEN 'other'
  ELSE BTRIM(ad_platform)
END
WHERE BTRIM(ad_platform) <> '';

UPDATE dwd.marketing_content_platform_video_stats_di
SET platform = CASE
  WHEN BTRIM(platform) IN ('抖音', 'douyin', 'dy') THEN 'douyin'
  WHEN BTRIM(platform) IN ('千川', '巨量千川', 'qianchuan') THEN 'qianchuan'
  WHEN BTRIM(platform) IN ('小红书', 'xhs', 'xiaohongshu', 'redbook') THEN 'xhs'
  WHEN BTRIM(platform) IN ('快手', 'kuaishou', 'ks') THEN 'kuaishou'
  WHEN BTRIM(platform) IN ('视频号', '微信视频号', 'wechat_channels', 'shipinhao') THEN 'wechat_channels'
  WHEN BTRIM(platform) IN ('其他', 'unknown', 'other') THEN 'other'
  ELSE BTRIM(platform)
END
WHERE BTRIM(platform) <> '';

COMMENT ON COLUMN ads.marketing_content_assets.platform IS
  'Canonical content platform code, e.g. douyin, qianchuan, xhs, kuaishou, wechat_channels, other.';
COMMENT ON COLUMN ads.marketing_content_platform_videos.platform IS
  'Canonical content platform code for external video/note/item identity.';
COMMENT ON COLUMN ads.marketing_content_ad_materials.ad_platform IS
  'Canonical ad platform code, e.g. qianchuan, ocean_engine, xhs_juguang, other.';
