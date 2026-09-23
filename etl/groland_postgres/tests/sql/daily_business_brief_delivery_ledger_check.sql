-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/daily_business_brief_delivery_ledger_check.sql

DO $$
DECLARE
  missing_columns TEXT[];
  has_production_unique_index BOOLEAN;
BEGIN
  IF to_regclass('dataops.daily_business_brief_deliveries') IS NULL THEN
    RAISE EXCEPTION 'missing dataops.daily_business_brief_deliveries';
  END IF;

  SELECT ARRAY_AGG(expected.column_name ORDER BY expected.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('attempt_count'),
      ('brief_date'),
      ('card_sha256'),
      ('completed_at'),
      ('created_at'),
      ('delivery_channel'),
      ('error_code'),
      ('error_detail'),
      ('flow_run_id'),
      ('flow_run_name'),
      ('id'),
      ('started_at'),
      ('status'),
      ('updated_at')
  ) AS expected(column_name)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'dataops'
   AND actual.table_name = 'daily_business_brief_deliveries'
   AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'daily brief ledger missing columns: %', missing_columns;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'dataops'
      AND tablename = 'daily_business_brief_deliveries'
      AND indexname = 'uq_daily_business_brief_production_date'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%WHERE%delivery_channel%production%'
  )
  INTO has_production_unique_index;

  IF NOT has_production_unique_index THEN
    RAISE EXCEPTION 'daily brief production-date unique index is missing or not partial';
  END IF;
END;
$$;
