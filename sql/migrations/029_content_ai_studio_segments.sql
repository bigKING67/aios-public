-- AI 创作中心：版本化片段分类预设与片段素材。Additive only; apply through the
-- ledger, never on API startup. Segments reference raw assets by id + content
-- hash and never copy media. btree_gist is a trusted extension (PostgreSQL 13+)
-- and backs the confirmed-interval exclusion constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE ads.content_segment_presets (
    preset_key TEXT NOT NULL CHECK (preset_key ~ '^[a-z][a-z0-9_]{0,63}$'),
    version INTEGER NOT NULL CHECK (version > 0),
    dimension TEXT NOT NULL CHECK (dimension IN ('framework', 'picture', 'custom')),
    name TEXT NOT NULL CHECK (LENGTH(name) BETWEEN 1 AND 100),
    labels JSONB NOT NULL
        CHECK (jsonb_typeof(labels) = 'array' AND jsonb_array_length(labels) BETWEEN 1 AND 50),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (preset_key, version)
);

INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
VALUES (
    'framework',
    1,
    'framework',
    '框架 v1',
    '[
      {"key":"mixed_voiceover","name":"混剪口播","definition":"一段连贯的口播或旁白贯穿，画面由多个不同来源的镜头快速剪切拼接（产品特写、上脸片段、模特/明星、对比画面等），剪切频繁、节奏快。"},
      {"key":"live_demo","name":"实拍内容","definition":"同一人物在同一场景中连续拍摄的实测/演示（展示包装、取量、质地、上脸、半脸对比、成妆），镜头较长且连贯，通常是一个人边做边讲。"},
      {"key":"street_interview","name":"街采","definition":"户外或公共场所，对多位路人/受访者提问，受访者轮流对镜头回答，常见手持话筒、多人轮换。"},
      {"key":"promotion","name":"机制","definition":"以促销福利信息为主（产品阵列、赠品、买赠/价格/活动字卡、庆祝动效），用于交代购买利益点。"},
      {"key":"koc","name":"KOC","definition":"素人/达人以个人使用者身份分享真实体验的种草内容。"}
    ]'::JSONB
);

CREATE TABLE ads.content_segments (
    segment_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL CHECK (LENGTH(owner_user_id) BETWEEN 1 AND 200),
    asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    source_content_hash TEXT NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
    -- Asset duration observed at the last write; NULL means the end bound was not verifiable.
    source_duration_ms INTEGER CHECK (source_duration_ms IS NULL OR source_duration_ms > 0),
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL,
    preset_key TEXT NOT NULL,
    preset_version INTEGER NOT NULL,
    label_key TEXT NOT NULL CHECK (LENGTH(label_key) BETWEEN 1 AND 64),
    product_name TEXT CHECK (product_name IS NULL OR LENGTH(product_name) BETWEEN 1 AND 200),
    origin TEXT NOT NULL CHECK (origin IN ('ai', 'human')),
    status TEXT NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected', 'stale')),
    -- Model observations only (model, prompt version, confidence, reason, request id); never facts.
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_ms < end_ms),
    CHECK (status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
    FOREIGN KEY (preset_key, preset_version)
        REFERENCES ads.content_segment_presets(preset_key, version),
    CONSTRAINT content_segments_confirmed_no_overlap EXCLUDE USING gist (
        asset_id WITH =,
        preset_key WITH =,
        int4range(start_ms, end_ms) WITH &&
    ) WHERE (status = 'confirmed')
);
CREATE INDEX content_segments_asset_idx
    ON ads.content_segments (asset_id, preset_key, start_ms, segment_id);
CREATE INDEX content_segments_label_idx
    ON ads.content_segments (preset_key, label_key, status);
