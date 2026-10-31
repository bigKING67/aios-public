-- 视频云管家：团队产出（剪辑、编导的成片数、抖音消耗、直接成交）。
-- 台式机 content_production.cloud_video_team_sync 每天写入；AI 创作中心「团队产出」只读这些表。
-- 范围是全公司成片（videoType=0），与原片准入用的 videos / spend_daily / spend_by_day（只有一个一级分类、
-- 消耗来自日期列表）分开：这里的消耗和成交都只取 /openapi/video/relation/third/material/list 中巨量千川
-- （type=2）的记录，ROI 同源；日期列表的「抖音消耗」= 千川 + 新版巨量广告（type=0），只用于对账；
-- 其他平台的消耗单独存，不进 ROI。
-- 台式机角色只有 SELECT/INSERT/UPDATE，重读某天时把不再出现的行清零，不删除。
-- 见 .trellis/tasks/10-29-studio-team-output/design.md。

-- 每天一份用户列表快照：成片按上传当天这个人所在的团队、小组统计，换组不改历史。
CREATE TABLE cloud_video.account_snapshots (
    snapshot_date DATE NOT NULL,
    account_key TEXT NOT NULL,
    name TEXT NOT NULL,
    employee_id TEXT,
    role_name TEXT,
    team_id BIGINT,
    team_name TEXT,
    group_id BIGINT,
    group_name TEXT,
    state SMALLINT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (snapshot_date, account_key)
);
CREATE INDEX account_snapshots_account_idx ON cloud_video.account_snapshots (account_key, snapshot_date);

-- 「拍摄人/编导」标签组下的人名标签；account_key 为对应的用户（自动按唯一同名匹配，或人工指定）。
CREATE TABLE cloud_video.director_labels (
    label_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    state SMALLINT,
    account_key TEXT,
    mapping_source TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT director_labels_mapping_check CHECK (
        (account_key IS NULL AND mapping_source IS NULL)
        OR (account_key IS NOT NULL AND mapping_source IS NOT NULL AND mapping_source IN ('name_match', 'manual'))
    )
);

-- 全公司成片：作者即剪辑，director_label_ids 为视频上属于「拍摄人/编导」组的标签。
CREATE TABLE cloud_video.finished_videos (
    video_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    account_key TEXT,
    account_name TEXT,
    one_level_type_id BIGINT,
    one_level_type_name TEXT,
    two_level_type_id BIGINT,
    two_level_type_name TEXT,
    video_state_id BIGINT,
    video_state_name TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL,
    recycled_at TIMESTAMPTZ,
    director_label_ids BIGINT[] NOT NULL DEFAULT '{}',
    total_stat_cost NUMERIC(16, 2),
    total_stat_cost_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT finished_videos_cost_check CHECK (total_stat_cost IS NULL OR total_stat_cost >= 0)
);
CREATE INDEX finished_videos_upload_day_idx
    ON cloud_video.finished_videos (((uploaded_at AT TIME ZONE 'Asia/Shanghai')::DATE));
CREATE INDEX finished_videos_account_idx ON cloud_video.finished_videos (account_key);
CREATE INDEX finished_videos_directors_idx ON cloud_video.finished_videos USING GIN (director_label_ids);

-- 每条成片每个北京日期的投放数据：spend / pay_* 为关联接口当天巨量千川（type=2）记录之和；other_platform_spend
-- 为其他平台（新版巨量广告、百度、快手等）的消耗，只在当天有抖音消耗的成片上记录；list_spend 是日期列表的同日消耗，
-- 只用于对账。关联接口没有返回该视频时 spend 取 list_spend，pay_order_amount 留 NULL（未知，不当作 0）。
CREATE TABLE cloud_video.finished_spend_daily (
    video_id BIGINT NOT NULL REFERENCES cloud_video.finished_videos (video_id),
    stat_date DATE NOT NULL,
    spend NUMERIC(14, 2) NOT NULL,
    pay_order_amount NUMERIC(14, 2),
    pay_order_coupon_amount NUMERIC(14, 2),
    platform_subsidy_amount NUMERIC(14, 2),
    other_platform_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
    list_spend NUMERIC(14, 2) NOT NULL,
    relation_count INTEGER NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (video_id, stat_date),
    CONSTRAINT finished_spend_daily_amount_check CHECK (
        spend >= 0 AND list_spend >= 0 AND other_platform_spend >= 0 AND relation_count >= 0
        AND (pay_order_amount IS NULL OR pay_order_amount >= 0)
        AND (pay_order_coupon_amount IS NULL OR pay_order_coupon_amount >= 0)
        AND (platform_subsidy_amount IS NULL OR platform_subsidy_amount >= 0)
    )
);
CREATE INDEX finished_spend_daily_date_idx ON cloud_video.finished_spend_daily (stat_date);

-- 每天的同步结果：uploads = 当天上传的成片，spend = 当天的消耗与成交。只有 complete 的日期计入“数据完整”。
CREATE TABLE cloud_video.team_sync_days (
    kind TEXT NOT NULL,
    stat_date DATE NOT NULL,
    status TEXT NOT NULL,
    expected_total INTEGER,
    rows_written INTEGER NOT NULL DEFAULT 0,
    spend_gap NUMERIC(14, 2),
    error TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kind, stat_date),
    CONSTRAINT team_sync_days_kind_check CHECK (kind IN ('uploads', 'spend')),
    CONSTRAINT team_sync_days_status_check CHECK (status IN ('complete', 'incomplete', 'failed'))
);

COMMENT ON TABLE cloud_video.account_snapshots IS '视频云管家用户列表的每日快照（含停用），团队产出按上传当天的团队/小组归属';
COMMENT ON TABLE cloud_video.director_labels IS '「拍摄人/编导」标签组（parentLabelId 11535）的人名标签及其对应用户；manual 映射不被自动匹配覆盖';
COMMENT ON TABLE cloud_video.finished_videos IS '全公司成片元数据（作者 = 剪辑，编导 = 人名标签）；total_stat_cost 为列表累计值快照，不按日期切分';
COMMENT ON TABLE cloud_video.finished_spend_daily IS '成片每日巨量千川投放：消耗、直接成交（不扣退款）、券、补贴，另记其他平台消耗（供应商原值，按元理解）';
COMMENT ON TABLE cloud_video.team_sync_days IS '团队产出每日同步状态；页面据此区分“没有数据”和“还没同步完整”';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_gpu_node') THEN
        GRANT SELECT, INSERT, UPDATE ON cloud_video.account_snapshots TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.director_labels TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.finished_videos TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.finished_spend_daily TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.team_sync_days TO aios_gpu_node;
    END IF;
END $$;
