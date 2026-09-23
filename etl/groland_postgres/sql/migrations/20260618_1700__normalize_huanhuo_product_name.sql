BEGIN;

UPDATE ads.marketing_content_assets
SET product_name = '焕活精华（绿瓶）'
WHERE product_name = '唤活精华（绿瓶）';

WITH normalized_items AS (
  SELECT
    asset.asset_id,
    CASE
      WHEN item.value = '唤活精华（绿瓶）' THEN '焕活精华（绿瓶）'
      ELSE item.value
    END AS value,
    item.ordinality
  FROM ads.marketing_content_assets asset
  CROSS JOIN LATERAL UNNEST(asset.product_names) WITH ORDINALITY AS item(value, ordinality)
  WHERE asset.product_names @> ARRAY['唤活精华（绿瓶）']::TEXT[]
),
deduped_items AS (
  SELECT
    asset_id,
    value,
    MIN(ordinality) AS first_ordinality
  FROM normalized_items
  GROUP BY asset_id, value
),
normalized_arrays AS (
  SELECT
    asset_id,
    ARRAY_AGG(value ORDER BY first_ordinality)::TEXT[] AS product_names
  FROM deduped_items
  GROUP BY asset_id
)
UPDATE ads.marketing_content_assets asset
SET product_names = normalized_arrays.product_names
FROM normalized_arrays
WHERE asset.asset_id = normalized_arrays.asset_id
  AND asset.product_names IS DISTINCT FROM normalized_arrays.product_names;

DO $$
BEGIN
  IF to_regclass('ads.douyin_shortvideo_detail') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'ads'
         AND table_name = 'douyin_shortvideo_detail'
         AND column_name = 'asset_product_names'
     )
  THEN
    WITH normalized_items AS (
      SELECT
        detail.ctid AS row_ctid,
        CASE
          WHEN item.value = '唤活精华（绿瓶）' THEN '焕活精华（绿瓶）'
          ELSE item.value
        END AS value,
        item.ordinality
      FROM ads.douyin_shortvideo_detail detail
      CROSS JOIN LATERAL UNNEST(detail.asset_product_names) WITH ORDINALITY AS item(value, ordinality)
      WHERE detail.asset_product_names @> ARRAY['唤活精华（绿瓶）']::TEXT[]
    ),
    deduped_items AS (
      SELECT
        row_ctid,
        value,
        MIN(ordinality) AS first_ordinality
      FROM normalized_items
      GROUP BY row_ctid, value
    ),
    normalized_arrays AS (
      SELECT
        row_ctid,
        ARRAY_AGG(value ORDER BY first_ordinality)::TEXT[] AS asset_product_names
      FROM deduped_items
      GROUP BY row_ctid
    )
    UPDATE ads.douyin_shortvideo_detail detail
    SET asset_product_names = normalized_arrays.asset_product_names
    FROM normalized_arrays
    WHERE detail.ctid = normalized_arrays.row_ctid
      AND detail.asset_product_names IS DISTINCT FROM normalized_arrays.asset_product_names;
  END IF;
END $$;

COMMIT;
