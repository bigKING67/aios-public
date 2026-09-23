-- Run after root migration 022 inside the disposable production HTTP fixture.
DO $$
BEGIN
    IF to_regclass('ads.content_production_shot_catalogs_owner_idx') IS NULL THEN
        RAISE EXCEPTION 'Owner catalogue listing index is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ads.content_production_shot_catalogs'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (owner_user_id, asset_id, content_hash)'
    ) THEN
        RAISE EXCEPTION 'Owner scoped catalogue deduplication constraint is missing';
    END IF;
END $$;
