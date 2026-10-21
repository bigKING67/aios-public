-- AI 创作中心：卖点预设与卖点片段连续性（类型 2 按卖点排列组合）。Additive
-- only; apply through the ledger, never on API startup.
--
-- Selling-point segments are ordinary rows in ads.content_segments under their
-- own preset (dimension 'selling_point'), so they may overlap framework
-- segments of the same asset while never overlapping each other (the confirmed
-- exclusion constraint is keyed per preset_key). Labels are the six selling
-- points confirmed by the business on 2026-10-13.
--
-- continues_previous marks that a selling-point segment cannot be cut from the
-- immediately preceding selling-point segment of the same asset (one take, a
-- sentence spanning both, or one continuous action). Remix keeps such runs
-- together as one block. It defaults to FALSE and is ignored for other presets.
ALTER TABLE ads.content_segment_presets
    DROP CONSTRAINT content_segment_presets_dimension_check;
ALTER TABLE ads.content_segment_presets
    ADD CONSTRAINT content_segment_presets_dimension_check
    CHECK (dimension IN ('framework', 'picture', 'custom', 'selling_point'));

INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
VALUES (
    'selling_point',
    1,
    'selling_point',
    '卖点 v1',
    '[
      {"key":"moisturizing","name":"滋润保湿","definition":"讲滋润、保湿、水润、精华入妆，或用画面表现上脸后不干、不起皮。"},
      {"key":"skincare","name":"养肤护肤","definition":"讲养肤、护肤级彩妆、成分（精油、精华等）对皮肤的养护作用。"},
      {"key":"celebrity_endorsement","name":"明星背书","definition":"明星、达人、专业人士推荐或同款背书，包括带同款角标的出镜。"},
      {"key":"natural_look","name":"伪素颜","definition":"讲自然、伪素颜、妈生好皮、无粉感、通透妆效。"},
      {"key":"no_caking","name":"不卡粉","definition":"讲不卡粉、不斑驳、不卡纹、服帖，或用画面表现细纹处不卡粉。"},
      {"key":"long_wear","name":"持妆","definition":"讲持妆、不脱妆、不暗沉、控油、长时间实测后的妆效。"}
    ]'::JSONB
);

ALTER TABLE ads.content_segments
    ADD COLUMN continues_previous BOOLEAN NOT NULL DEFAULT FALSE;
