\if :{?ddl_comment_check_strict}
\else
\set ddl_comment_check_strict false
\endif

WITH comment_objects AS (
  SELECT
    'table' AS object_type,
    FORMAT('%I.%I', n.nspname, c.relname) AS object_name,
    obj_description(c.oid, 'pg_class') AS comment_text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'column' AS object_type,
    FORMAT('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_name,
    col_description(c.oid, a.attnum) AS comment_text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    'index' AS object_type,
    FORMAT('%I.%I', ni.nspname, idx.relname) AS object_name,
    obj_description(idx.oid, 'pg_class') AS comment_text
  FROM pg_class tbl
  JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
  JOIN pg_index ix ON ix.indrelid = tbl.oid
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_namespace ni ON ni.oid = idx.relnamespace
  WHERE tbl.relkind IN ('r', 'p')
    AND nt.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'constraint' AS object_type,
    FORMAT('%I.%I.%I', n.nspname, tbl.relname, con.conname) AS object_name,
    obj_description(con.oid, 'pg_constraint') AS comment_text
  FROM pg_class tbl
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_constraint con ON con.conrelid = tbl.oid
  WHERE tbl.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'trigger' AS object_type,
    FORMAT('%I.%I.%I', n.nspname, tbl.relname, trg.tgname) AS object_name,
    obj_description(trg.oid, 'pg_trigger') AS comment_text
  FROM pg_class tbl
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_trigger trg ON trg.tgrelid = tbl.oid
  WHERE tbl.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND NOT trg.tgisinternal

  UNION ALL

  SELECT
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_type,
    FORMAT('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS object_name,
    obj_description(p.oid, 'pg_proc') AS comment_text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
classified AS (
  SELECT
    object_type,
    object_name,
    comment_text,
    CASE
      WHEN NULLIF(BTRIM(COALESCE(comment_text, '')), '') IS NULL THEN 'missing'
      WHEN comment_text !~ '[一-龥]' THEN 'non_chinese'
      ELSE 'ok'
    END AS comment_status
  FROM comment_objects
)
SELECT
  object_type,
  COUNT(*) AS object_count,
  COUNT(*) FILTER (WHERE comment_status = 'ok') AS ok_count,
  COUNT(*) FILTER (WHERE comment_status = 'missing') AS missing_count,
  COUNT(*) FILTER (WHERE comment_status = 'non_chinese') AS non_chinese_count
FROM classified
GROUP BY object_type
ORDER BY object_type;

WITH comment_objects AS (
  SELECT
    'table' AS object_type,
    FORMAT('%I.%I', n.nspname, c.relname) AS object_name,
    obj_description(c.oid, 'pg_class') AS comment_text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'column',
    FORMAT('%I.%I.%I', n.nspname, c.relname, a.attname),
    col_description(c.oid, a.attnum)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    'index',
    FORMAT('%I.%I', ni.nspname, idx.relname),
    obj_description(idx.oid, 'pg_class')
  FROM pg_class tbl
  JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
  JOIN pg_index ix ON ix.indrelid = tbl.oid
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_namespace ni ON ni.oid = idx.relnamespace
  WHERE tbl.relkind IN ('r', 'p')
    AND nt.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'constraint',
    FORMAT('%I.%I.%I', n.nspname, tbl.relname, con.conname),
    obj_description(con.oid, 'pg_constraint')
  FROM pg_class tbl
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_constraint con ON con.conrelid = tbl.oid
  WHERE tbl.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')

  UNION ALL

  SELECT
    'trigger',
    FORMAT('%I.%I.%I', n.nspname, tbl.relname, trg.tgname),
    obj_description(trg.oid, 'pg_trigger')
  FROM pg_class tbl
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_trigger trg ON trg.tgrelid = tbl.oid
  WHERE tbl.relkind IN ('r', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND NOT trg.tgisinternal

  UNION ALL

  SELECT
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END,
    FORMAT('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    obj_description(p.oid, 'pg_proc')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
classified AS (
  SELECT
    object_type,
    object_name,
    CASE
      WHEN NULLIF(BTRIM(COALESCE(comment_text, '')), '') IS NULL THEN 'missing'
      WHEN comment_text !~ '[一-龥]' THEN 'non_chinese'
      ELSE 'ok'
    END AS comment_status
  FROM comment_objects
)
SELECT object_type, object_name, comment_status
FROM classified
WHERE comment_status <> 'ok'
ORDER BY object_type, object_name
LIMIT 200;

\if :ddl_comment_check_strict
DO $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  WITH comment_objects AS (
    SELECT obj_description(c.oid, 'pg_class') AS comment_text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')

    UNION ALL

    SELECT col_description(c.oid, a.attnum)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND a.attnum > 0
      AND NOT a.attisdropped

    UNION ALL

    SELECT obj_description(idx.oid, 'pg_class')
    FROM pg_class tbl
    JOIN pg_namespace nt ON nt.oid = tbl.relnamespace
    JOIN pg_index ix ON ix.indrelid = tbl.oid
    JOIN pg_class idx ON idx.oid = ix.indexrelid
    WHERE tbl.relkind IN ('r', 'p')
      AND nt.nspname NOT IN ('pg_catalog', 'information_schema')

    UNION ALL

    SELECT obj_description(con.oid, 'pg_constraint')
    FROM pg_class tbl
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    JOIN pg_constraint con ON con.conrelid = tbl.oid
    WHERE tbl.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')

    UNION ALL

    SELECT obj_description(trg.oid, 'pg_trigger')
    FROM pg_class tbl
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    JOIN pg_trigger trg ON trg.tgrelid = tbl.oid
    WHERE tbl.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND NOT trg.tgisinternal

    UNION ALL

    SELECT obj_description(p.oid, 'pg_proc')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prokind IN ('f', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  )
  SELECT COUNT(*)
  INTO v_invalid_count
  FROM comment_objects
  WHERE NULLIF(BTRIM(COALESCE(comment_text, '')), '') IS NULL
     OR comment_text !~ '[一-龥]';

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'DDL Chinese comment coverage check failed, invalid objects: %', v_invalid_count;
  END IF;
END $$;
\endif
