DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.marketing_industry_article_sources') IS NULL THEN
    RAISE EXCEPTION 'table ads.marketing_industry_article_sources not found';
  END IF;

  IF to_regclass('ads.marketing_industry_articles') IS NULL THEN
    RAISE EXCEPTION 'table ads.marketing_industry_articles not found';
  END IF;

  IF to_regclass('etl.marketing_industry_article_sync_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.marketing_industry_article_sync_state not found';
  END IF;

  IF to_regclass('etl.marketing_industry_article_upstream_status') IS NULL THEN
    RAISE EXCEPTION 'table etl.marketing_industry_article_upstream_status not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ux_marketing_industry_articles_source_url'
      AND conrelid = 'ads.marketing_industry_articles'::REGCLASS
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION 'unique index ux_marketing_industry_articles_source_url not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.marketing_industry_article_sources
  WHERE BTRIM(source_fakeid) = ''
     OR source_priority NOT IN ('low', 'normal', 'high')
     OR consecutive_failures < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry source basic check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.marketing_industry_articles
  WHERE BTRIM(title) = ''
     OR BTRIM(article_url) = ''
     OR content_status NOT IN ('list_only', 'content_fetched', 'content_failed')
     OR fetch_source NOT IN ('api_list', 'api_article', 'rss_fallback')
     OR jsonb_typeof(images) <> 'array';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry article basic check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.marketing_industry_articles article
  LEFT JOIN ads.marketing_industry_article_sources source
    ON source.source_fakeid = article.source_fakeid
  WHERE source.source_fakeid IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry article source reference check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT source_fakeid, article_url
    FROM ads.marketing_industry_articles
    GROUP BY source_fakeid, article_url
    HAVING COUNT(*) > 1
  ) duplicated;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry article unique url check failed, duplicated keys: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT source_fakeid
    FROM etl.marketing_industry_article_sync_state
    GROUP BY source_fakeid
    HAVING COUNT(*) > 1
  ) duplicated;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry sync state uniqueness check failed, duplicated keys: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.marketing_industry_article_upstream_status
  WHERE status_key <> 'wechat_download_api'
     OR login_status NOT IN ('ok', 'expired', 'unavailable', 'unknown');

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'marketing industry upstream status basic check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'ads.marketing_industry_articles checks passed';
END;
$$;
