//! Rejection visibility and seven-day restoration share the delivery review lock.
use super::{
    error::StudioResult,
    remix_types::{RemixBatchItem, RemixRetention},
    repository::db_error,
};
use crate::error::AppError;
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

pub(super) async fn before_change(
    conn: &mut PgConnection,
    run: Uuid,
    asset: Option<Uuid>,
) -> StudioResult<()> {
    let blocked: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM ads.content_remix_output_reviews rv LEFT JOIN ads.content_remix_retention rt ON rt.output_asset_id=rv.output_asset_id WHERE rv.run_id=$1 AND rv.output_asset_id=$2 AND rv.decision='rejected' AND (rv.reviewed_at<=NOW()-INTERVAL '7 days' OR (rt.reason='rejected' AND rt.purge_started_at IS NOT NULL)))")
        .bind(run).bind(asset).fetch_one(conn).await.map_err(db_error)?;
    if blocked {
        return Err(
            AppError::Conflict("驳回已超过 7 天或文件已开始清理，不能撤回或改判".into()).into(),
        );
    }
    Ok(())
}

pub(super) async fn sync_rejection(conn: &mut PgConnection, asset: Uuid) -> StudioResult<()> {
    // Deduplication can link several runs to one asset. Hide/delete a library
    // asset only when every current use is rejected, never a manual/source asset.
    let due: Option<String> = sqlx::query_scalar("SELECT (MAX(rv.reviewed_at)+INTERVAL '7 days')::TEXT FROM ads.content_remix_batch_runs br JOIN ads.marketing_content_assets a ON a.asset_id=br.output_asset_id LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id=br.run_id AND rv.output_asset_id=br.output_asset_id WHERE br.output_asset_id=$1 AND a.source_type='ai_studio_output' HAVING BOOL_AND(COALESCE(rv.decision='rejected',FALSE))")
        .bind(asset).fetch_optional(&mut *conn).await.map_err(db_error)?.flatten();
    if let Some(due) = due {
        sqlx::query("INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at) VALUES ($1,'rejected',$2::TEXT::TIMESTAMPTZ) ON CONFLICT(output_asset_id) DO UPDATE SET reason='rejected',status='pending',cleanup_at=EXCLUDED.cleanup_at,purge_started_at=NULL,cleaned_at=NULL,objects='[]',error_code=NULL,updated_at=NOW()")
            .bind(asset).bind(due).execute(&mut *conn).await.map_err(db_error)?;
        sqlx::query("UPDATE ads.marketing_content_assets SET is_deleted=TRUE,updated_at=NOW() WHERE asset_id=$1").bind(asset).execute(conn).await.map_err(db_error)?;
    } else {
        sqlx::query("UPDATE ads.marketing_content_assets a SET is_deleted=FALSE,updated_at=NOW() FROM ads.content_remix_retention rt WHERE a.asset_id=$1 AND rt.output_asset_id=a.asset_id AND rt.reason='rejected' AND rt.purge_started_at IS NULL")
            .bind(asset).execute(&mut *conn).await.map_err(db_error)?;
        sqlx::query("UPDATE ads.content_remix_retention SET status='cancelled',updated_at=NOW() WHERE output_asset_id=$1 AND reason='rejected' AND purge_started_at IS NULL")
            .bind(asset).execute(conn).await.map_err(db_error)?;
    }
    Ok(())
}

pub(super) async fn attach(pool: &PgPool, items: &mut [RemixBatchItem]) -> StudioResult<()> {
    let ids: Vec<Uuid> = items.iter().map(|i| i.run_id).collect();
    let rows=sqlx::query("SELECT br.run_id,rt.reason,rt.status,rt.cleanup_at::TEXT AS cleanup_at,rt.cleaned_at::TEXT AS cleaned_at,rv.decision, (rv.reviewed_at+INTERVAL '7 days')::TEXT AS restore_until, (rv.decision='rejected' AND rv.reviewed_at>NOW()-INTERVAL '7 days' AND NOT COALESCE(rt.reason='rejected' AND rt.purge_started_at IS NOT NULL,FALSE)) AS can_restore FROM ads.content_remix_batch_runs br LEFT JOIN ads.content_remix_retention rt ON rt.output_asset_id=br.output_asset_id LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id=br.run_id AND rv.output_asset_id=br.output_asset_id WHERE br.run_id=ANY($1)")
        .bind(ids).fetch_all(pool).await.map_err(db_error)?;
    for item in items {
        let Some(row) = rows
            .iter()
            .find(|row| row.get::<Uuid, _>("run_id") == item.run_id)
        else {
            continue;
        };
        let rejected = row.get::<Option<String>, _>("decision").as_deref() == Some("rejected");
        let reason: Option<String> = row.get("reason");
        if !rejected && row.get::<Option<String>, _>("status").as_deref() == Some("cancelled") {
            continue;
        }
        if rejected || reason.is_some() {
            item.retention = Some(RemixRetention {
                reason: if rejected {
                    "rejected".into()
                } else {
                    reason.unwrap()
                },
                status: row
                    .get::<Option<String>, _>("status")
                    .unwrap_or_else(|| "pending".into()),
                cleanup_at: if rejected {
                    row.get("restore_until")
                } else {
                    row.get("cleanup_at")
                },
                cleaned_at: row.get("cleaned_at"),
                can_restore: row.get::<Option<bool>, _>("can_restore").unwrap_or(false),
            });
        }
    }
    Ok(())
}
