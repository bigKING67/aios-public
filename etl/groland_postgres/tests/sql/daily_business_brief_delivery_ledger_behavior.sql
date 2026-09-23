-- Disposable behavior test for production uniqueness and repeatable test delivery.

BEGIN;

INSERT INTO dataops.daily_business_brief_deliveries (
  brief_date,
  delivery_channel,
  status,
  card_sha256
)
VALUES (
  DATE '2026-08-24',
  'production',
  'sending',
  REPEAT('a', 64)
);

DO $$
DECLARE
  duplicate_admitted BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO dataops.daily_business_brief_deliveries (
      brief_date,
      delivery_channel,
      status,
      card_sha256
    )
    VALUES (
      DATE '2026-08-24',
      'production',
      'sending',
      REPEAT('b', 64)
    );
    duplicate_admitted := TRUE;
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  IF duplicate_admitted THEN
    RAISE EXCEPTION 'duplicate production date was admitted';
  END IF;
END;
$$;

INSERT INTO dataops.daily_business_brief_deliveries (
  brief_date,
  delivery_channel,
  status,
  card_sha256
)
VALUES
  (DATE '2026-08-24', 'test', 'sending', REPEAT('c', 64)),
  (DATE '2026-08-24', 'test', 'sending', REPEAT('d', 64));

DO $$
DECLARE
  invalid_state_admitted BOOLEAN := FALSE;
  production_count BIGINT;
  test_count BIGINT;
BEGIN
  BEGIN
    INSERT INTO dataops.daily_business_brief_deliveries (
      brief_date,
      delivery_channel,
      status,
      card_sha256,
      completed_at
    )
    VALUES (
      DATE '2026-08-23',
      'test',
      'sent',
      REPEAT('e', 64),
      NULL
    );
    invalid_state_admitted := TRUE;
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF invalid_state_admitted THEN
    RAISE EXCEPTION 'terminal delivery without completed_at was admitted';
  END IF;

  SELECT COUNT(*)
  INTO production_count
  FROM dataops.daily_business_brief_deliveries
  WHERE brief_date = DATE '2026-08-24'
    AND delivery_channel = 'production';

  SELECT COUNT(*)
  INTO test_count
  FROM dataops.daily_business_brief_deliveries
  WHERE brief_date = DATE '2026-08-24'
    AND delivery_channel = 'test';

  IF production_count <> 1 OR test_count <> 2 THEN
    RAISE EXCEPTION
      'unexpected ledger counts production=% test=%',
      production_count,
      test_count;
  END IF;
END;
$$;

ROLLBACK;
