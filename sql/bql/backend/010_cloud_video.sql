-- 视频云管家：我方成片元数据、近 30 天消耗与自动拆解资格。
-- 台式机 content_production.cloud_video_sync 定时拉取供应商列表写入本表，并在本地算出符合资格原片的文件哈希；
-- VPS 的 cloud_video_intake 据此建立 ads.marketing_content_assets 原片并排框架切段任务。
-- 原视频由云管家保存，这里只存路径与元数据；播放地址 = https://{host}{url_path}，外网、内网各一个 host。
-- 见 .trellis/tasks/10-29-remix-admission-pool/design.md。

CREATE SCHEMA IF NOT EXISTS cloud_video;

CREATE TABLE cloud_video.videos (
    video_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    video_type SMALLINT NOT NULL,
    one_level_type_id BIGINT,
    one_level_type_name TEXT,
    two_level_type_id BIGINT,
    two_level_type_name TEXT,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_choufen BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_at TIMESTAMPTZ,
    shot_at TIMESTAMPTZ,
    duration_seconds NUMERIC(10, 3),
    file_size BIGINT,
    raw_md5 TEXT,
    url_path TEXT NOT NULL,
    outer_host TEXT NOT NULL,
    inner_host TEXT NOT NULL,
    cover_path TEXT,
    cover_host TEXT,
    window_spend NUMERIC(14, 2),
    window_end DATE,
    eligibility TEXT,
    eligibility_reason TEXT,
    file_sha256 TEXT,
    hashed_at TIMESTAMPTZ,
    hash_error TEXT,
    asset_id UUID,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT videos_path_check CHECK (url_path ~ '^/[^?#]+$'),
    CONSTRAINT videos_host_check CHECK (outer_host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$' AND inner_host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'),
    CONSTRAINT videos_eligibility_check CHECK (eligibility IS NULL OR eligibility IN ('ge_5k', 'recent_ge_1k')),
    CONSTRAINT videos_sha256_check CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT videos_spend_check CHECK (window_spend IS NULL OR window_spend >= 0)
);

CREATE INDEX videos_eligible_idx ON cloud_video.videos (eligibility) WHERE eligibility IS NOT NULL;
CREATE INDEX videos_ready_idx ON cloud_video.videos (hashed_at) WHERE file_sha256 IS NOT NULL;
-- Several cloud videos can share one original when the vendor holds the same file twice.
CREATE INDEX videos_asset_idx ON cloud_video.videos (asset_id) WHERE asset_id IS NOT NULL;

-- One row per video and Beijing date: the near-30-day window spend seen that day (window ends the day before).
CREATE TABLE cloud_video.spend_daily (
    video_id BIGINT NOT NULL REFERENCES cloud_video.videos (video_id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    window_start DATE NOT NULL,
    window_end DATE NOT NULL,
    window_spend NUMERIC(14, 2) NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (video_id, stat_date),
    CONSTRAINT spend_daily_window_check CHECK (window_start <= window_end),
    CONSTRAINT spend_daily_spend_check CHECK (window_spend >= 0)
);

COMMENT ON SCHEMA cloud_video IS '视频云管家（供应商素材库）的我方成片镜像：只存元数据、路径与消耗，不存视频';
COMMENT ON TABLE cloud_video.videos IS '香粉等一级分类下的成片；eligibility 决定是否自动拆框架，file_sha256 由台式机下载后计算';
COMMENT ON COLUMN cloud_video.videos.url_path IS '外网与内网共用的文件路径；播放地址为 https://{outer_host|inner_host}{url_path}';
COMMENT ON COLUMN cloud_video.videos.window_spend IS '最近一次同步时的近 30 天抖音消耗（供应商原值，按元理解）';
COMMENT ON COLUMN cloud_video.videos.eligibility IS 'ge_5k：近 30 天消耗≥5000；recent_ge_1k：上传≤20 天、近 30 天消耗≥门槛（默认 1000）且非抽帧。业务的“满 20 天时原片消耗>5000 保留到 30 天”已含在 ge_5k 里：上传不满 30 天的原片，近 30 天消耗就是它的全部消耗';
COMMENT ON TABLE cloud_video.spend_daily IS '每天同步时看到的近 30 天窗口消耗，供准入与结构池按日期回看';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_gpu_node') THEN
        GRANT USAGE ON SCHEMA cloud_video TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.videos TO aios_gpu_node;
        GRANT SELECT, INSERT, UPDATE ON cloud_video.spend_daily TO aios_gpu_node;
    END IF;
END $$;
