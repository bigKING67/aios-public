use sqlx::PgPool;

use super::row_values::collect_optional_strings;

pub(super) async fn query_permissions_auth(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT p.key
        FROM auth_user_roles ur
        JOIN auth_role_permissions rp ON rp.role_id = ur.role_id
        JOIN auth_permissions p ON p.id = rp.permission_id
        WHERE CAST(ur.user_id AS TEXT) = $1
        ORDER BY p.key
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "key"))
}

pub(super) async fn query_permissions_users(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT p.code
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
        ORDER BY p.code
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "code"))
}

pub(super) async fn query_permissions_ods(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT p.code
        FROM ods_aios_user_roles ur
        JOIN ods_aios_roles r ON r.id = ur.role_id
        JOIN ods_aios_role_permissions rp ON rp.role_id = r.id
        JOIN ods_aios_permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1
          AND COALESCE(r.is_active, TRUE) = TRUE
          AND COALESCE(r.is_deleted, FALSE) = FALSE
          AND COALESCE(p.is_active, TRUE) = TRUE
          AND COALESCE(p.is_deleted, FALSE) = FALSE
          AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
          AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)
        ORDER BY p.code
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(collect_optional_strings(rows, "code"))
}
