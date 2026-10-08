//! Guard and route-grammar tests. Kept outside `mod.rs` so the OpenAPI route
//! extractor only sees production `.route(...)` calls.
use super::{access::StudioAccess, guard};
use crate::{auth::CurrentUser, error::AppError};

fn user(roles: &[&str]) -> CurrentUser {
    CurrentUser {
        user_id: "studio-user".into(),
        username: None,
        roles: roles.iter().map(|role| (*role).to_string()).collect(),
        permissions: Vec::new(),
    }
}

#[test]
fn guard_requires_flag_then_write_scope() {
    let mut settings = super::super::handlers::qianchuan_http_route_tests::fixture_settings(
        "postgres://fixture".into(),
    );
    assert!(!settings.content_ai_studio_enabled);
    assert!(matches!(
        guard(&settings, &user(&["content_ops"]), false),
        Err(AppError::ServiceUnavailable(_))
    ));
    settings.content_ai_studio_enabled = true;
    assert!(guard(&settings, &user(&[]), false).is_ok());
    assert!(matches!(
        guard(&settings, &user(&[]), true),
        Err(AppError::Forbidden)
    ));
    assert!(guard(&settings, &user(&["content_ops"]), true).is_ok());
    let anonymous = CurrentUser {
        user_id: " ".into(),
        ..user(&[])
    };
    assert!(matches!(
        guard(&settings, &anonymous, false),
        Err(AppError::Unauthorized)
    ));
}

#[test]
fn open_access_guard_needs_only_a_sign_in_for_writes() {
    let mut settings = super::super::handlers::qianchuan_http_route_tests::fixture_settings(
        "postgres://fixture".into(),
    );
    settings.content_ai_studio_enabled = true;
    settings.content_ai_studio_open_access = true;
    assert_eq!(
        guard(&settings, &user(&[]), true).unwrap(),
        StudioAccess::OPEN
    );
    assert_eq!(
        guard(&settings, &user(&[]), false).unwrap(),
        StudioAccess::OPEN
    );
    let anonymous = CurrentUser {
        user_id: "".into(),
        ..user(&[])
    };
    assert!(matches!(
        guard(&settings, &anonymous, true),
        Err(AppError::Unauthorized)
    ));
    settings.content_ai_studio_enabled = false;
    assert!(matches!(
        guard(&settings, &user(&[]), true),
        Err(AppError::ServiceUnavailable(_))
    ));
    settings.content_ai_studio_enabled = true;
    settings.content_ai_studio_open_access = false;
    assert!(matches!(
        guard(&settings, &user(&[]), true),
        Err(AppError::Forbidden)
    ));
    assert_eq!(
        guard(&settings, &user(&["content_ops"]), true).unwrap(),
        StudioAccess::SCOPED
    );
}

#[test]
fn access_mode_maps_to_source_permission_and_batch_owner_filter() {
    use crate::marketing::content_assets::production::framework_remix::SourcePermission;
    let viewer = user(&[]);
    assert_eq!(
        StudioAccess::OPEN.source_permission(),
        SourcePermission::Skip
    );
    assert_eq!(
        StudioAccess::SCOPED.source_permission(),
        SourcePermission::Enforce
    );
    assert_eq!(StudioAccess::OPEN.batch_owner(&viewer), None);
    assert_eq!(
        StudioAccess::SCOPED.batch_owner(&viewer),
        Some("studio-user")
    );
}

#[tokio::test]
async fn colon_action_route_does_not_shadow_segment_ids() {
    use axum::{
        routing::{get, patch, post},
        Router,
    };
    // Same path grammar as `router()`, with stub handlers on a loopback server.
    let app: Router = Router::new()
        .route("/studio/segments", get(|| async { "list" }))
        .route("/studio/segments:confirm", post(|| async { "confirm" }))
        .route("/studio/segments/{segment_id}", patch(|| async { "patch" }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    for (method, path, status, body) in [
        (
            reqwest::Method::POST,
            "/studio/segments:confirm",
            200,
            "confirm",
        ),
        (
            reqwest::Method::PATCH,
            "/studio/segments/00000000-0000-0000-0000-000000000001",
            200,
            "patch",
        ),
        (reqwest::Method::GET, "/studio/segments", 200, "list"),
        (reqwest::Method::POST, "/studio/segments:other", 404, ""),
    ] {
        let response = client
            .request(method, format!("{base}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), status, "{path}");
        if status == 200 {
            assert_eq!(response.text().await.unwrap(), body);
        }
    }
    server.abort();
}
