COMMENT ON COLUMN ads.douyin_self_anchor_map.created_at IS
  '映射记录创建时间。';
COMMENT ON COLUMN ads.douyin_self_anchor_map.updated_at IS
  '映射记录最近更新时间。';

COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.manual_attr_id IS
  '人工维护字段记录主键。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.platform IS
  '平台标识，当前固定为 douyin。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.created_by_user_id IS
  '创建该人工维护记录的用户 ID。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.created_by_name IS
  '创建该人工维护记录的用户名称。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.updated_by_user_id IS
  '最近一次更新该人工维护记录的用户 ID。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.updated_by_name IS
  '最近一次更新该人工维护记录的用户名称。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.created_at IS
  '人工维护记录创建时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.updated_at IS
  '人工维护记录最近更新时间，由更新时间触发器维护。';
COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.is_deleted IS
  '是否已在页面执行软删除；true 表示不再参与短视频达人详情关联。';
