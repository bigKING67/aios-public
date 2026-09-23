BEGIN;

DO $$
DECLARE
  v_definition TEXT;
  v_old_pattern TEXT := 'COALESCE\([[:space:]]*ROUND\(SUM\(qe\.refund_rate_1h \* qe\.overall_gmv\) / NULLIF\(SUM\(qe\.overall_gmv\), 0\), 6\),[[:space:]]*ROUND\(AVG\(qe\.refund_rate_1h\), 6\)[[:space:]]*\) AS qianchuan_refund_rate_1h';
  v_new_expression TEXT := $new$
      CASE
        WHEN COALESCE(
          SUM(qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL),
          0
        ) > 0
          THEN ROUND(
            SUM(qe.refund_rate_1h * qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL)
            / NULLIF(SUM(qe.overall_gmv) FILTER (WHERE qe.refund_rate_1h IS NOT NULL), 0),
            6
          )
        ELSE NULL::NUMERIC(18, 6)
      END AS qianchuan_refund_rate_1h
$new$;
BEGIN
  SELECT pg_get_functiondef('ads.refresh_douyin_shortvideo_detail(date,date)'::regprocedure)
  INTO v_definition;

  IF v_definition ~ v_old_pattern THEN
    EXECUTE REGEXP_REPLACE(v_definition, v_old_pattern, v_new_expression, 'm');
  ELSIF POSITION(v_new_expression IN v_definition) = 0 THEN
    RAISE EXCEPTION 'ads.refresh_douyin_shortvideo_detail refund_rate_1h expression is neither legacy nor expected';
  END IF;
END;
$$;

WITH expected AS (
  SELECT
    d.ctid AS row_id,
    qcalc.expected_refund_rate_1h
  FROM ads.douyin_shortvideo_detail d
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COALESCE(
          SUM(COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL),
          0
        ) > 0
          THEN ROUND(
            SUM(qsrc.refund_rate_1h * COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL)
            / NULLIF(
              SUM(COALESCE(qsrc.overall_gmv, 0)) FILTER (WHERE qsrc.refund_rate_1h IS NOT NULL),
              0
            ),
            6
          )
        ELSE NULL::NUMERIC(18, 6)
      END AS expected_refund_rate_1h
    FROM ods.douyin_qianchuan_shortvideo_raw qsrc
    WHERE qsrc.id = ANY(d.qianchuan_source_ids)
  ) qcalc ON TRUE
  WHERE d.qianchuan_metric_attributed = TRUE
    AND COALESCE(CARDINALITY(d.qianchuan_source_ids), 0) > 0
    AND d.qianchuan_refund_rate_1h IS DISTINCT FROM qcalc.expected_refund_rate_1h
)
UPDATE ads.douyin_shortvideo_detail d
SET
  qianchuan_refund_rate_1h = expected.expected_refund_rate_1h,
  updated_at = NOW()
FROM expected
WHERE d.ctid = expected.row_id;

COMMIT;
