use std::sync::Arc;

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::Response,
};
use serde_json::{json, Value};
use tracing::error;

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    access::normalize_text_input,
    errors::normalize_creator_shortvideo_error_message,
    responses::{json_message_response, json_value_response},
    validation::can_access_creator_shortvideo_dashboard,
};

use super::manual_attrs_access::{
    fetch_manual_attrs_target_access, CreatorShortVideoManualAttrsTargetAccess,
};

pub(crate) async fn upsert_creator_shortvideo_manual_attrs(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<Value>,
) -> Response {
    if !can_access_creator_shortvideo_dashboard(&current_user) {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号没有带货达人看板访问权限");
    }

    let author_douyin_id = normalize_payload_text(&payload, "authorDouyinId");
    if author_douyin_id.is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：authorDouyinId 不能为空",
        );
    }

    let author_name_snapshot = normalize_optional_payload_text(&payload, "authorNameSnapshot");
    let video_id = normalize_payload_text(&payload, "videoId");
    if video_id.is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：videoId 不能为空，人工字段按达人+视频维护",
        );
    }

    if !normalize_payload_text(&payload, "productId").is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：短视频人工字段按达人+视频维护，不支持按商品拆分",
        );
    }

    let product_id = String::new();
    let scope_type = "video";

    let has_fans_count = payload.get("fansCount").is_some();
    let fans_count = match normalize_optional_i64(&payload, "fansCount") {
        Ok(value) => value,
        Err(message) => return json_message_response(StatusCode::BAD_REQUEST, message),
    };
    if let Some(value) = fans_count {
        if value < 0 {
            return json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：粉丝量不能为负数",
            );
        }
    }

    let has_creator_type = payload.get("creatorType").is_some();
    let creator_type = normalize_optional_payload_text(&payload, "creatorType");
    let has_mcn = payload.get("mcn").is_some();
    let mcn = normalize_optional_payload_text(&payload, "mcn");
    let has_creator_fee_amount = payload.get("creatorFeeAmount").is_some();
    let creator_fee_amount = match normalize_optional_f64(&payload, "creatorFeeAmount") {
        Ok(value) => value,
        Err(message) => return json_message_response(StatusCode::BAD_REQUEST, message),
    };
    if let Some(value) = creator_fee_amount {
        if value < 0.0 {
            return json_message_response(
                StatusCode::BAD_REQUEST,
                "参数校验失败：达人费用不能为负数",
            );
        }
    }

    let has_creator_fee_type = payload.get("creatorFeeType").is_some();
    let creator_fee_type = normalize_optional_payload_text(&payload, "creatorFeeType");
    let has_creator_fee_note = payload.get("creatorFeeNote").is_some();
    let creator_fee_note = normalize_optional_payload_text(&payload, "creatorFeeNote");

    let target_access =
        match resolve_manual_attrs_target_access(&state.pool, &author_douyin_id, &video_id).await {
            Ok(value) => value,
            Err((status, message)) => return json_message_response(status, message),
        };
    if !target_access.can_edit(&current_user) {
        return json_message_response(
            StatusCode::FORBIDDEN,
            "当前账号没有该短视频人工字段维护权限",
        );
    }

    let actor_name = current_user.username.as_deref();
    let result = sqlx::query(
        r#"
        INSERT INTO ads.douyin_shortvideo_creator_manual_attrs (
          scope_type,
          platform,
          author_douyin_id,
          author_name_snapshot,
          video_id,
          product_id,
          fans_count,
          fans_count_updated_at,
          creator_type,
          mcn,
          creator_fee_amount,
          creator_fee_type,
          creator_fee_note,
          created_by_user_id,
          created_by_name,
          updated_by_user_id,
          updated_by_name,
          is_deleted
        )
        VALUES (
          $1,
          'douyin',
          $2,
          $3,
          $4,
          $5,
          CASE WHEN $6 THEN $7 ELSE NULL END,
          CASE WHEN $6 AND $7 IS NOT NULL THEN CURRENT_DATE ELSE NULL END,
          CASE WHEN $8 THEN $9 ELSE NULL END,
          CASE WHEN $10 THEN $11 ELSE NULL END,
          CASE WHEN $12 THEN $13::NUMERIC(18, 2) ELSE NULL END,
          CASE WHEN $14 THEN $15 ELSE NULL END,
          CASE WHEN $16 THEN $17 ELSE NULL END,
          $18,
          $19,
          $18,
          $19,
          FALSE
        )
        ON CONFLICT (scope_type, author_douyin_id, video_id, product_id)
        DO UPDATE SET
          author_name_snapshot = COALESCE(
            EXCLUDED.author_name_snapshot,
            ads.douyin_shortvideo_creator_manual_attrs.author_name_snapshot
          ),
          fans_count = CASE
            WHEN $6 THEN EXCLUDED.fans_count
            ELSE ads.douyin_shortvideo_creator_manual_attrs.fans_count
          END,
          fans_count_updated_at = CASE
            WHEN $6 THEN
              CASE WHEN EXCLUDED.fans_count IS NULL THEN NULL ELSE CURRENT_DATE END
            ELSE ads.douyin_shortvideo_creator_manual_attrs.fans_count_updated_at
          END,
          creator_type = CASE
            WHEN $8 THEN EXCLUDED.creator_type
            ELSE ads.douyin_shortvideo_creator_manual_attrs.creator_type
          END,
          mcn = CASE
            WHEN $10 THEN EXCLUDED.mcn
            ELSE ads.douyin_shortvideo_creator_manual_attrs.mcn
          END,
          creator_fee_amount = CASE
            WHEN $12 THEN EXCLUDED.creator_fee_amount
            ELSE ads.douyin_shortvideo_creator_manual_attrs.creator_fee_amount
          END,
          creator_fee_type = CASE
            WHEN $14 THEN EXCLUDED.creator_fee_type
            ELSE ads.douyin_shortvideo_creator_manual_attrs.creator_fee_type
          END,
          creator_fee_note = CASE
            WHEN $16 THEN EXCLUDED.creator_fee_note
            ELSE ads.douyin_shortvideo_creator_manual_attrs.creator_fee_note
          END,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_name = EXCLUDED.updated_by_name,
          is_deleted = FALSE
        "#,
    )
    .bind(scope_type)
    .bind(author_douyin_id.as_str())
    .bind(author_name_snapshot.as_deref())
    .bind(video_id.as_str())
    .bind(product_id.as_str())
    .bind(has_fans_count)
    .bind(fans_count)
    .bind(has_creator_type)
    .bind(creator_type.as_deref())
    .bind(has_mcn)
    .bind(mcn.as_deref())
    .bind(has_creator_fee_amount)
    .bind(creator_fee_amount)
    .bind(has_creator_fee_type)
    .bind(creator_fee_type.as_deref())
    .bind(has_creator_fee_note)
    .bind(creator_fee_note.as_deref())
    .bind(current_user.user_id.as_str())
    .bind(actor_name)
    .execute(&state.pool)
    .await;

    if let Err(raw_error) = result {
        let message = normalize_creator_shortvideo_error_message(raw_error.to_string().as_str());
        error!(
            target: "dashboard-creator-shortvideo-manual-attrs",
            raw_error = %raw_error,
            "upsert failed"
        );
        return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
    }

    json_value_response(StatusCode::OK, json!({ "ok": true }))
}

