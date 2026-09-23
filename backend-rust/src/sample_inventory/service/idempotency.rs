use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};

use crate::error::{AppError, AppResult};

use super::events::database_error;

pub(super) enum MutationClaim {
    New(i64),
    Replay(Value),
}

pub(super) fn request_sha256<T: Serialize>(request: &T) -> AppResult<String> {
    let bytes = serde_json::to_vec(request).map_err(|_| AppError::Internal)?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

pub(super) fn validate_submission_key(value: &str) -> AppResult<&str> {
    let normalized = value.trim();
    if normalized.len() < 8 || normalized.len() > 128 {
        return Err(AppError::bad_request(
            "submissionKey长度必须在8到128个字符之间",
        ));
    }
    Ok(normalized)
}

pub(super) fn normalize_submission_key(value: &mut String) -> AppResult<()> {
    *value = validate_submission_key(value)?.to_string();
    Ok(())
}

pub(super) async fn claim_mutation(
    tx: &mut Transaction<'_, Postgres>,
    operation: &str,
    submission_key: &str,
    request_sha256: &str,
    actor_user_id: &str,
) -> AppResult<MutationClaim> {
    let submission_key = validate_submission_key(submission_key)?;
    let inserted_id: Option<i64> = sqlx::query_scalar(
        r#"
        INSERT INTO sample_inventory.mutation_requests (
          operation,
          submission_key,
          request_sha256,
          actor_user_id
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (operation, submission_key) DO NOTHING
        RETURNING id
        "#,
    )
    .bind(operation)
    .bind(submission_key)
    .bind(request_sha256)
    .bind(actor_user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "claim_mutation"))?;

    if let Some(id) = inserted_id {
        return Ok(MutationClaim::New(id));
    }

    let row = sqlx::query(
        r#"
        SELECT id, request_sha256, actor_user_id, response_payload
        FROM sample_inventory.mutation_requests
        WHERE operation = $1 AND submission_key = $2
        FOR UPDATE
        "#,
    )
    .bind(operation)
    .bind(submission_key)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| database_error(error, "load_claimed_mutation"))?
    .ok_or(AppError::Internal)?;

    let existing_sha: String = row
        .try_get("request_sha256")
        .map_err(|error| database_error(error, "map_claimed_mutation"))?;
    let existing_actor: String = row
        .try_get("actor_user_id")
        .map_err(|error| database_error(error, "map_claimed_mutation"))?;
    if existing_sha != request_sha256 || existing_actor != actor_user_id {
        return Err(AppError::Conflict(
            "submissionKey已用于不同请求，请生成新的提交标识".to_string(),
        ));
    }

    let response: Option<Value> = row
        .try_get("response_payload")
        .map_err(|error| database_error(error, "map_claimed_mutation"))?;
    response
        .map(MutationClaim::Replay)
        .ok_or(AppError::Internal)
}

pub(super) async fn complete_mutation<T: Serialize>(
    tx: &mut Transaction<'_, Postgres>,
    mutation_id: i64,
    response: &T,
) -> AppResult<()> {
    let response = serde_json::to_value(response).map_err(|_| AppError::Internal)?;
    let updated = sqlx::query(
        r#"
        UPDATE sample_inventory.mutation_requests
        SET response_payload = $2, completed_at = NOW()
        WHERE id = $1 AND response_payload IS NULL
        "#,
    )
    .bind(mutation_id)
    .bind(response)
    .execute(&mut **tx)
    .await
    .map_err(|error| database_error(error, "complete_mutation"))?;
    if updated.rows_affected() != 1 {
        return Err(AppError::Internal);
    }
    Ok(())
}

pub(super) fn replay_response<T>(value: Value) -> AppResult<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(value).map_err(|_| AppError::Internal)
}

#[cfg(test)]
mod tests {
    use serde::Serialize;

    use super::{normalize_submission_key, request_sha256, validate_submission_key};

    #[derive(Serialize)]
    struct FixtureRequest<'a> {
        name: &'a str,
        quantity: i32,
    }

    #[test]
    fn request_hash_is_stable_and_submission_keys_are_bounded() {
        let request = FixtureRequest {
            name: "sample",
            quantity: 2,
        };
        assert_eq!(
            request_sha256(&request).unwrap(),
            request_sha256(&request).unwrap()
        );
        assert!(validate_submission_key("12345678").is_ok());
        assert!(validate_submission_key("short").is_err());

        let mut required = "  request-123  ".to_string();
        normalize_submission_key(&mut required).unwrap();
        assert_eq!(required, "request-123");
    }

    #[test]
    fn every_sample_inventory_mutation_uses_the_ledger() {
        fn function_body<'a>(source: &'a str, name: &str) -> &'a str {
            let marker = format!("pub(crate) async fn {name}(");
            let start = source
                .find(&marker)
                .unwrap_or_else(|| panic!("missing {name}"));
            let remaining = &source[start + marker.len()..];
            let end = remaining
                .find("\npub(crate) async fn ")
                .unwrap_or(remaining.len());
            &remaining[..end]
        }

        let sources = [
            (include_str!("settings.rs"), &["update_settings"] as &[&str]),
            (
                include_str!("samples.rs"),
                &[
                    "create_sample",
                    "import_sample_rows",
                    "update_sample",
                    "adjust_sample",
                    "archive_sample",
                    "archive_sample_batch",
                ],
            ),
            (
                include_str!("inbounds.rs"),
                &[
                    "create_inbound",
                    "create_inbound_batch",
                    "import_inbound_rows",
                    "void_inbound",
                    "void_inbound_batch",
                ],
            ),
            (
                include_str!("outbounds.rs"),
                &[
                    "create_outbound",
                    "update_outbound",
                    "update_outbound_tracking",
                    "transition_outbound",
                ],
            ),
            (
                include_str!("outbound_batches.rs"),
                &[
                    "create_outbound_batch",
                    "update_outbound_tracking_batch",
                    "transition_outbound_batch",
                    "edit_outbound_batch",
                    "archive_outbound_batch",
                ],
            ),
            (include_str!("backup_restore.rs"), &["restore_backup"]),
        ];

        for (source, functions) in sources {
            for name in functions {
                let body = function_body(source, name);
                assert!(
                    body.contains("claim_mutation("),
                    "{name} must claim the mutation"
                );
                assert!(
                    body.contains("complete_mutation("),
                    "{name} must complete the mutation in the same transaction"
                );
                assert!(
                    body.contains("MutationClaim::Replay"),
                    "{name} must support exact replay"
                );
            }
        }
    }
}
