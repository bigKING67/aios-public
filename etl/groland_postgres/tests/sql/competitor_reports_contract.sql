-- Only run in a disposable fixture with sql/bql/backend/002 + 004 + 006 applied.
-- Checks the report constraints and the one-report-per-input key the API relies on
-- (repeat requests return the live or finished row; a failed one can be requested again).
-- No retained test data.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN;
    first_id UUID;
BEGIN
    INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
    VALUES ('loose_powder', 'last30', 'abc', 'competitor-report-b-v7-online')
    RETURNING report_id INTO first_id;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
        VALUES ('loose_powder', 'last30', 'abc', 'competitor-report-b-v7-online');
    EXCEPTION WHEN unique_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'second live report for the same input accepted'; END IF;

    UPDATE competitor.reports SET status = 'failed', error_code = 'invalid_report', finished_at = NOW()
    WHERE report_id = first_id;
    INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
    VALUES ('loose_powder', 'last30', 'abc', 'competitor-report-b-v7-online');

    rejected := FALSE;
    BEGIN
        UPDATE competitor.reports SET status = 'succeeded' WHERE report_id <> first_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'succeeded without report, inputs and model accepted'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE competitor.reports SET status = 'failed' WHERE report_id <> first_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'failed without error_code accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
        VALUES ('loose_powder', 'last90', 'x', 'v');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown period accepted'; END IF;

    -- A calendar window key (006) is a valid report scope.
    INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version)
    VALUES ('loose_powder', '2026-10-26..2026-10-26', 'y', 'v');

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version, status)
        VALUES ('loose_powder', 'all', 'x', 'v', 'partial');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown status accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version, issues)
        VALUES ('loose_powder', 'all', 'y', 'v', '{}');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-array issues accepted'; END IF;
END $$;
ROLLBACK;
