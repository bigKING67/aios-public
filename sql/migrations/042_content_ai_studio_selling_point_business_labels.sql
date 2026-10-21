-- Correct the active choices to the five standard selling points confirmed
-- in the source document's 2026-10-13 comments. 035 remains immutable.
-- Metadata only: do not delete, relabel or split historical natural_look
-- annotations, suggestion evidence, frozen plans or lineage. They remain
-- readable; a later human edit/confirmation must choose a current label.
-- Apply through the migration ledger, never on API startup.
UPDATE ads.content_segment_presets
SET labels = (
    SELECT jsonb_agg(label ORDER BY position)
    FROM jsonb_array_elements(labels) WITH ORDINALITY AS items(label, position)
    WHERE label->>'key' <> 'natural_look'
)
WHERE preset_key = 'selling_point'
  AND version = 1
  AND labels @> '[{"key":"natural_look"}]'::JSONB;
