-- Business confirmation 2026-10-16: distinguish immediate moisturizing,
-- long-term skincare, and three endorsement categories. The old broad
-- celebrity_endorsement key remains on historical rows for human review;
-- it must not silently become a star-only label.
UPDATE ads.content_segment_presets AS preset
SET labels = (
    SELECT JSONB_AGG(
        CASE label->>'key'
            WHEN 'moisturizing' THEN label || JSONB_BUILD_OBJECT('definition',
                '本产品即时滋润保湿、不干、不拔干、不起皮等效果；成分后引出的即时效果按保湿判断，不只凭成分名。')
            WHEN 'skincare' THEN label || JSONB_BUILD_OBJECT('definition',
                '本产品长期养出更好皮肤状态的养肤护肤效果；成分后引出的长期养护作用按养肤判断，不只凭成分名或即时妆效。')
            ELSE label
        END ORDER BY ordinal
    )
    FROM JSONB_ARRAY_ELEMENTS(preset.labels) WITH ORDINALITY AS item(label, ordinal)
    WHERE label->>'key' NOT IN ('celebrity_endorsement', 'star_endorsement', 'kol_endorsement', 'expert_endorsement')
) || '[
  {"key":"star_endorsement","name":"明星背书","definition":"有可核对的明星身份及其对本产品推荐、使用或同款关系；不凭长相猜测。与 KOL 背书可互换且共享重复次数预算。"},
  {"key":"kol_endorsement","name":"KOL背书","definition":"有可核对的 KOL/达人身份及其对本产品推荐、使用或同款关系；普通消费者口碑不算。与明星背书可互换且共享重复次数预算。"},
  {"key":"expert_endorsement","name":"其他背书","definition":"仅化妆师或专家对本产品的背书，须有明确身份及产品关系；机构、奖项、普通消费者不归入，不能与明星或 KOL 背书互换。"}
]'::JSONB
WHERE preset.preset_key = 'selling_point' AND preset.version = 1;
