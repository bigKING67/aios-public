DO $$
DECLARE
  v_column_count INTEGER;
  v_constraint_count INTEGER;
  v_default TEXT;
BEGIN
  IF to_regclass('sample_inventory.mutation_requests') IS NULL THEN
    RAISE EXCEPTION 'missing sample inventory mutation request table';
  END IF;

  SELECT COUNT(*)
  INTO v_column_count
  FROM (
    VALUES
      ('id', 'bigint', 'NO'),
      ('operation', 'text', 'NO'),
      ('submission_key', 'text', 'NO'),
      ('request_sha256', 'text', 'NO'),
      ('actor_user_id', 'text', 'NO'),
      ('response_payload', 'jsonb', 'YES'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('completed_at', 'timestamp with time zone', 'YES')
  ) AS expected(column_name, data_type, is_nullable)
  JOIN information_schema.columns AS actual
    ON actual.table_schema = 'sample_inventory'
   AND actual.table_name = 'mutation_requests'
   AND actual.column_name = expected.column_name
   AND actual.data_type = expected.data_type
   AND actual.is_nullable = expected.is_nullable;

  IF v_column_count <> 8 THEN
    RAISE EXCEPTION 'sample inventory mutation request column contract is incomplete';
  END IF;

  SELECT COUNT(*)
  INTO v_constraint_count
  FROM pg_constraint
  WHERE conrelid = 'sample_inventory.mutation_requests'::REGCLASS
    AND convalidated
    AND (
      (conname = 'mutation_requests_pkey'
        AND contype = 'p'
        AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)')
      OR (conname = 'mutation_requests_operation_check'
        AND contype = 'c'
        AND pg_get_constraintdef(oid) = 'CHECK ((btrim(operation) <> ''''::text))')
      OR (conname = 'mutation_requests_submission_key_check'
        AND contype = 'c'
        AND pg_get_constraintdef(oid) =
          'CHECK (((btrim(submission_key) <> ''''::text) AND (char_length(submission_key) <= 128)))')
      OR (conname = 'mutation_requests_request_sha256_check'
        AND contype = 'c'
        AND pg_get_constraintdef(oid) =
          'CHECK ((request_sha256 ~ ''^[0-9a-f]{64}$''::text))')
      OR (conname = 'mutation_requests_actor_user_id_check'
        AND contype = 'c'
        AND pg_get_constraintdef(oid) = 'CHECK ((btrim(actor_user_id) <> ''''::text))')
      OR (conname = 'chk_sample_inventory_mutation_completion'
        AND contype = 'c'
        AND pg_get_constraintdef(oid) =
          'CHECK (((response_payload IS NULL) = (completed_at IS NULL)))')
      OR (conname = 'uq_sample_inventory_mutation_operation_key'
        AND contype = 'u'
        AND pg_get_constraintdef(oid) = 'UNIQUE (operation, submission_key)')
    );

  IF v_constraint_count <> 7 THEN
    RAISE EXCEPTION 'sample inventory mutation request constraint contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = to_regclass('sample_inventory.idx_sample_inventory_mutation_actor_created')
      AND indrelid = 'sample_inventory.mutation_requests'::REGCLASS
      AND indisvalid
      AND indisready
      AND NOT indisunique
      AND pg_get_indexdef(indexrelid) =
        'CREATE INDEX idx_sample_inventory_mutation_actor_created ON sample_inventory.mutation_requests USING btree (actor_user_id, created_at DESC)'
  ) THEN
    RAISE EXCEPTION 'sample inventory mutation actor index is missing or drifted';
  END IF;

  SELECT regexp_replace(COALESCE(column_default, ''), '[[:space:]()]|::integer', '', 'g')
  INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'sample_inventory'
    AND table_name = 'settings'
    AND column_name = 'low_stock_threshold';

  IF v_default <> '3' THEN
    RAISE EXCEPTION 'sample inventory low stock threshold default is not 3';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.settings
    WHERE id = 1
      AND low_stock_threshold = 10
      AND version = 1
      AND created_by = 'system'
      AND updated_by = 'system'
  ) THEN
    RAISE EXCEPTION 'sample inventory pristine legacy threshold was not migrated';
  END IF;
END;
$$;
