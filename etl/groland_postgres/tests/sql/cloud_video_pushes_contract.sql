-- Use the actual migrated constraints/indexes, without production asset/run fixtures.
BEGIN;
CREATE TEMP TABLE push_contract (LIKE cloud_video.pushes INCLUDING ALL);
DO $$
DECLARE
    asset UUID := GEN_RANDOM_UUID();
    run UUID := GEN_RANDOM_UUID();
BEGIN
    IF NOT HAS_TABLE_PRIVILEGE('aios_gpu_node','cloud_video.pushes','SELECT')
       OR NOT HAS_TABLE_PRIVILEGE('aios_gpu_node','cloud_video.pushes','INSERT')
       OR NOT HAS_TABLE_PRIVILEGE('aios_gpu_node','cloud_video.pushes','UPDATE')
       OR NOT HAS_TABLE_PRIVILEGE('aios_gpu_node','ads.content_production_revisions','SELECT')
       OR HAS_TABLE_PRIVILEGE('aios_gpu_node','cloud_video.pushes','DELETE') THEN
        RAISE EXCEPTION 'desktop delivery grants are incomplete or permit ledger deletion';
    END IF;
    INSERT INTO push_contract(output_asset_id,run_id,approved_by,approved_at)
        VALUES (asset,run,'fixture',NOW());
    BEGIN
        INSERT INTO push_contract(output_asset_id,run_id,approved_by,approved_at)
            VALUES (asset,run,'fixture',NOW());
        RAISE EXCEPTION 'duplicate asset delivery accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        UPDATE push_contract SET status='succeeded';
        RAISE EXCEPTION 'success without cloud receipt accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE push_contract SET status='importing';
        RAISE EXCEPTION 'importing without request identifier accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE push_contract SET attempts=-1;
        RAISE EXCEPTION 'negative attempts accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    UPDATE push_contract SET status='importing',request_id='9007199254740993123';
    UPDATE push_contract SET status='succeeded',cloud_video_id=123,succeeded_at=NOW();
    BEGIN
        INSERT INTO push_contract(output_asset_id,run_id,approved_by,approved_at,cloud_video_id)
            VALUES (GEN_RANDOM_UUID(),run,'fixture',NOW(),123);
        RAISE EXCEPTION 'duplicate vendor output accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
