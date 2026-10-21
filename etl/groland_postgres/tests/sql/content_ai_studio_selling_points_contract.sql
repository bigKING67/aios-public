-- Only run in the disposable content-production fixture (029 + 035 + 038–041).
-- Checks the selling-point preset, the widened dimension check and the
-- continues_previous default. No retained test data.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN := FALSE;
    keys TEXT[];
    asset UUID := '03500000-0000-0000-0000-000000000001';
    point UUID := '03500000-0000-0000-0000-000000000002';
BEGIN
    SELECT ARRAY(SELECT label->>'key' FROM jsonb_array_elements(labels) AS label)
    INTO keys
    FROM ads.content_segment_presets
    WHERE preset_key = 'selling_point' AND version = 1 AND dimension = 'selling_point' AND status = 'active';
    IF keys IS DISTINCT FROM ARRAY['moisturizing', 'skincare', 'no_caking', 'long_wear', 'star_endorsement', 'kol_endorsement', 'expert_endorsement'] THEN
        RAISE EXCEPTION 'selling_point v1 labels drifted: %', keys;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM ads.content_segment_presets p,
            LATERAL jsonb_array_elements(p.labels) AS label
        WHERE p.preset_key = 'selling_point' AND p.version = 1
            AND label->>'key' = 'no_caking' AND label->>'name' = '妆效'
            AND label->>'definition' LIKE '%自然、清透、不假白、无粉感、扒脸%'
    ) THEN
        RAISE EXCEPTION 'makeup effect must expose the broader business definition with its stable key';
    END IF;
    BEGIN
        INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
        VALUES ('made_up', 1, 'made_up', 'x', '[{"key":"a","name":"a","definition":""}]');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown preset dimension accepted'; END IF;
    INSERT INTO ads.marketing_content_assets (asset_id, title) VALUES (asset, 'selling point contract');
    INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, start_ms, end_ms,
        preset_key, preset_version, label_key, origin, status)
    VALUES (point, 'sql-contract-fixture', asset, REPEAT('a', 64), 0, 1000, 'selling_point', 1, 'moisturizing',
        'human', 'suggested');
    IF (SELECT continues_previous FROM ads.content_segments WHERE segment_id = point) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'continues_previous must default to FALSE';
    END IF;
    IF (SELECT additional_label_keys FROM ads.content_segments WHERE segment_id = point) IS DISTINCT FROM ARRAY[]::TEXT[] THEN
        RAISE EXCEPTION 'legacy single label must have no implicit additional labels';
    END IF;
    UPDATE ads.content_segments SET additional_label_keys = ARRAY['skincare'] WHERE segment_id = point;
    rejected := FALSE;
    BEGIN
        UPDATE ads.content_segments SET additional_label_keys = ARRAY['moisturizing'] WHERE segment_id = point;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'primary label duplicated in additional labels'; END IF;
END $$;
ROLLBACK;
