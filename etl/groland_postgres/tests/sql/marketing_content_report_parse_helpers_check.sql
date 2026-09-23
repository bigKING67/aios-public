-- Postinstall contract check for the marketing-content report parse helpers.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/marketing_content_report_parse_helpers_check.sql

DO $$
DECLARE
  v_exact_helpers INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_exact_helpers
  FROM unnest(ARRAY[
    'public.marketing_content_parse_numeric(text)',
    'public.marketing_content_parse_bigint(text)',
    'public.marketing_content_parse_rate(text)'
  ]::TEXT[]) AS required(signature)
  JOIN pg_proc routine ON routine.oid = to_regprocedure(required.signature)
  JOIN pg_language language ON language.oid = routine.prolang
  WHERE routine.prokind = 'f'
    AND routine.provolatile = 'i'
    AND language.lanname = 'plpgsql';

  IF v_exact_helpers <> 3 THEN
    RAISE EXCEPTION 'marketing-content parse-helper catalog contract failed: %/3', v_exact_helpers;
  END IF;

  IF pg_get_function_result('public.marketing_content_parse_numeric(text)'::REGPROCEDURE) <> 'numeric'
    OR pg_get_function_result('public.marketing_content_parse_bigint(text)'::REGPROCEDURE) <> 'bigint'
    OR pg_get_function_result('public.marketing_content_parse_rate(text)'::REGPROCEDURE) <> 'numeric' THEN
    RAISE EXCEPTION 'marketing-content parse-helper result-type contract failed';
  END IF;

  IF public.marketing_content_parse_numeric('1,234.50元') IS DISTINCT FROM 1234.50::NUMERIC
    OR public.marketing_content_parse_numeric(' ￥ 2,345 ') IS DISTINCT FROM 2345::NUMERIC
    OR public.marketing_content_parse_numeric('-') IS NOT NULL
    OR public.marketing_content_parse_numeric('invalid') IS NOT NULL THEN
    RAISE EXCEPTION 'marketing_content_parse_numeric semantic contract failed';
  END IF;

  IF public.marketing_content_parse_bigint('1,234') IS DISTINCT FROM 1234::BIGINT
    OR public.marketing_content_parse_bigint('invalid') IS NOT NULL THEN
    RAISE EXCEPTION 'marketing_content_parse_bigint semantic contract failed';
  END IF;

  IF public.marketing_content_parse_rate('12.5%') IS DISTINCT FROM 0.125::NUMERIC
    OR public.marketing_content_parse_rate('12.5') IS DISTINCT FROM 0.125::NUMERIC
    OR public.marketing_content_parse_rate('0.125') IS DISTINCT FROM 0.125::NUMERIC
    OR public.marketing_content_parse_rate('invalid') IS NOT NULL THEN
    RAISE EXCEPTION 'marketing_content_parse_rate semantic contract failed';
  END IF;

  RAISE NOTICE 'marketing-content parse-helper checks passed';
END;
$$;
