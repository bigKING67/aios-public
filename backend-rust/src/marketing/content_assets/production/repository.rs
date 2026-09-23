use super::types::{Project, Snapshot};
use crate::error::{AppError, AppResult};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub(super) fn db_error(error: sqlx::Error) -> AppError {
    tracing::error!(?error, "content production database operation failed");
    AppError::Internal
}

pub(super) async fn get_project(pool: &PgPool, owner: &str, id: Uuid) -> AppResult<Project> {
    let row = sqlx::query("SELECT p.project_id, p.title, p.revision, p.updated_at::TEXT AS updated_at, r.snapshot FROM ads.content_production_projects p JOIN ads.content_production_revisions r USING (project_id, revision) WHERE p.project_id=$1 AND p.owner_user_id=$2")
        .bind(id).bind(owner).fetch_optional(pool).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    Ok(Project {
        project_id: row.get("project_id"),
        title: row.get("title"),
        revision: row.get("revision"),
        updated_at: row.get("updated_at"),
        snapshot: row.get("snapshot"),
    })
}

pub(super) async fn list_projects(pool: &PgPool, owner: &str) -> AppResult<Vec<Project>> {
    let rows = sqlx::query("SELECT project_id, title, revision, updated_at::TEXT AS updated_at FROM ads.content_production_projects WHERE owner_user_id=$1 ORDER BY updated_at DESC LIMIT 50")
        .bind(owner).fetch_all(pool).await.map_err(db_error)?;
    Ok(rows
        .into_iter()
        .map(|r| Project {
            project_id: r.get("project_id"),
            title: r.get("title"),
            revision: r.get("revision"),
            updated_at: r.get("updated_at"),
            snapshot: serde_json::Value::Null,
        })
        .collect())
}

pub(super) async fn save(
    pool: &PgPool,
    owner: &str,
    id: Option<Uuid>,
    expected: Option<i32>,
    snapshot: Snapshot,
) -> AppResult<Project> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let project_id = id.unwrap_or_else(Uuid::new_v4);
    let revision = if id.is_some() {
        let row = sqlx::query("SELECT revision FROM ads.content_production_projects WHERE project_id=$1 AND owner_user_id=$2 FOR UPDATE")
            .bind(project_id).bind(owner).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
        let current: i32 = row.get("revision");
        if expected != Some(current) {
            return Err(AppError::Conflict("工程已更新，请重新打开后修改".into()));
        }
        let revision = current.checked_add(1).ok_or(AppError::Internal)?;
        sqlx::query("UPDATE ads.content_production_projects SET revision=$2,title=$3,updated_at=NOW() WHERE project_id=$1")
            .bind(project_id).bind(revision).bind(&snapshot.title).execute(&mut *tx).await.map_err(db_error)?;
        revision
    } else {
        if expected.is_some() {
            return Err(AppError::bad_request("新工程不接受旧版本号"));
        }
        sqlx::query("INSERT INTO ads.content_production_projects (project_id,owner_user_id,title,revision) VALUES ($1,$2,$3,1)")
            .bind(project_id).bind(owner).bind(&snapshot.title).execute(&mut *tx).await.map_err(db_error)?;
        1
    };
    sqlx::query("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES ($1,$2,$3)")
        .bind(project_id).bind(revision).bind(serde_json::to_value(snapshot).map_err(|_| AppError::Internal)?)
        .execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    get_project(pool, owner, project_id).await
}

pub(super) async fn snapshot(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    revision: i32,
) -> AppResult<Snapshot> {
    let row = sqlx::query("SELECT r.snapshot FROM ads.content_production_revisions r JOIN ads.content_production_projects p USING (project_id) WHERE r.project_id=$1 AND r.revision=$2 AND p.owner_user_id=$3")
        .bind(id).bind(revision).bind(owner).fetch_optional(pool).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    serde_json::from_value(row.get("snapshot")).map_err(|_| AppError::Internal)
}
