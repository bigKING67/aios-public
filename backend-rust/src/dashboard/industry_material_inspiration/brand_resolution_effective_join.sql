LEFT JOIN latest_brand_resolution brand_resolution
  ON brand_resolution.asset_id = material.asset_id
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN brand_resolution.is_manual_override THEN brand_resolution.brand_name
      WHEN brand_resolution.status = 'recognized'
        AND brand_resolution.brand_name IS NOT NULL
        AND brand_resolution.confidence >= 0.9000 THEN brand_resolution.brand_name
      ELSE NULLIF(BTRIM(material.brand_name), '')
    END AS brand_name,
    CASE
      WHEN brand_resolution.is_manual_override THEN brand_resolution.status
      WHEN brand_resolution.status = 'recognized'
        AND brand_resolution.brand_name IS NOT NULL
        AND brand_resolution.confidence >= 0.9000 THEN 'recognized'
      WHEN NULLIF(BTRIM(material.brand_name), '') IS NOT NULL THEN 'recognized'
      WHEN brand_resolution.status = 'recognized' THEN 'ambiguous'
      ELSE brand_resolution.status
    END AS status,
    CASE
      WHEN brand_resolution.is_manual_override
        OR (
          brand_resolution.status = 'recognized'
          AND brand_resolution.brand_name IS NOT NULL
          AND brand_resolution.confidence >= 0.9000
        ) THEN brand_resolution.primary_source
      WHEN NULLIF(BTRIM(material.brand_name), '') IS NOT NULL THEN 'title'
      ELSE brand_resolution.primary_source
    END AS source,
    CASE
      WHEN brand_resolution.is_manual_override
        OR (
          brand_resolution.status = 'recognized'
          AND brand_resolution.brand_name IS NOT NULL
          AND brand_resolution.confidence >= 0.9000
        ) THEN brand_resolution.confidence
      WHEN NULLIF(BTRIM(material.brand_name), '') IS NOT NULL THEN NULL
      ELSE brand_resolution.confidence
    END AS confidence,
    CASE
      WHEN brand_resolution.is_manual_override
        OR (
          brand_resolution.status = 'recognized'
          AND brand_resolution.brand_name IS NOT NULL
          AND brand_resolution.confidence >= 0.9000
        ) THEN brand_resolution.evidence_json
      WHEN NULLIF(BTRIM(material.brand_name), '') IS NOT NULL THEN NULL
      ELSE brand_resolution.evidence_json
    END AS evidence
) effective_brand
