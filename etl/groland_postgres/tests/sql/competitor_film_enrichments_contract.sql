-- Only run in a disposable fixture with sql/bql/backend/002 + 009 applied.
-- Checks the extraction constraints and the one-row-per-analysis-and-prompt key the worker
-- relies on (enrichment.QUEUE_SQL inserts with ON CONFLICT DO NOTHING). No retained test data.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN;
    analysis UUID;
    row_id UUID;
BEGIN
    INSERT INTO competitor.videos (aweme_id, share_url) VALUES ('7000000000000000001', 'https://v.douyin.com/fixture/');
    INSERT INTO competitor.analyses (aweme_id) VALUES ('7000000000000000001')
    RETURNING analysis_id INTO analysis;

    INSERT INTO competitor.film_enrichments (analysis_id, aweme_id, prompt_version)
    VALUES (analysis, '7000000000000000001', 'competitor-enrich-v1')
    RETURNING enrichment_id INTO row_id;

    rejected := FALSE;
    BEGIN
        INSERT INTO competitor.film_enrichments (analysis_id, aweme_id, prompt_version)
        VALUES (analysis, '7000000000000000001', 'competitor-enrich-v1');
    EXCEPTION WHEN unique_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'second extraction for the same analysis and prompt accepted'; END IF;

    -- A new prompt version extracts the same analysis again.
    INSERT INTO competitor.film_enrichments (analysis_id, aweme_id, prompt_version)
    VALUES (analysis, '7000000000000000001', 'competitor-enrich-v2');

    rejected := FALSE;
    BEGIN
        UPDATE competitor.film_enrichments SET status = 'succeeded' WHERE enrichment_id = row_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'succeeded without result and model accepted'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE competitor.film_enrichments SET status = 'failed' WHERE enrichment_id = row_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'failed without error_code accepted'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE competitor.film_enrichments SET status = 'partial' WHERE enrichment_id = row_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown status accepted'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE competitor.film_enrichments SET host_errors = '{}'::jsonb WHERE enrichment_id = row_id;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-array host_errors accepted'; END IF;

    UPDATE competitor.film_enrichments
    SET status = 'succeeded', model_id = 'fixture-model', result = '{"scene_pains": [], "endorsers": []}', finished_at = NOW()
    WHERE enrichment_id = row_id;

    -- Deleting the analysis removes its extractions.
    DELETE FROM competitor.analyses WHERE analysis_id = analysis;
    IF EXISTS (SELECT 1 FROM competitor.film_enrichments WHERE analysis_id = analysis) THEN
        RAISE EXCEPTION 'extraction kept after its analysis was deleted';
    END IF;
END $$;
ROLLBACK;
