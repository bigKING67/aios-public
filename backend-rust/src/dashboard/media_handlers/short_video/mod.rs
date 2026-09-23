use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use tracing::error;

use crate::state::AppState;

use self::{
    payload::{build_short_video_payload, ShortVideoDataBundle},
    request::validate_short_video_query,
};
use super::super::errors::normalize_shortvideo_error_message;
use super::super::params::LiveQueryParams;
use super::super::responses::{json_message_response, json_value_response};
use super::super::shortvideo_details::fetch_douyin_shortvideo_detail_rows_bundle;
use super::super::shortvideo_summary::{
    fetch_douyin_shortvideo_as_of_date, fetch_douyin_shortvideo_data_date_bounds,
    fetch_douyin_shortvideo_totals_bundle, fetch_douyin_shortvideo_trend_bundle,
};

mod payload;
mod request;

pub(crate) async fn get_short_video(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LiveQueryParams>,
) -> Response {
    let dates = match validate_short_video_query(query) {
        Ok(value) => value,
        Err(error) => return error.into_response(),
    };

    let data = match fetch_short_video_data(&state, &dates).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_shortvideo_error_message(raw_error.as_str());
            error!(target: "dashboard-shortvideo", raw_error = %raw_error, "query failed");
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(StatusCode::OK, build_short_video_payload(&dates, data))
}

async fn fetch_short_video_data(
    state: &AppState,
    dates: &request::ShortVideoQueryDates,
) -> Result<ShortVideoDataBundle, String> {
    let (
        (min_date, max_date),
        as_of_date,
        (
            overview_current_totals,
            overview_previous_totals,
            self_current_totals,
            self_previous_totals,
            cooperation_current_totals,
            cooperation_previous_totals,
        ),
        (overview_trend, self_trend, cooperation_trend),
        (self_detail_rows, cooperation_detail_rows),
    ) = tokio::try_join!(
        fetch_douyin_shortvideo_data_date_bounds(&state.pool),
        fetch_douyin_shortvideo_as_of_date(
            &state.pool,
            dates.start_date.as_str(),
            dates.end_date.as_str()
        ),
        fetch_douyin_shortvideo_totals_bundle(
            &state.pool,
            dates.start_date.as_str(),
            dates.end_date.as_str(),
            dates.prev_start_date.as_str(),
            dates.prev_end_date.as_str(),
        ),
        fetch_douyin_shortvideo_trend_bundle(
            &state.pool,
            dates.start_date.as_str(),
            dates.end_date.as_str()
        ),
        fetch_douyin_shortvideo_detail_rows_bundle(
            &state.pool,
            dates.start_date.as_str(),
            dates.end_date.as_str()
        ),
    )?;

    Ok(ShortVideoDataBundle {
        min_date,
        max_date,
        as_of_date,
        overview_current_totals,
        overview_previous_totals,
        self_current_totals,
        self_previous_totals,
        cooperation_current_totals,
        cooperation_previous_totals,
        overview_trend,
        self_trend,
        cooperation_trend,
        self_detail_rows,
        cooperation_detail_rows,
    })
}
