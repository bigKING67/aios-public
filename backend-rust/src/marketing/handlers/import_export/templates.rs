use std::sync::Arc;

use axum::{extract::State, response::Response};

use crate::{
    auth::CurrentUser,
    error::AppResult,
    marketing::{
        csv::csv_response,
        template_xlsx::{build_creator_library_template_xlsx, xlsx_response},
        types::CSV_TEMPLATE,
    },
    state::AppState,
};

use super::super::{authz::ensure_read_permission, filter_options::query_cached_filter_options};

pub(in crate::marketing::handlers) async fn download_template_csv(
    current_user: CurrentUser,
) -> AppResult<Response> {
    ensure_read_permission(&current_user)?;
    Ok(csv_response(
        "influencer_library_template.csv",
        CSV_TEMPLATE.to_string(),
    ))
}

pub(in crate::marketing::handlers) async fn download_template_xlsx(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Response> {
    ensure_read_permission(&current_user)?;
    let filter_options = query_cached_filter_options(&state).await?;
    let body = build_creator_library_template_xlsx(&filter_options)?;
    Ok(xlsx_response("influencer_library_template.xlsx", body))
}
