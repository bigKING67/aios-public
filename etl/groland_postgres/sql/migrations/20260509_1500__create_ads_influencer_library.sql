BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;

CREATE OR REPLACE FUNCTION ads.fn_influencer_library_parse_number(p_raw TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
  v_match TEXT;
  v_multiplier NUMERIC := 1;
BEGIN
  v_text := BTRIM(COALESCE(p_raw, ''));
  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  IF v_text LIKE '%亿%' OR LOWER(v_text) LIKE '%bn%' THEN
    v_multiplier := 100000000;
  ELSIF v_text LIKE '%万%' OR LOWER(v_text) LIKE '%w%' THEN
    v_multiplier := 10000;
  ELSIF v_text LIKE '%千%' OR LOWER(v_text) LIKE '%k%' THEN
    v_multiplier := 1000;
  END IF;

  v_text := REPLACE(v_text, ',', '');
  v_match := SUBSTRING(v_text FROM '[-+]?[0-9]+[.][0-9]+|[-+]?[0-9]+');
  IF v_match IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN ROUND((v_match::NUMERIC * v_multiplier), 2);
END;
$$;

COMMENT ON FUNCTION ads.fn_influencer_library_parse_number(TEXT)
IS '达人库导入辅助函数：把 12.3万、¥1.2亿、1,234 等文本尽量解析为数值。';

CREATE OR REPLACE FUNCTION ads.fn_influencer_library_normalize_anchor_tag(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text TEXT;
  v_key TEXT;
BEGIN
  v_text := BTRIM(COALESCE(p_raw, ''));
  v_text := REGEXP_REPLACE(v_text, '\s+', '', 'g');

  IF v_text = '' THEN
    RETURN NULL;
  END IF;

  v_text := REGEXP_REPLACE(v_text, '(垂类|类)主播$', '主播');
  v_key := LOWER(REPLACE(REPLACE(v_text, '（', '('), '）', ')'));

  IF v_key IN (
    '服饰',
    '服装',
    '服饰类',
    '服装类',
    '服饰主播',
    '服装主播',
    '服饰达人',
    '服装达人',
    '服饰类主播',
    '服装类主播',
    '服饰垂类主播',
    '服装垂类主播',
    '服饰类达人',
    '服装类达人',
    '服饰垂类达人',
    '服装垂类达人'
  ) THEN
    RETURN '服饰主播';
  END IF;

  RETURN v_text;
END;
$$;

COMMENT ON FUNCTION ads.fn_influencer_library_normalize_anchor_tag(TEXT)
IS '达人库主播标签窄口径归一化：仅合并明确同义词，例如服饰/服装；并去掉垂类主播/类主播的冗余垂类后缀；不折叠穿搭、女装、美妆、彩妆、个护等业务子类。';

CREATE TABLE IF NOT EXISTS ads.influencer_library (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT '未分类',
  influencer_name TEXT NOT NULL,
  influencer_id TEXT,
  douyin_handle TEXT,
  phone TEXT,
  mcn TEXT,
  category TEXT,
  anchor_desc TEXT,
  anchor_level TEXT,
  main_platform_fans TEXT,
  main_platform_fans_count NUMERIC(18, 2),
  sales_30d TEXT,
  sales_30d_amount NUMERIC(18, 2),
  sales_90d TEXT,
  sales_90d_amount NUMERIC(18, 2),
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  cooperation_status TEXT,
  cooperation_status_norm TEXT NOT NULL DEFAULT '未分类',
  cooperation_desc TEXT,
  owner_name TEXT,
  is_cooperable BOOLEAN NOT NULL DEFAULT TRUE,
  last_followed_at DATE,
  next_follow_at DATE,
  follow_note TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_file_name TEXT,
  source_etl_loaded_at TIMESTAMP WITHOUT TIME ZONE,
  created_by TEXT,
  updated_by TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  library_dedupe_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN NULLIF(BTRIM(influencer_id), '') IS NOT NULL THEN
        'id:' || LOWER(BTRIM(platform)) || ':' || LOWER(BTRIM(influencer_id))
      ELSE
        'name:' || LOWER(BTRIM(platform)) || ':' || LOWER(BTRIM(influencer_name))
    END
  ) STORED,
  CONSTRAINT chk_influencer_library_platform_not_blank CHECK (BTRIM(platform) <> ''),
  CONSTRAINT chk_influencer_library_name_not_blank CHECK (BTRIM(influencer_name) <> ''),
  CONSTRAINT chk_influencer_library_source_type_not_blank CHECK (BTRIM(source_type) <> '')
);

ALTER TABLE ads.influencer_library
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT;

COMMENT ON TABLE ads.influencer_library
IS '营销达人库主表。初始数据来自飞书达人表，后续页面新增、编辑、跟进、BD 分配与 CSV 导入直接写入本表。';
COMMENT ON COLUMN ads.influencer_library.library_dedupe_key
IS '活动去重键：优先 platform + influencer_id，缺少达人 ID 时使用 platform + influencer_name。';
COMMENT ON COLUMN ads.influencer_library.source_type
IS '数据来源：manual、csv_import、feishu_live、feishu_live_outside 等。';
COMMENT ON COLUMN ads.influencer_library.cooperation_status_norm
IS '合作状态规范化字段：空值统一为 未分类，供筛选与 KPI 聚合使用。';
COMMENT ON COLUMN ads.influencer_library.created_by_user_id
IS '记录创建者账号 ID。NULL 表示飞书初始化公共记录，任何有达人库写权限的人可编辑；非 NULL 表示页面新增/导入记录，仅创建者可编辑或删除。';
COMMENT ON COLUMN ads.influencer_library.updated_by_user_id
IS '最近一次页面编辑或导入覆盖该记录的账号 ID。';
COMMENT ON COLUMN ads.influencer_library.is_deleted
IS '软删除标记。飞书初始化公共记录默认不允许页面删除；页面新增/导入记录仅创建者可软删除。';

CREATE UNIQUE INDEX IF NOT EXISTS ux_influencer_library_dedupe_active
  ON ads.influencer_library (library_dedupe_key)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_platform
  ON ads.influencer_library (platform)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_anchor_level
  ON ads.influencer_library (anchor_level)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_cooperation_status
  ON ads.influencer_library (cooperation_status_norm)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_owner
  ON ads.influencer_library (owner_name)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_created_by_user_id
  ON ads.influencer_library (created_by_user_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_last_followed
  ON ads.influencer_library (last_followed_at)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_next_follow
  ON ads.influencer_library (next_follow_at)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_fans_count
  ON ads.influencer_library (main_platform_fans_count DESC NULLS LAST)
  WHERE is_deleted = FALSE;

CREATE OR REPLACE FUNCTION ads.fn_touch_influencer_library_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_influencer_library_updated_at ON ads.influencer_library;

CREATE TRIGGER trg_touch_influencer_library_updated_at
BEFORE UPDATE ON ads.influencer_library
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_influencer_library_updated_at();

COMMENT ON TRIGGER trg_touch_influencer_library_updated_at ON ads.influencer_library
IS '更新达人库行时自动刷新 updated_at。';

CREATE OR REPLACE PROCEDURE ads.initialize_influencer_library_from_feishu_sources()
LANGUAGE plpgsql
AS $$
DECLARE
  v_source RECORD;
  v_latest_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_rows INTEGER := 0;
BEGIN
  FOR v_source IN
    SELECT *
    FROM (
      VALUES
        ('ods.feishu_influencer_live'::TEXT, 'feishu_live'::TEXT),
        ('ods.feishu_influencer_live_outside'::TEXT, 'feishu_live_outside'::TEXT)
    ) AS sources(table_name, source_type)
  LOOP
    IF to_regclass(v_source.table_name) IS NULL THEN
      RAISE NOTICE 'initialize influencer_library skipped missing source table: %', v_source.table_name;
      CONTINUE;
    END IF;

    EXECUTE FORMAT(
      'SELECT MAX((to_jsonb(src)->>''etl_loaded_at'')::TIMESTAMP WITHOUT TIME ZONE) FROM %s src',
      v_source.table_name
    )
    INTO v_latest_loaded_at;

    IF v_latest_loaded_at IS NULL THEN
      RAISE NOTICE 'initialize influencer_library skipped empty source table: %', v_source.table_name;
      CONTINUE;
    END IF;

    EXECUTE FORMAT($SQL$
      INSERT INTO ads.influencer_library (
        platform,
        influencer_name,
        influencer_id,
        anchor_desc,
        anchor_level,
        main_platform_fans,
        main_platform_fans_count,
        sales_30d,
        sales_30d_amount,
        sales_90d,
        sales_90d_amount,
        tags,
        cooperation_status,
        cooperation_status_norm,
        cooperation_desc,
        owner_name,
        is_cooperable,
        source_type,
        source_file_name,
        source_etl_loaded_at,
        created_by,
        updated_by,
        created_by_user_id,
        updated_by_user_id
      )
      WITH raw AS (
        SELECT to_jsonb(src) AS data
        FROM %s src
        WHERE (to_jsonb(src)->>'etl_loaded_at')::TIMESTAMP WITHOUT TIME ZONE = $1
      ),
      candidate AS (
        SELECT
          COALESCE(NULLIF(BTRIM(raw.data->>'platform'), ''), '未分类') AS platform,
          COALESCE(NULLIF(BTRIM(raw.data->>'influencer_name'), ''), '(未命名达人)') AS influencer_name,
          NULLIF(BTRIM(raw.data->>'influencer_id'), '') AS influencer_id,
          COALESCE(
            NULLIF(BTRIM(raw.data->>'anchor_desc'), ''),
            NULLIF(BTRIM(raw.data->>'anchor_tag'), ''),
            NULLIF(BTRIM(raw.data->>'fan_profile'), '')
          ) AS anchor_desc,
          NULLIF(BTRIM(raw.data->>'anchor_level'), '') AS anchor_level,
          NULLIF(BTRIM(raw.data->>'main_platform_fans'), '') AS main_platform_fans,
          ads.fn_influencer_library_parse_number(raw.data->>'main_platform_fans') AS main_platform_fans_count,
          COALESCE(
            NULLIF(BTRIM(raw.data->>'sales_30d'), ''),
            NULLIF(BTRIM(raw.data->>'avg_live_sales'), '')
          ) AS sales_30d,
          ads.fn_influencer_library_parse_number(
            COALESCE(raw.data->>'sales_30d', raw.data->>'avg_live_sales')
          ) AS sales_30d_amount,
          COALESCE(
            NULLIF(BTRIM(raw.data->>'sales_90d'), ''),
            NULLIF(BTRIM(raw.data->>'estimated_sales_amount'), '')
          ) AS sales_90d,
          ads.fn_influencer_library_parse_number(
            COALESCE(raw.data->>'sales_90d', raw.data->>'estimated_sales_amount')
          ) AS sales_90d_amount,
          COALESCE((
            SELECT ARRAY(
              SELECT normalized_tag
              FROM (
                SELECT DISTINCT
                  ads.fn_influencer_library_normalize_anchor_tag(tag) AS normalized_tag
                FROM regexp_split_to_table(
                  COALESCE(
                    NULLIF(BTRIM(raw.data->>'anchor_desc'), ''),
                    NULLIF(BTRIM(raw.data->>'anchor_tag'), ''),
                    NULLIF(BTRIM(raw.data->>'fan_profile'), '')
                  ),
                  '[,，/、;；]+'
                ) AS tag
              ) tag_values
              WHERE normalized_tag IS NOT NULL
              ORDER BY normalized_tag
            )
          ), '{}'::TEXT[]) AS tags,
          NULLIF(BTRIM(raw.data->>'cooperation_status'), '') AS cooperation_status,
          COALESCE(NULLIF(BTRIM(raw.data->>'cooperation_status'), ''), '未分类') AS cooperation_status_norm,
          COALESCE(
            NULLIF(BTRIM(raw.data->>'cooperation_desc'), ''),
            NULLIF(BTRIM(raw.data->>'progress_desc'), ''),
            NULLIF(BTRIM(raw.data->>'filing_status'), ''),
            NULLIF(BTRIM(raw.data->>'cooperation_mode'), '')
          ) AS cooperation_desc,
          NULLIF(BTRIM(raw.data->>'owner_name'), '') AS owner_name,
          CASE
            WHEN COALESCE(raw.data->>'cooperation_status', '') ~ '(不合作|不考虑|暂停|拉黑|无意向)' THEN FALSE
            ELSE TRUE
          END AS is_cooperable,
          $2::TEXT AS source_type,
          NULLIF(BTRIM(raw.data->>'source_file_name'), '') AS source_file_name,
          (raw.data->>'etl_loaded_at')::TIMESTAMP WITHOUT TIME ZONE AS source_etl_loaded_at,
          'migration' AS created_by,
          'migration' AS updated_by,
          NULL::TEXT AS created_by_user_id,
          NULL::TEXT AS updated_by_user_id
        FROM raw
      ),
      ranked AS (
        SELECT
          candidate.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              CASE
                WHEN candidate.influencer_id IS NOT NULL THEN
                  'id:' || LOWER(BTRIM(candidate.platform)) || ':' || LOWER(BTRIM(candidate.influencer_id))
                ELSE
                  'name:' || LOWER(BTRIM(candidate.platform)) || ':' || LOWER(BTRIM(candidate.influencer_name))
              END
            ORDER BY
              candidate.source_file_name NULLS LAST,
              candidate.influencer_id NULLS LAST,
              candidate.influencer_name,
              candidate.anchor_level NULLS LAST
          ) AS dedupe_rank
        FROM candidate
      )
      SELECT
        platform,
        influencer_name,
        influencer_id,
        anchor_desc,
        anchor_level,
        main_platform_fans,
        main_platform_fans_count,
        sales_30d,
        sales_30d_amount,
        sales_90d,
        sales_90d_amount,
        tags,
        cooperation_status,
        cooperation_status_norm,
        cooperation_desc,
        owner_name,
        is_cooperable,
        source_type,
        source_file_name,
        source_etl_loaded_at,
        created_by,
        updated_by,
        created_by_user_id,
        updated_by_user_id
      FROM ranked
      WHERE dedupe_rank = 1
      ON CONFLICT (library_dedupe_key) WHERE is_deleted = FALSE
      DO UPDATE SET
        platform = EXCLUDED.platform,
        influencer_name = EXCLUDED.influencer_name,
        influencer_id = EXCLUDED.influencer_id,
        anchor_desc = EXCLUDED.anchor_desc,
        anchor_level = EXCLUDED.anchor_level,
        main_platform_fans = EXCLUDED.main_platform_fans,
        main_platform_fans_count = EXCLUDED.main_platform_fans_count,
        sales_30d = EXCLUDED.sales_30d,
        sales_30d_amount = EXCLUDED.sales_30d_amount,
        sales_90d = EXCLUDED.sales_90d,
        sales_90d_amount = EXCLUDED.sales_90d_amount,
        tags = CASE
          WHEN cardinality(ads.influencer_library.tags) = 0 THEN EXCLUDED.tags
          ELSE ads.influencer_library.tags
        END,
        cooperation_status = EXCLUDED.cooperation_status,
        cooperation_status_norm = EXCLUDED.cooperation_status_norm,
        cooperation_desc = EXCLUDED.cooperation_desc,
        owner_name = COALESCE(EXCLUDED.owner_name, ads.influencer_library.owner_name),
        is_cooperable = EXCLUDED.is_cooperable,
        source_type = EXCLUDED.source_type,
        source_file_name = EXCLUDED.source_file_name,
        source_etl_loaded_at = EXCLUDED.source_etl_loaded_at,
        updated_by = 'migration',
        updated_by_user_id = NULL
    $SQL$, v_source.table_name)
    USING v_latest_loaded_at, v_source.source_type;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE NOTICE
      'initialize influencer_library source %, loaded_at %, affected_rows %',
      v_source.table_name,
      v_latest_loaded_at,
      v_rows;
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE ads.initialize_influencer_library_from_feishu_sources()
IS '达人库一次性初始化/补录过程：从 ods.feishu_influencer_live 与 ods.feishu_influencer_live_outside 最新批次写入 ads.influencer_library。';

CALL ads.initialize_influencer_library_from_feishu_sources();

COMMIT;