pub(crate) async fn delete_creator_shortvideo_manual_attrs(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<Value>,
) -> Response {
    if !can_access_creator_shortvideo_dashboard(&current_user) {
        return json_message_response(StatusCode::FORBIDDEN, "当前账号没有带货达人看板访问权限");
    }

    let author_douyin_id = normalize_payload_text(&payload, "authorDouyinId");
    if author_douyin_id.is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：authorDouyinId 不能为空",
        );
    }

    let video_id = normalize_payload_text(&payload, "videoId");
    if video_id.is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：videoId 不能为空，人工字段按达人+视频维护",
        );
    }

    if !normalize_payload_text(&payload, "productId").is_empty() {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：短视频人工字段按达人+视频维护，不支持按商品拆分",
        );
    }

    let target_access =
        match resolve_manual_attrs_target_access(&state.pool, &author_douyin_id, &video_id).await {
            Ok(value) => value,
            Err((status, message)) => return json_message_response(status, message),
        };
    if !target_access.can_edit(&current_user) {
        return json_message_response(
            StatusCode::FORBIDDEN,
            "当前账号没有该短视频人工字段删除权限",
        );
    }

    let result = sqlx::query(
        r#"
        UPDATE ads.douyin_shortvideo_creator_manual_attrs
        SET
          is_deleted = TRUE,
          updated_by_user_id = $3,
          updated_by_name = $4
        WHERE platform = 'douyin'
          AND scope_type = 'video'
          AND author_douyin_id = $1
          AND video_id = $2
          AND product_id = ''
          AND is_deleted = FALSE
        "#,
    )
    .bind(author_douyin_id.as_str())
    .bind(video_id.as_str())
    .bind(current_user.user_id.as_str())
    .bind(current_user.username.as_deref())
    .execute(&state.pool)
    .await;

    let rows_affected = match result {
        Ok(value) => value.rows_affected(),
        Err(raw_error) => {
            let message =
                normalize_creator_shortvideo_error_message(raw_error.to_string().as_str());
            error!(
                target: "dashboard-creator-shortvideo-manual-attrs",
                raw_error = %raw_error,
                "soft delete failed"
            );
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_value_response(
        StatusCode::OK,
        json!({ "ok": true, "deleted": rows_affected > 0 }),
    )
}

async fn resolve_manual_attrs_target_access(
    pool: &sqlx::PgPool,
    author_douyin_id: &str,
    video_id: &str,
) -> Result<CreatorShortVideoManualAttrsTargetAccess, (StatusCode, &'static str)> {
    match fetch_manual_attrs_target_access(pool, author_douyin_id, video_id).await {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Err((
            StatusCode::BAD_REQUEST,
            "参数校验失败：该达人不在当前短视频挂车罗盘事实数据中",
        )),
        Err(_) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "短视频人工字段权限校验失败，请稍后重试",
        )),
    }
}

fn normalize_payload_text(payload: &Value, field: &str) -> String {
    match payload.get(field) {
        Some(Value::String(value)) => normalize_text_input(Some(value.as_str())),
        Some(Value::Number(value)) => value.to_string().trim().to_string(),
        _ => String::new(),
    }
}

fn normalize_optional_payload_text(payload: &Value, field: &str) -> Option<String> {
    let value = normalize_payload_text(payload, field);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_optional_i64(payload: &Value, field: &str) -> Result<Option<i64>, &'static str> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_i64()
            .map(Some)
            .ok_or("参数校验失败：粉丝量必须是整数"),
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                trimmed
                    .parse::<i64>()
                    .map(Some)
                    .map_err(|_| "参数校验失败：粉丝量必须是整数")
            }
        }
        _ => Err("参数校验失败：粉丝量必须是整数"),
    }
}

fn normalize_optional_f64(payload: &Value, field: &str) -> Result<Option<f64>, &'static str> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_f64()
            .map(Some)
            .ok_or("参数校验失败：达人费用必须是数字"),
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                trimmed
                    .parse::<f64>()
                    .map(Some)
                    .map_err(|_| "参数校验失败：达人费用必须是数字")
            }
        }
        _ => Err("参数校验失败：达人费用必须是数字"),
    }
}
