use sqlx::PgPool;

pub(super) async fn backfill_follow_log_from_legacy_columns(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO ads.influencer_library_follow_log (
          influencer_library_id,
          followed_at,
          follow_note,
          created_by,
          updated_by,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        )
        SELECT
          library.id,
          COALESCE(
            library.last_followed_at::TIMESTAMP WITHOUT TIME ZONE,
            date_trunc('minute', library.updated_at),
            date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
          ),
          COALESCE(NULLIF(BTRIM(library.follow_note), ''), '旧系统跟进记录'),
          COALESCE(NULLIF(BTRIM(library.updated_by), ''), NULLIF(BTRIM(library.created_by), ''), 'migration'),
          COALESCE(NULLIF(BTRIM(library.updated_by), ''), NULLIF(BTRIM(library.created_by), ''), 'migration'),
          COALESCE(library.updated_by_user_id, library.created_by_user_id),
          COALESCE(library.updated_by_user_id, library.created_by_user_id),
          COALESCE(library.updated_at, library.created_at, NOW()),
          COALESCE(library.updated_at, library.created_at, NOW())
        FROM ads.influencer_library AS library
        WHERE library.is_deleted = FALSE
          AND (
            library.last_followed_at IS NOT NULL
            OR NULLIF(BTRIM(COALESCE(library.follow_note, '')), '') IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ads.influencer_library_follow_log AS existing
            WHERE existing.influencer_library_id = library.id
              AND existing.is_deleted = FALSE
          )
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub(super) async fn sync_legacy_follow_columns_from_latest_log(
    pool: &PgPool,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        WITH latest_follow AS (
          SELECT DISTINCT ON (follow_log.influencer_library_id)
            follow_log.influencer_library_id,
            follow_log.followed_at::DATE AS last_followed_at,
            follow_log.follow_note
          FROM ads.influencer_library_follow_log AS follow_log
          WHERE follow_log.is_deleted = FALSE
          ORDER BY
            follow_log.influencer_library_id,
            follow_log.followed_at DESC,
            follow_log.created_at DESC,
            follow_log.id DESC
        )
        UPDATE ads.influencer_library AS library
        SET
          last_followed_at = latest_follow.last_followed_at,
          follow_note = latest_follow.follow_note,
          updated_by = COALESCE(library.updated_by, 'migration'),
          updated_by_user_id = library.updated_by_user_id
        FROM latest_follow
        WHERE library.id = latest_follow.influencer_library_id
          AND library.is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
