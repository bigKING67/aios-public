-- Business confirmation 2026-10-16: one complete selling-point span may carry
-- several evidenced labels. Keep the original label_key and frozen outputs;
-- existing rows have no additional labels and are not reclassified.
ALTER TABLE ads.content_segments
    ADD COLUMN additional_label_keys TEXT[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT content_segments_additional_labels_check CHECK (
        CARDINALITY(additional_label_keys) <= 31
        AND COALESCE(ARRAY_NDIMS(additional_label_keys), 1) = 1
        AND ARRAY_POSITION(additional_label_keys, NULL) IS NULL
        AND ARRAY_POSITION(additional_label_keys, '') IS NULL
        AND NOT (label_key = ANY(additional_label_keys))
    );

-- Immediate oil absorption is not duration evidence for long wear.
UPDATE ads.content_segment_presets AS preset
SET labels = (
    SELECT JSONB_AGG(
        CASE WHEN label->>'key' = 'long_wear' THEN
            label || JSONB_BUILD_OBJECT('definition',
                '讲本产品持妆、不脱妆、不暗沉、持续控油或控油时长，或长时间实测后的妆效保持；仅即时吸油演示不算持妆。')
        ELSE label END ORDER BY ordinal
    )
    FROM JSONB_ARRAY_ELEMENTS(preset.labels) WITH ORDINALITY AS item(label, ordinal)
)
WHERE preset.preset_key = 'selling_point' AND preset.version = 1;
