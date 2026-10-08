use super::{domain, repository as repo, types::*};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::{repository as projects, types::Snapshot},
};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

pub(super) async fn adopt(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
    request: AdoptPlanRequest,
) -> AppResult<RunDetail> {
    let mut tx = pool.begin().await.map_err(projects::db_error)?;
    let mut run = repo::lock(&mut tx, owner, id).await?;
    repo::check_version(&run, request.expected_version)?;
    if !["waiting", "paused"].contains(&run.status.as_str())
        || run.active_attempt.is_some()
        || request.expected_plan_revision != run.plan_revision
    {
        return Err(domain::conflict());
    }
    apply(&mut tx, owner, &mut run, request.expected_project_revision).await?;
    if run.render_job_id.take().is_some() {
        run.execution_version = repo::next(run.execution_version)?;
    }
    run.stage = "production".into();
    run.waiting_reason = Some("awaiting_execution_adapter".into());
    repo::save(&mut tx, &mut run).await?;
    tx.commit().await.map_err(projects::db_error)?;
    repo::detail(pool, owner, id).await
}

pub(super) async fn apply(
    db: &mut PgConnection,
    owner: &str,
    run: &mut Run,
    expected_project_revision: Option<i32>,
) -> AppResult<()> {
    let plan = repo::plan(db, run.run_id, run.plan_revision)
        .await?
        .ok_or_else(domain::conflict)?;
    domain::validate_plan(&plan.document, &run.request, &run.sources)?;
    if plan.document.clips.is_empty() {
        return Err(AppError::bad_request("方案尚无可制作片段"));
    }
    let snapshot = if let Some(snapshot) =
        super::treated_captions::preserve(db, owner, run, &plan.document).await?
    {
        snapshot
    } else {
        let assets = run
            .sources
            .assets
            .iter()
            .filter(|a| {
                plan.document.clips.iter().any(|c| c.asset_id == a.asset_id)
                    || run.request.narration_asset_id == Some(a.asset_id)
            })
            .cloned()
            .collect();
        let mut edit_document = super::picture_remix::edit_document(run, &plan.document)?;
        if let Some(document) = edit_document.as_mut() {
            super::caption_freeze::attach(db, run, document).await?;
        }
        Snapshot {
            derived_assets: Vec::new(),
            render_binding: run.sources.render_binding.clone(),
            edit_document,
            title: run.request.title.clone(),
            aspect: run.request.aspect.clone(),
            output_profile: run.sources.output_profile,
            clips: plan.document.clips,
            assets,
            rights_confirmed: true,
        }
    };
    let project = projects::save_in_transaction(
        db,
        owner,
        run.project_id,
        expected_project_revision,
        snapshot,
    )
    .await?;
    let row=sqlx::query("SELECT revision FROM ads.content_production_projects WHERE project_id=$1 AND owner_user_id=$2")
        .bind(project).bind(owner).fetch_one(&mut *db).await.map_err(projects::db_error)?;
    run.project_id = Some(project);
    run.project_revision = Some(row.get("revision"));
    Ok(())
}
