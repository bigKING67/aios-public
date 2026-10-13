-- AI 创作中心：框架预设 v2 增加短段并入规则。Forward-only; apply through the
-- ledger, never on API startup, and only after the API and the AI 切段 worker
-- that understand `absorbInto` / `absorbBetweenMaxSec` are deployed (the API
-- rejects unknown preset label fields).
--
-- Updates framework v2 in place instead of adding v3: label keys, names and
-- definitions are unchanged, and retiring v2 would block every existing v2
-- segment (confirm, edit, remix, suggestions all require an active preset).
-- The two fields only steer worker post-processing of new AI 切段 jobs; stored
-- segments are not touched. Rules from the 2026-10-13 holdout (25 蜜粉 films,
-- business-corrected answers):
-- - live_demo shorter than 30s is folded only into an adjacent mixed_voiceover
--   (a short single-person demo next to a street interview or at the end stays
--   live footage);
-- - a span of another label no longer than 12s between two promotion spans
--   becomes promotion (model faces inside the closing promotion block).
UPDATE ads.content_segment_presets
SET labels = (
        SELECT jsonb_agg(
                   CASE item.label->>'key'
                       WHEN 'live_demo' THEN item.label || '{"absorbInto":["mixed_voiceover"]}'::JSONB
                       WHEN 'promotion' THEN item.label || '{"absorbBetweenMaxSec":12}'::JSONB
                       ELSE item.label
                   END
                   ORDER BY item.position
               )
        FROM jsonb_array_elements(labels) WITH ORDINALITY AS item(label, position)
    ),
    updated_at = NOW()
WHERE preset_key = 'framework' AND version = 2;
