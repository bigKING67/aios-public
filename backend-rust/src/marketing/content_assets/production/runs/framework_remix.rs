//! Framework remix Runs (AI 创作中心 batches). The studio batch service builds
//! one deterministic plan per segment combination and calls this facade inside
//! its own transaction: Run insert → host plan (origin=user) → frozen project
//! → render job, the same order and services as `create` + `revise` +
//! `produce`. No model planning, captions or plan confirmation are involved;
//! each clip keeps its own source audio (legacy clip snapshot, volume 1.0).
use super::{
    domain::{self, FRAMEWORK_REMIX},
    execution, repository as repo,
    transitions::{self, Control},
    types::{CreateRunRequest, PlanDocument},
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    marketing::content_assets::production::{
        assets,
        types::{BoundAsset, Clip},
    },
};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

/// Framework remix Runs are only created (and frozen) by studio batches; the
/// public create and plan-revision APIs reject them so a Run's lineage always
/// matches its batch combination.
pub(super) fn reject_public(task_type: &str) -> AppResult<()> {
    if task_type == FRAMEWORK_REMIX {
        return Err(AppError::bad_request(
            "框架混剪任务只能由 AI 创作中心批次创建，组合冻结后不可改方案",
        ));
    }
    Ok(())
}

/// A source asset that passed the production binding contract (edit
/// permission unless skipped, rights window, readiness, bucket, raw key/hash,
/// duration).
pub(in crate::marketing::content_assets) struct RemixSource {
    bound: BoundAsset,
}

impl RemixSource {
    pub(in crate::marketing::content_assets) fn asset_id(&self) -> Uuid {
        self.bound.asset_id
    }

    pub(in crate::marketing::content_assets) fn sha256(&self) -> &str {
        &self.bound.sha256
    }

    pub(in crate::marketing::content_assets) fn duration_ms(&self) -> u32 {
        self.bound.duration_ms
    }
}

pub(in crate::marketing::content_assets) use crate::marketing::content_assets::production::assets::SourcePermission;

/// Binds one remix source. `permission` decides only whether the caller's
/// edit permission is required (AI 创作中心 open access skips it); every other
/// source check always applies.
pub(in crate::marketing::content_assets) async fn bind_source(
    pool: &PgPool,
    bucket: &str,
    user: &CurrentUser,
    asset_id: Uuid,
    permission: SourcePermission,
) -> AppResult<RemixSource> {
    Ok(RemixSource {
        bound: assets::bind_source(pool, bucket, user, asset_id, permission).await?,
    })
}

pub(in crate::marketing::content_assets) struct RemixClip {
    pub(in crate::marketing::content_assets) asset_id: Uuid,
    pub(in crate::marketing::content_assets) start_ms: u32,
    pub(in crate::marketing::content_assets) end_ms: u32,
    pub(in crate::marketing::content_assets) reason: String,
}

pub(in crate::marketing::content_assets) struct RemixRun {
    pub(in crate::marketing::content_assets) idempotency_key: String,
    pub(in crate::marketing::content_assets) title: String,
    pub(in crate::marketing::content_assets) brief: String,
    pub(in crate::marketing::content_assets) summary: String,
    pub(in crate::marketing::content_assets) clips: Vec<RemixClip>,
}

fn build(
    input: RemixRun,
    sources: &[&RemixSource],
) -> AppResult<(
    CreateRunRequest,
    crate::marketing::content_assets::production::types::Snapshot,
    PlanDocument,
)> {
    let mut asset_ids: Vec<Uuid> = Vec::new();
    for clip in &input.clips {
        if !asset_ids.contains(&clip.asset_id) {
            asset_ids.push(clip.asset_id);
        }
    }
    let bound = asset_ids
        .iter()
        .map(|id| {
            sources
                .iter()
                .find(|source| source.asset_id() == *id)
                .map(|source| source.bound.clone())
                .ok_or(AppError::Internal)
        })
        .collect::<AppResult<Vec<_>>>()?;
    let total_ms: u64 = input
        .clips
        .iter()
        .map(|clip| u64::from(clip.end_ms.saturating_sub(clip.start_ms)))
        .sum();
    let request = CreateRunRequest {
        idempotency_key: input.idempotency_key,
        title: input.title.clone(),
        brief: input.brief,
        task_type: FRAMEWORK_REMIX.into(),
        asset_ids,
        narration_asset_id: None,
        aspect: "portrait".into(),
        target_seconds: u32::try_from(total_ms.div_ceil(1000)).unwrap_or(u32::MAX),
        review_before_production: false,
        model_call_confirmed: false,
        rights_confirmed: true,
        generate_captions: false,
        max_auto_repairs: 0,
    };
    let clips: Vec<Clip> = input
        .clips
        .iter()
        .enumerate()
        .map(|(index, clip)| Clip {
            id: format!("slot-{}", index + 1),
            asset_id: clip.asset_id,
            start_ms: clip.start_ms,
            end_ms: clip.end_ms,
            caption: String::new(),
            volume: 1.0,
        })
        .collect();
    let plan = PlanDocument {
        summary: input.summary,
        clips: clips.clone(),
        reasons: input.clips.into_iter().map(|clip| clip.reason).collect(),
        gaps: Vec::new(),
        locked_clip_ids: Vec::new(),
        narration_captions: None,
    };
    let snapshot = assets::snapshot(input.title, request.aspect.clone(), clips, bound);
    domain::validate_request(&request)?;
    domain::validate_plan(&plan, &request, &snapshot)?;
    Ok((request, snapshot, plan))
}

