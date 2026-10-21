-- Business decision 2026-10-16: broaden 不卡粉 to 妆效.
-- Retain the historical key and all segment/evidence/frozen-plan records.
-- Apply through the migration ledger, never on API startup.
UPDATE ads.content_segment_presets
SET labels = (
    SELECT jsonb_agg(
        CASE WHEN label->>'key' = 'no_caking' THEN
            label || jsonb_build_object(
                'name', '妆效',
                'definition', '讲本产品不卡粉、不卡纹、不斑驳、不结块、服帖、自然、清透、不假白、无粉感、扒脸等妆面表现，或对应的妆效演示。'
            )
        ELSE label END
        ORDER BY position
    )
    FROM jsonb_array_elements(labels) WITH ORDINALITY AS items(label, position)
)
WHERE preset_key = 'selling_point'
  AND version = 1
  AND labels @> '[{"key":"no_caking"}]'::JSONB;
