-- Only run in a disposable fixture with sql/bql/backend/002 + 003 + 006 applied.
-- Checks the stat snapshot constraints and the upsert target the competitor
-- worker relies on (snapshots.UPSERT_SQL). No retained test data.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN;
    snapshot UUID;
    rows_for_key INTEGER;
BEGIN
    INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
        input_snapshot, source_watermark, films, families, payload)
    VALUES ('loose_powder', 'last30', 'competitor-stats-v1', 'competitor-taxonomy-v3', 'competitor-structure-v1',
        'abc', 'w1', 3, 2, '{"rows": []}')
    RETURNING snapshot_id INTO snapshot;

    -- Same input: the worker's ON CONFLICT target must hit the unique key and update in place.
    INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
        input_snapshot, source_watermark, films, families, payload)
    VALUES ('loose_powder', 'last30', 'competitor-stats-v1', 'competitor-taxonomy-v3', 'competitor-structure-v2',
        'abc', 'w2', 3, 2, '{"rows": [1]}')
    ON CONFLICT (cohort, period, stats_version, input_snapshot) DO UPDATE
    SET normalization_version = EXCLUDED.normalization_version, source_watermark = EXCLUDED.source_watermark,
        payload = EXCLUDED.payload, computed_at = NOW();
    SELECT COUNT(*) INTO rows_for_key FROM competitor.stat_snapshots WHERE cohort = 'loose_powder';
    IF rows_for_key <> 1 THEN RAISE EXCEPTION 'same input must update in place, got % rows', rows_for_key; END IF;
    IF (SELECT source_watermark || normalization_version FROM competitor.stat_snapshots WHERE snapshot_id = snapshot)
        IS DISTINCT FROM 'w2competitor-structure-v2' THEN
        RAISE EXCEPTION 'upsert did not refresh watermark and versions';
    END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
            input_snapshot, source_watermark, films, families, payload)
        VALUES ('loose_powder', 'last90', 'v', 't', 'n', 'x', 'w', 0, 0, '{}');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown period accepted'; END IF;

    -- Calendar window keys (006): accepted, while a malformed key is not.
    INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
        input_snapshot, source_watermark, films, families, payload)
    VALUES ('loose_powder', '2026-10-01..2026-10-31', 'v', 't', 'n', 'x', 'w', 0, 0, '{}');
    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
            input_snapshot, source_watermark, films, families, payload)
        VALUES ('loose_powder', '2026-10-01..', 'v', 't', 'n', 'x', 'w', 0, 0, '{}');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'malformed window key accepted'; END IF;

    -- The request queue keeps one row per cohort and window; only window keys are requested.
    INSERT INTO competitor.stat_requests (cohort, period) VALUES ('loose_powder', '2026-09-01..2026-09-15')
    ON CONFLICT (cohort, period) DO UPDATE SET requested_at = NOW();
    INSERT INTO competitor.stat_requests (cohort, period) VALUES ('loose_powder', '2026-09-01..2026-09-15')
    ON CONFLICT (cohort, period) DO UPDATE SET requested_at = NOW();
    IF (SELECT COUNT(*) FROM competitor.stat_requests) <> 1 THEN RAISE EXCEPTION 'request not deduplicated'; END IF;
    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_requests (cohort, period) VALUES ('loose_powder', 'all');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-window request accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
            input_snapshot, source_watermark, films, families, payload)
        VALUES ('Loose Powder', 'all', 'v', 't', 'n', 'x', 'w', 0, 0, '{}');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'cohort outside the category key pattern accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
            input_snapshot, source_watermark, films, families, payload)
        VALUES ('all', 'all', 'v', 't', 'n', 'x', 'w', 2, 3, '{}');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'more families than films accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version,
            input_snapshot, source_watermark, films, families, payload)
        VALUES ('all', 'all', 'v', 't', 'n', 'x', 'w', 0, 0, '[]');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-object payload accepted'; END IF;
END $$;
ROLLBACK;
