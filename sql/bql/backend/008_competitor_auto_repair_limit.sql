-- A terminal repair still consumes its budget; concurrent schedulers cannot pay twice.
CREATE UNIQUE INDEX analyses_auto_repair_per_video
    ON competitor.analyses (aweme_id)
    WHERE requested_by = 'compass-auto-repair';

COMMENT ON INDEX competitor.analyses_auto_repair_per_video IS
    '每视频至多一次历史自动补全；人工重新分析独立，不删除历史来重置预算';
