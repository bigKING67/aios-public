DO $$
BEGIN
    IF to_regclass('ads.content_production_shot_jobs_active_idx') IS NULL
       OR to_regclass('ads.content_production_shot_jobs_owner_idx') IS NULL THEN
        RAISE EXCEPTION 'Shot queue ownership/dedup indexes missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ads.content_production_shot_jobs'::regclass
          AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%catalog_id IS NOT NULL%'
    ) THEN
        RAISE EXCEPTION 'Completed extraction must reference a catalog';
    END IF;
END $$;
