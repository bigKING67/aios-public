BEGIN;
CREATE TEMP TABLE retention_contract (LIKE ads.content_remix_retention INCLUDING ALL);
DO $$ BEGIN
    BEGIN
        INSERT INTO retention_contract(output_asset_id,reason,cleanup_at,status) VALUES (GEN_RANDOM_UUID(),'rejected',NOW(),'completed');
        RAISE EXCEPTION 'completed without timestamp accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='remix_review_archive' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'permanent review history trigger missing';
    END IF;
END $$;
ROLLBACK;
