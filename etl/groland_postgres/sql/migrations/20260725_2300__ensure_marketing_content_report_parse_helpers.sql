CREATE OR REPLACE FUNCTION public.marketing_content_parse_numeric(value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := NULLIF(regexp_replace(COALESCE(value, ''), '[,%￥¥元\s]', '', 'g'), '');
  IF normalized IS NULL OR normalized IN ('-', '--') THEN
    RETURN NULL;
  END IF;
  RETURN normalized::NUMERIC;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_content_parse_bigint(value TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parsed NUMERIC;
BEGIN
  parsed := public.marketing_content_parse_numeric(value);
  IF parsed IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN parsed::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_content_parse_rate(value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
  parsed NUMERIC;
BEGIN
  normalized := NULLIF(regexp_replace(COALESCE(value, ''), '[,%\s]', '', 'g'), '');
  IF normalized IS NULL OR normalized IN ('-', '--') THEN
    RETURN NULL;
  END IF;
  parsed := normalized::NUMERIC;
  IF position('%' in COALESCE(value, '')) > 0 OR parsed > 1 THEN
    RETURN parsed / 100;
  END IF;
  RETURN parsed;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;
