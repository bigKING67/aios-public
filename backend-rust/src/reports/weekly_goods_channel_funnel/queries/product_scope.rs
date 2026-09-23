use sqlx::{PgPool, Row};
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::super::super::summary_storage::is_undefined_table;
use super::ProductScope;

const PRODUCT_SCOPE_QUERY: &str = r#"
    WITH target_product AS (
        SELECT
            m.product_id,
            m.curr_gmv::DOUBLE PRECISION AS curr_gmv,
            m.prev_gmv::DOUBLE PRECISION AS prev_gmv
        FROM ads.report_taobao_trade_product_metrics_week m
        WHERE m.week_period = $1
          AND m.platform = 'taobao'
        ORDER BY
          CASE WHEN COALESCE(m.gmv_delta, 0) = 0 THEN 1 ELSE 0 END,
          ABS(COALESCE(m.gmv_delta, 0)) DESC,
          COALESCE(m.curr_gmv, 0) DESC,
          m.product_id
        LIMIT 1
    )
    SELECT
        t.product_id,
        COALESCE(latest_non_empty.product_name, '(未命名商品)') AS product_name,
        t.curr_gmv,
        t.prev_gmv
    FROM target_product t
    LEFT JOIN LATERAL (
        SELECT src_latest.product_name
        FROM ods.taobao_trade_sale_goods_raw src_latest
        WHERE src_latest.product_id = t.product_id
          AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
        ORDER BY
          src_latest.stat_date DESC,
          COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
        LIMIT 1
    ) AS latest_non_empty ON TRUE
"#;

pub(super) async fn load_product_scope(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Option<ProductScope>> {
    let product_row = match sqlx::query(PRODUCT_SCOPE_QUERY)
        .bind(week_period)
        .fetch_optional(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly goods channel funnel diagnosis skipped, product metrics table missing"
            );
            return Ok(None);
        }
        Err(error) => {
            error!(
                ?error,
                "query weekly goods channel funnel product scope failed"
            );
            return Err(AppError::Internal);
        }
    };

    let Some(product_row) = product_row else {
        return Ok(None);
    };

    let product_id = product_row
        .try_get::<String, _>("product_id")
        .unwrap_or_default();
    if product_id.trim().is_empty() {
        return Ok(None);
    }

    let product_name = product_row
        .try_get::<String, _>("product_name")
        .unwrap_or_else(|_| "(未命名商品)".to_string());
    let curr_gmv = product_row.try_get::<f64, _>("curr_gmv").unwrap_or(0.0);
    let prev_gmv = product_row.try_get::<f64, _>("prev_gmv").unwrap_or(0.0);

    Ok(Some(ProductScope {
        product_id,
        product_name,
        curr_gmv,
        prev_gmv,
    }))
}
