DO $$
BEGIN
    IF to_regclass('ads.content_production_semantic_active_idx') IS NULL
       OR to_regclass('ads.content_production_semantic_catalog_idx') IS NULL THEN
        RAISE EXCEPTION 'Semantic queue ownership/dedup indexes missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ads.content_production_semantic_jobs'::regclass
          AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%result IS NOT NULL%'
    ) THEN
        RAISE EXCEPTION 'Semantic completion and result must be atomic';
    END IF;
END $$;
