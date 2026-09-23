export const QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL = `normalized_rows AS (
  SELECT
    library.id::TEXT AS id,
    library.xmin::TEXT AS row_version,
    library.tags,
    library.anchor_desc,
    library.updated_at,
    normalized.normalized_tags,
    CASE
      WHEN cardinality(normalized.normalized_tags) > 0
        THEN array_to_string(normalized.normalized_tags, '、')
      ELSE library.anchor_desc
    END AS expected_anchor_desc
  FROM ads.influencer_library library
  CROSS JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT normalized_tag
      FROM (
        SELECT CASE
          WHEN normalized_text = '' THEN NULL
          WHEN LOWER(REPLACE(REPLACE(normalized_text, '（', '('), '）', ')')) IN (
            '服饰','服装','服饰类','服装类','服饰主播','服装主播','服饰达人','服装达人',
            '服饰类主播','服装类主播','服饰垂类主播','服装垂类主播','服饰类达人','服装类达人',
            '服饰垂类达人','服装垂类达人'
          ) THEN '服饰主播'
          ELSE normalized_text
        END AS normalized_tag
        FROM (
          SELECT REGEXP_REPLACE(
            REGEXP_REPLACE(BTRIM(COALESCE(raw_tag, '')), '\\s+', '', 'g'),
            '(垂类|类)主播$', '主播'
          ) AS normalized_text
          FROM (
            SELECT unnest(COALESCE(library.tags, '{}'::TEXT[])) AS raw_tag
            UNION ALL
            SELECT regexp_split_to_table(COALESCE(library.anchor_desc, ''), '[，,、/;；]+') AS raw_tag
          ) raw_values
        ) prepared
      ) tag_values
      WHERE normalized_tag IS NOT NULL
      ORDER BY normalized_tag
    ) AS normalized_tags
  ) normalized
  WHERE library.is_deleted = FALSE
)`;

export const QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL = `CREATE OR REPLACE FUNCTION ads.fn_influencer_library_normalize_anchor_tag(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
  v_key TEXT;
BEGIN
  v_text := BTRIM(COALESCE(p_raw, ''));
  v_text := REGEXP_REPLACE(v_text, '\\s+', '', 'g');

  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  v_text := REGEXP_REPLACE(v_text, '(垂类|类)主播$', '主播');
  v_key := LOWER(REPLACE(REPLACE(v_text, '（', '('), '）', ')'));

  IF v_key IN (
    '服饰', '服装', '服饰类', '服装类', '服饰主播', '服装主播', '服饰达人', '服装达人',
    '服饰类主播', '服装类主播', '服饰垂类主播', '服装垂类主播', '服饰类达人', '服装类达人',
    '服饰垂类达人', '服装垂类达人'
  ) THEN
    RETURN '服饰主播';
  END IF;

  RETURN v_text;
END;
$$;

COMMENT ON FUNCTION ads.fn_influencer_library_normalize_anchor_tag(TEXT)
IS '达人库主播标签窄口径归一化：仅合并明确同义词，例如服饰/服装；并去掉垂类主播/类主播的冗余垂类后缀；不折叠穿搭、女装、美妆、彩妆、个护等业务子类。';`;
