use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    marketing::{
        bd_accounts::validate_auto_created_bd_count,
        repository::insert_creator,
        types::{
            CreatorLibraryImportError, CreatorLibraryImportRequest, CreatorLibraryImportResponse,
            CreatorLibraryInput,
        },
        validation::normalize_payload,
    },
    state::AppState,
};

use super::super::{
    authz::{ensure_write_permission, resolve_actor},
    request_helpers::{ensure_manual_creator_influencer_id, validate_import_size},
};
use super::owner_aliases::count_new_owner_aliases;

pub(in crate::marketing::handlers) async fn import_creators(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<CreatorLibraryImportRequest>,
) -> AppResult<Json<CreatorLibraryImportResponse>> {
    ensure_write_permission(&current_user)?;
    validate_import_size(payload.rows.len())?;
    validate_auto_created_bd_count(count_new_owner_aliases(&state, &payload.rows).await?)?;

    let actor = resolve_actor(&current_user);
    let mut imported = 0usize;
    let mut errors = Vec::new();

    for (index, row) in payload.rows.into_iter().enumerate() {
        match normalize_payload(row) {
            Ok(input) => {
                if let Err(error) = ensure_import_creator_required_fields(&input) {
                    match error {
                        AppError::BadRequest(message) => {
                            errors.push(CreatorLibraryImportError {
                                row: index + 1,
                                message,
                            });
                            continue;
                        }
                        other => return Err(other),
                    }
                }

                match insert_creator(&state.pool, &input, &actor, "csv_import").await {
                    Ok(_) => imported += 1,
                    Err(AppError::BadRequest(message)) => errors.push(CreatorLibraryImportError {
                        row: index + 1,
                        message,
                    }),
                    Err(AppError::Conflict(message)) => errors.push(CreatorLibraryImportError {
                        row: index + 1,
                        message,
                    }),
                    Err(AppError::Forbidden) => errors.push(CreatorLibraryImportError {
                        row: index + 1,
                        message: "只能导入新达人；已存在达人请在列表中编辑，避免覆盖他人修改。"
                            .to_string(),
                    }),
                    Err(error) => return Err(error),
                }
            }
            Err(AppError::BadRequest(message)) => errors.push(CreatorLibraryImportError {
                row: index + 1,
                message,
            }),
            Err(error) => return Err(error),
        }
    }

    if imported > 0 {
        state.creator_library_filter_cache.invalidate().await;
    }

    Ok(Json(CreatorLibraryImportResponse {
        imported,
        failed: errors.len(),
        errors,
    }))
}

fn ensure_import_creator_required_fields(input: &CreatorLibraryInput) -> AppResult<()> {
    ensure_manual_creator_influencer_id(&input.influencer_id)
}
