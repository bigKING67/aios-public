DO $$
DECLARE
  v_missing_tables TEXT[];
BEGIN
  SELECT ARRAY_AGG(required_table)
  INTO v_missing_tables
  FROM (
    VALUES
      ('sample_inventory.settings'),
      ('sample_inventory.import_batches'),
      ('sample_inventory.samples'),
      ('sample_inventory.inbound_records'),
      ('sample_inventory.outbound_requests'),
      ('sample_inventory.inventory_movements'),
      ('sample_inventory.business_events')
  ) AS expected(required_table)
  WHERE to_regclass(required_table) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing sample inventory transaction tables: %', v_missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'sample_inventory'
      AND table_name = 'samples'
      AND column_name = 'available_quantity'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'sample inventory available_quantity is not generated';
  END IF;

  IF to_regprocedure('sample_inventory.reject_append_only_mutation()') IS NULL THEN
    RAISE EXCEPTION 'missing sample inventory append-only guard function';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'sample_inventory.inventory_movements'::REGCLASS
      AND tgname = 'trg_sample_inventory_movements_append_only'
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'sample_inventory.business_events'::REGCLASS
      AND tgname = 'trg_sample_inventory_events_append_only'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'sample inventory append-only triggers are missing or disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE on_hand_quantity < 0
       OR reserved_quantity < 0
       OR reserved_quantity > on_hand_quantity
       OR available_quantity <> on_hand_quantity - reserved_quantity
  ) THEN
    RAISE EXCEPTION 'invalid sample inventory transaction stock balance';
  END IF;

  IF EXISTS (
    SELECT sample_code
    FROM sample_inventory.samples
    WHERE archived_at IS NULL
    GROUP BY sample_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate active sample inventory code';
  END IF;

  IF EXISTS (
    SELECT source_kind, source_sha256
    FROM sample_inventory.import_batches
    GROUP BY source_kind, source_sha256
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate sample inventory import source hash';
  END IF;
END;
$$;
