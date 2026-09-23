mod fallback;
mod paid_funnel;
mod product_scope;
mod search_recommend;
mod selection_basis;

use sqlx::{postgres::PgRow, PgPool};

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub(super) struct ProductScope {
    pub(super) product_id: String,
    pub(super) product_name: String,
    pub(super) curr_gmv: f64,
    pub(super) prev_gmv: f64,
}

pub(super) async fn load_product_scope(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Option<ProductScope>> {
    product_scope::load_product_scope(pool, week_period).await
}

pub(super) async fn load_paid_funnel_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    paid_funnel::load_paid_funnel_rows(pool, week_period, product_id).await
}

pub(super) async fn load_search_recommend_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    search_recommend::load_search_recommend_rows(pool, week_period, product_id).await
}

pub(super) async fn load_selection_basis_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    selection_basis::load_selection_basis_rows(pool, week_period, product_id).await
}
