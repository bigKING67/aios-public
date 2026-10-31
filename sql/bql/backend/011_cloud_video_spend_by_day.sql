-- 视频云管家：每条成片每天的抖音消耗（P2 第二段：我方结构按所选日期的消耗加总、素材准入）。
-- spend_daily 存的是每天看到的近 30 天合计，不能按任意日期区间相加；这张表存单日消耗，
-- 由台式机同步按天查询（dyStatCostStartTime = dyStatCostEndTime = 那一天）写入。
-- 只存当天有消耗的成片；不在 cloud_video.videos 里的也存（门槛以下的成片同样有消耗），所以不建外键。
CREATE TABLE cloud_video.spend_by_day (
    video_id BIGINT NOT NULL,
    stat_date DATE NOT NULL,
    one_level_type_id BIGINT NOT NULL,
    spend NUMERIC(14, 2) NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (video_id, stat_date),
    CONSTRAINT spend_by_day_spend_check CHECK (spend >= 0)
);
CREATE INDEX spend_by_day_date_idx ON cloud_video.spend_by_day (stat_date);
-- 一天是否已完整同步：按天查询读到末页才写这一行，页面据此区分“没有消耗”和“还没同步”。
CREATE TABLE cloud_video.spend_days (
    stat_date DATE NOT NULL,
    one_level_type_id BIGINT NOT NULL,
    videos INTEGER NOT NULL,
    total_spend NUMERIC(16, 2) NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (stat_date, one_level_type_id),
    CONSTRAINT spend_days_count_check CHECK (videos >= 0 AND total_spend >= 0)
);
COMMENT ON TABLE cloud_video.spend_by_day IS '每条成片每个北京日期的抖音消耗（供应商原值，按元理解）；只存有消耗的';
COMMENT ON TABLE cloud_video.spend_days IS '已完整同步的日期：该日 spend_by_day 的条数与合计';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_gpu_node') THEN
        GRANT SELECT, INSERT, UPDATE ON cloud_video.spend_by_day TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.spend_days TO aios_gpu_node;
    END IF;
END $$;
