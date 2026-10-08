-- Only run in the disposable content-production fixture. No retained test data.
BEGIN;
DO $$
DECLARE
    target UUID := '02600000-0000-0000-0000-000000000001';
    rejected BOOLEAN := FALSE;
BEGIN
    INSERT INTO ads.content_production_runs (run_id, owner_user_id, idempotency_key, request, source_snapshot)
    VALUES (target, 'sql-contract-fixture', 'schema-test', '{}', '{}');
    BEGIN
        UPDATE ads.content_production_runs SET version = 0 WHERE run_id = target;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'nonpositive version accepted'; END IF;
    rejected := FALSE;
    BEGIN
        UPDATE ads.content_production_runs SET status = 'made-up-success' WHERE run_id = target;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown state accepted'; END IF;
    rejected := FALSE;
    BEGIN
        UPDATE ads.content_production_runs SET project_id = target WHERE run_id = target;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'partial project reference accepted'; END IF;
    rejected := FALSE;
    BEGIN
        UPDATE ads.content_production_runs SET status = 'succeeded' WHERE run_id = target;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'delivery without render reference accepted'; END IF;
    rejected := FALSE;
    BEGIN
        UPDATE ads.content_production_runs SET pause_requested = TRUE WHERE run_id = target;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'pause request outside running state accepted'; END IF;
    rejected := FALSE;
    BEGIN
        INSERT INTO ads.content_production_runs (run_id, owner_user_id, idempotency_key, request, source_snapshot)
        VALUES ('02600000-0000-0000-0000-000000000002', 'sql-contract-fixture', 'schema-test', '{}', '{}');
    EXCEPTION WHEN unique_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'duplicate owner idempotency key accepted'; END IF;
END $$;
ROLLBACK;
