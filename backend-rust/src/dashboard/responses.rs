use axum::{
    body::Bytes,
    http::{
        header::{CACHE_CONTROL, CONTENT_TYPE},
        HeaderName, HeaderValue, StatusCode,
    },
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::{json, Value};

const SERVER_TIMING_HEADER: &str = "server-timing";

fn with_no_store_headers(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

pub(super) fn json_response<T>(status: StatusCode, payload: T) -> Response
where
    T: Serialize,
{
    with_no_store_headers((status, Json(payload)).into_response())
}

pub(super) fn json_value_response(status: StatusCode, payload: Value) -> Response {
    json_response(status, payload)
}

pub(super) fn response_with_server_timing(
    mut response: Response,
    server_timing: Option<HeaderValue>,
) -> Response {
    if let Some(value) = server_timing {
        response
            .headers_mut()
            .insert(HeaderName::from_static(SERVER_TIMING_HEADER), value);
    }
    response
}

pub(super) fn json_value_response_with_server_timing(
    status: StatusCode,
    payload: Value,
    server_timing: Option<HeaderValue>,
) -> Response {
    response_with_server_timing(json_value_response(status, payload), server_timing)
}

pub(super) fn json_bytes_response_with_server_timing(
    status: StatusCode,
    payload: Bytes,
    server_timing: Option<HeaderValue>,
) -> Response {
    let response = with_no_store_headers(
        (status, [(CONTENT_TYPE, "application/json")], payload).into_response(),
    );
    response_with_server_timing(response, server_timing)
}

pub(super) fn json_message_response(status: StatusCode, message: &str) -> Response {
    json_value_response(status, json!({ "message": message }))
}

pub(super) fn empty_response(status: StatusCode) -> Response {
    with_no_store_headers(status.into_response())
}

#[cfg(test)]
mod tests {
    use axum::{
        body::{to_bytes, Bytes},
        http::{header::CONTENT_TYPE, HeaderValue, StatusCode},
    };

    use serde::Serialize;

    use super::{
        json_bytes_response_with_server_timing, json_response, CACHE_CONTROL, SERVER_TIMING_HEADER,
    };

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct TypedPayload {
        sample_value: &'static str,
    }

    #[tokio::test]
    async fn typed_json_response_preserves_no_store_contract() {
        let response = json_response(StatusCode::CREATED, TypedPayload { sample_value: "ok" });

        assert_eq!(response.status(), StatusCode::CREATED);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            Bytes::from_static(br#"{"sampleValue":"ok"}"#)
        );
    }

    #[tokio::test]
    async fn cached_json_bytes_preserve_response_contract() {
        let response = json_bytes_response_with_server_timing(
            StatusCode::OK,
            Bytes::from_static(br#"{"ok":true}"#),
            Some(HeaderValue::from_static("cache_hit;dur=0.01")),
        );

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
        assert_eq!(
            response.headers()[SERVER_TIMING_HEADER],
            "cache_hit;dur=0.01"
        );
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            Bytes::from_static(br#"{"ok":true}"#)
        );
    }
}