/// Creates one framework remix Run and dispatches its render job inside the
/// caller's transaction. Returns the Run id.
pub(in crate::marketing::content_assets) async fn create_and_produce(
    db: &mut PgConnection,
    owner: &str,
    input: RemixRun,
    sources: &[&RemixSource],
) -> AppResult<Uuid> {
    let (request, snapshot, plan) = build(input, sources)?;
    let id = repo::create_in(db, owner, &request, &snapshot).await?;
    let mut run = repo::lock(db, owner, id).await?;
    if run.plan_revision != 0 {
        return Err(domain::conflict());
    }
    repo::insert_plan(db, &mut run, &plan, "user", None).await?;
    execution::enqueue(db, owner, &mut run, None).await?;
    repo::save(db, &mut run).await?;
    Ok(id)
}

/// Run states a batch cancel leaves unchanged: terminal, or already stopping
/// (a cancelling render is finalized by the worker's Run reconciliation).
pub(in crate::marketing::content_assets) const CANCEL_SETTLED: [&str; 4] =
    ["succeeded", "failed", "cancelled", "cancelling"];

const CANCEL_ATTEMPTS: usize = 3;

/// Cancels one owned batch Run through the public Runs cancel transition
/// (queued render → cancelled; running render → cancelling until the worker
/// stops it). Settled Runs are a no-op, so repeating a batch cancel is
/// idempotent. A concurrent version change is re-read a bounded number of times.
pub(in crate::marketing::content_assets) async fn cancel(
    pool: &PgPool,
    owner: &str,
    id: Uuid,
) -> AppResult<()> {
    for _ in 0..CANCEL_ATTEMPTS {
        let run = repo::get(pool, owner, id).await?;
        if CANCEL_SETTLED.contains(&run.status.as_str()) {
            return Ok(());
        }
        match transitions::control(pool, owner, id, run.version, Control::Cancel).await {
            Ok(_) => return Ok(()),
            Err(AppError::Conflict(_)) => continue,
            Err(error) => return Err(error),
        }
    }
    Err(domain::conflict())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(duration_ms: u32) -> RemixSource {
        RemixSource {
            bound: BoundAsset {
                asset_id: Uuid::from_u128(7),
                object_key: "raw/a.mp4".into(),
                sha256: "a".repeat(64),
                duration_ms,
            },
        }
    }

    fn run(clips: Vec<(u32, u32)>) -> RemixRun {
        RemixRun {
            idempotency_key: "remix-test-1".into(),
            title: "框架混剪".into(),
            brief: "框架混剪：保留各片段原声".into(),
            summary: "框架混剪".into(),
            clips: clips
                .into_iter()
                .map(|(start_ms, end_ms)| RemixClip {
                    asset_id: Uuid::from_u128(7),
                    start_ms,
                    end_ms,
                    reason: "槽位".into(),
                })
                .collect(),
        }
    }

    #[test]
    fn builds_a_model_free_plan_longer_than_the_legacy_120_seconds() {
        let a = source(400_000);
        let (request, snapshot, plan) =
            build(run(vec![(0, 150_000), (200_000, 350_500)]), &[&a]).unwrap();
        assert_eq!(request.task_type, FRAMEWORK_REMIX);
        assert_eq!(request.target_seconds, 301);
        assert!(!request.model_call_confirmed && !request.review_before_production);
        assert_eq!(request.asset_ids, vec![Uuid::from_u128(7)]);
        assert_eq!(plan.clips[1].id, "slot-2");
        assert!(plan
            .clips
            .iter()
            .all(|c| c.volume == 1.0 && c.caption.is_empty()));
        assert_eq!(snapshot.assets.len(), 1);
        assert_eq!(
            snapshot.output_profile,
            crate::marketing::content_assets::production::types::OutputProfile::Hd1080V1
        );
    }

    #[test]
    fn rejects_clips_beyond_the_source_or_ceiling() {
        let a = source(10_000);
        assert!(build(run(vec![(0, 10_001)]), &[&a]).is_err());
        let long = source(1_800_000);
        assert!(build(run(vec![(0, 600_000), (600_000, 601_000)]), &[&long]).is_err());
        assert!(build(run(vec![(0, 2_000)]), &[&a]).is_err());
        assert!(build(run(vec![(0, 5_000)]), &[]).is_err());
    }

    #[test]
    fn legacy_task_limits_are_unchanged() {
        let ids = |n: u128| (1..=n).map(Uuid::from_u128).collect::<Vec<_>>();
        let mut r = super::super::tests::input();
        r.target_seconds = 120;
        r.asset_ids = ids(10);
        assert!(domain::validate_request(&r).is_ok());
        r.target_seconds = 121;
        assert!(domain::validate_request(&r).is_err());
        r.target_seconds = 120;
        r.asset_ids = ids(11);
        assert!(domain::validate_request(&r).is_err());
        let mut remix = super::super::tests::input();
        remix.task_type = FRAMEWORK_REMIX.into();
        remix.model_call_confirmed = false;
        remix.review_before_production = false;
        remix.target_seconds = 600;
        remix.asset_ids = ids(50);
        assert!(domain::validate_request(&remix).is_ok());
        remix.asset_ids = ids(51);
        assert!(domain::validate_request(&remix).is_err());
        remix.asset_ids = ids(2);
        remix.target_seconds = 601;
        assert!(domain::validate_request(&remix).is_err());
        remix.target_seconds = 60;
        remix.model_call_confirmed = true;
        assert!(domain::validate_request(&remix).is_err());
        remix.model_call_confirmed = false;
        remix.review_before_production = true;
        assert!(domain::validate_request(&remix).is_err());
    }

    #[test]
    fn public_entrypoints_reject_framework_remix() {
        assert!(reject_public(FRAMEWORK_REMIX).is_err());
        assert!(reject_public("talking_head").is_ok());
    }
}
