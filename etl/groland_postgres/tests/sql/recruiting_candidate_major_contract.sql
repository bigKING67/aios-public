BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ads' AND table_name = 'recruiting_test_submissions'
          AND column_name = 'major' AND data_type = 'text' AND is_nullable = 'NO'
          AND column_default = chr(39) || chr(39) || '::text'
    ) THEN
        RAISE EXCEPTION 'Missing backward-compatible major column';
    END IF;
END $$;
ROLLBACK;
