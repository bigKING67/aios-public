DO $$
DECLARE
  v_missing_tables TEXT[];
BEGIN
  SELECT ARRAY_AGG(required_table)
  INTO v_missing_tables
  FROM (
    VALUES
      ('ods.sample_inventory_business_event_raw'),
      ('ods.sample_inventory_sample_snapshot_raw'),
      ('dwd.sample_inventory_inventory_movement_di'),
      ('dwd.sample_inventory_outbound_request_event_di'),
      ('dwd.sample_inventory_sample_snapshot_di'),
      ('etl.sample_inventory_warehouse_refresh_state')
  ) AS expected(required_table)
  WHERE to_regclass(required_table) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing sample inventory warehouse tables: %', v_missing_tables;
  END IF;

  IF to_regprocedure('etl.refresh_sample_inventory_warehouse(integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'missing sample inventory warehouse refresh function';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'dwd'
      AND table_name = 'sample_inventory_outbound_request_event_di'
      AND column_name = 'request_date'
      AND is_generated = 'ALWAYS'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'dwd'
      AND table_name = 'sample_inventory_outbound_request_event_di'
      AND column_name = 'process_time_known'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'sample inventory DWD legacy time-quality columns are missing';
  END IF;

  IF EXISTS (
    SELECT source_event_id
    FROM ods.sample_inventory_business_event_raw
    GROUP BY source_event_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate sample inventory ODS source_event_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dwd.sample_inventory_sample_snapshot_di
    WHERE available_quantity <> on_hand_quantity - reserved_quantity
       OR reserved_quantity > on_hand_quantity
  ) THEN
    RAISE EXCEPTION 'invalid sample inventory DWD stock balance';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dwd.sample_inventory_sample_snapshot_di AS snapshot
    CROSS JOIN sample_inventory.settings AS settings
    WHERE snapshot.is_low_stock <>
      (
        snapshot.available_quantity > 0
        AND snapshot.available_quantity <= settings.low_stock_threshold
      )
  ) THEN
    RAISE EXCEPTION 'invalid sample inventory DWD low-stock semantics';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dwd.sample_inventory_outbound_request_event_di
    WHERE (time_quality = 'legacy_request_only' AND process_time_known)
       OR (time_quality = 'known' AND NOT process_time_known)
       OR request_date <> (requested_at AT TIME ZONE 'Asia/Shanghai')::DATE
  ) THEN
    RAISE EXCEPTION 'invalid sample inventory DWD time-quality semantics';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM etl.sample_inventory_warehouse_refresh_state AS state
    WHERE state.last_source_event_id > COALESCE(
      (SELECT MAX(id) FROM sample_inventory.business_events),
      0
    )
  ) THEN
    RAISE EXCEPTION 'sample inventory warehouse watermark exceeds the source event stream';
  END IF;
END;
$$;
