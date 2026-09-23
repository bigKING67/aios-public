use std::sync::Arc;

use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};

use super::super::{
    access::normalize_text_input,
    responses::{json_message_response, json_response},
    validation::{
        get_validated_date_param, is_date_range_within_limit, is_query_note_platform,
        is_valid_date_literal, resolve_max_query_date_range_days,
    },
};
use super::{
    model::{DashboardDailyNotesResponse, NotesQueryParams},
    repository::{fetch_note_counts_by_date, list_note_entities},
    response_helpers::database_error_response,
};

pub(crate) async fn list_notes(
    State(state): State<Arc<AppState>>,
    Query(query): Query<NotesQueryParams>,
) -> Response {
    let start_date = get_validated_date_param(query.start_date.as_deref());
    let end_date = get_validated_date_param(query.end_date.as_deref());
    let platform_raw = normalize_text_input(query.platform.as_deref());
    let platform = if platform_raw.is_empty() {
        "overview".to_string()
    } else {
        platform_raw
    };
    let include_rows_raw = normalize_text_input(query.include_rows.as_deref());
    let Some(include_rows) = parse_include_rows(include_rows_raw.as_str()) else {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：include_rows 只支持 0 或 1",
        );
    };

    let note_date_raw = normalize_text_input(query.note_date.as_deref());
    let note_date = if note_date_raw.is_empty() || !is_valid_date_literal(note_date_raw.as_str()) {
        None
    } else {
        Some(note_date_raw)
    };

    if start_date.is_none() || end_date.is_none() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date/end_date 必须为 YYYY-MM-DD",
        );
    }
    if !is_query_note_platform(platform.as_str()) {
        return json_message_response(StatusCode::BAD_REQUEST, "参数校验失败：platform 不合法");
    }

    let start_date = start_date.expect("validated above");
    let end_date = end_date.expect("validated above");

    if start_date > end_date {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：start_date 不能晚于 end_date",
        );
    }

    if !is_date_range_within_limit(
        start_date.as_str(),
        end_date.as_str(),
        resolve_max_query_date_range_days(),
    ) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：查询区间超过允许范围",
        );
    }

    if let Some(note_date) = note_date.as_deref() {
        if note_date < start_date.as_str() || note_date > end_date.as_str() {
            return json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：note_date 必须落在查询区间内",
            );
        }
    }

    let counts_by_date = match fetch_note_counts_by_date(
        &state.pool,
        start_date.as_str(),
        end_date.as_str(),
        platform.as_str(),
    )
    .await
    {
        Ok(value) => value,
        Err(error) => return database_error_response("查询日报失败", error.as_str()),
    };

    let rows_payload = if include_rows {
        match list_note_entities(
            &state.pool,
            start_date.as_str(),
            end_date.as_str(),
            platform.as_str(),
            note_date.as_deref(),
        )
        .await
        {
            Ok(rows) => rows,
            Err(error) => return database_error_response("查询日报失败", error.as_str()),
        }
    } else {
        Vec::new()
    };

    json_response(
        StatusCode::OK,
        DashboardDailyNotesResponse {
            start_date,
            end_date,
            platform,
            include_rows,
            note_date: note_date.unwrap_or_default(),
            rows: rows_payload,
            counts_by_date,
        },
    )
}

fn parse_include_rows(value: &str) -> Option<bool> {
    match value {
        "" | "1" => Some(true),
        "0" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_include_rows;

    #[test]
    fn include_rows_accepts_only_the_documented_boolean_literals() {
        assert_eq!(parse_include_rows(""), Some(true));
        assert_eq!(parse_include_rows("1"), Some(true));
        assert_eq!(parse_include_rows("0"), Some(false));
        assert_eq!(parse_include_rows("true"), None);
    }
}
