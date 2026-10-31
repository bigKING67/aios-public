-- Exercise the migrated CHECK constraints without creating production assets/runs.
BEGIN;
CREATE TEMP TABLE review_reason_fixture
    (LIKE ads.content_remix_output_reviews INCLUDING CONSTRAINTS);
DO $$
DECLARE
    reason TEXT;
BEGIN
    FOREACH reason IN ARRAY ARRAY['duplicate_picture', 'voice_break', 'wrong_product',
                                 'pacing', 'other', 'frame_drop', 'wrong_framework'] LOOP
        INSERT INTO review_reason_fixture
            (run_id, output_asset_id, decision, reasons, reviewer_user_id, reviewed_at)
        VALUES (GEN_RANDOM_UUID(), GEN_RANDOM_UUID(), 'rejected', ARRAY[reason], 'fixture', NOW());
    END LOOP;
    BEGIN
        UPDATE review_reason_fixture SET reasons=ARRAY['unknown'];
        RAISE EXCEPTION 'unknown reason unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE review_reason_fixture SET reasons='{}';
        RAISE EXCEPTION 'rejection without reason unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE review_reason_fixture SET decision='approved';
        RAISE EXCEPTION 'approval with rejection reasons unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    UPDATE review_reason_fixture SET decision='approved', reasons='{}';
END $$;
ROLLBACK;
