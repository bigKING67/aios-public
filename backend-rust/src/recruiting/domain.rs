//! Validation, verdict and rubric for the online intern test. The rubric is
//! served only to admins so it never ships in the public frontend bundle.
use chrono::{DateTime, Duration, Utc};

use crate::error::{AppError, AppResult};

use super::types::{
    CandidateInput, PublicSubmissionRequest, ReviewScores, ReviewVerdict, SubmissionAnswers,
};

pub(super) const AI_INTERN_TEST_KEY: &str = "ai-intern";
pub(super) const AI_INTERN_QUESTION_SET_VERSION: i32 = 3;

const MAX_REVIEW_NOTE_CHARS: usize = 4000;
/// A started_at older than this is a stale draft clock, not a real duration.
const MAX_PLAUSIBLE_DURATION_DAYS: i64 = 7;

/// A validated submission ready to store.
#[derive(Debug)]
pub(super) struct ValidSubmission {
    pub(super) candidate: CandidateInput,
    pub(super) answers: SubmissionAnswers,
    pub(super) started_at: Option<DateTime<Utc>>,
}

pub(super) fn validate_submission(
    request: PublicSubmissionRequest,
    now: DateTime<Utc>,
) -> AppResult<ValidSubmission> {
    if request.test_key != AI_INTERN_TEST_KEY {
        return Err(AppError::bad_request("测试不存在"));
    }
    if request.question_set_version != AI_INTERN_QUESTION_SET_VERSION {
        return Err(AppError::bad_request("题目已更新，请刷新页面后重新提交"));
    }

    let candidate = request.candidate;
    let candidate = CandidateInput {
        name: required_text(candidate.name, "姓名", 40)?,
        contact: required_text(candidate.contact, "联系方式", 100)?,
        school_and_grade: required_text(candidate.school_and_grade, "学校", 100)?,
        major: required_text(candidate.major, "专业", 100)?,
        weekly_availability: String::new(),
        earliest_start: String::new(),
        portfolio_url: optional_url(candidate.portfolio_url)?,
    };

    let answers = request.answers;
    let workflow_rules = answers.workflow_rules.trim().to_string();
    if workflow_rules.chars().count() > 10000 {
        return Err(AppError::bad_request("开发规则不能超过 10000 字"));
    }
    let answers = SubmissionAnswers {
        workflow: required_text(answers.workflow, "AI 开发方式与规则说明", 6000)?,
        workflow_rules,
        project: String::new(),
        agent_plan: String::new(),
        video_practice: required_text(answers.video_practice, "视频镜头切分：交付与验证", 8000)?,
        ai_usage: required_text(answers.ai_usage, "AI 使用说明", 1500)?,
        video_task_code: String::new(),
        video_task_notes: String::new(),
        remix_plan: String::new(),
    };

    Ok(ValidSubmission {
        candidate,
        answers,
        started_at: plausible_started_at(request.started_at.as_deref(), now),
    })
}

pub(super) fn is_honeypot_filled(request: &PublicSubmissionRequest) -> bool {
    request
        .website
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

fn required_text(value: String, label: &str, max_chars: usize) -> AppResult<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(AppError::bad_request(format!("请填写{label}")));
    }
    if value.chars().count() > max_chars {
        return Err(AppError::bad_request(format!(
            "{label}不能超过 {max_chars} 字"
        )));
    }
    Ok(value)
}

fn optional_url(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = value.map(|value| value.trim().to_string()) else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 300 {
        return Err(AppError::bad_request("链接不能超过 300 字"));
    }
    let scheme = value
        .split_once("://")
        .map(|(scheme, _)| scheme.to_ascii_lowercase());
    if !matches!(scheme.as_deref(), Some("http" | "https")) {
        return Err(AppError::bad_request("链接需要以 http:// 或 https:// 开头"));
    }
    Ok(Some(value))
}

fn plausible_started_at(raw: Option<&str>, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let started_at = DateTime::parse_from_rfc3339(raw?.trim())
        .ok()?
        .with_timezone(&Utc);
    let elapsed = now - started_at;
    (elapsed >= Duration::zero() && elapsed <= Duration::days(MAX_PLAUSIBLE_DURATION_DAYS))
        .then_some(started_at)
}

pub(super) fn validate_scores(scores: ReviewScores, version: i32) -> AppResult<ReviewScores> {
    let rubric = super::rubric::rubric(version)?;
    let values = [
        scores.project,
        scores.async_logic,
        scores.robustness,
        scores.design,
    ];
    for (value, dimension) in values.into_iter().zip(rubric.dimensions) {
        if !(0..=dimension.max).contains(&value) {
            return Err(AppError::bad_request(format!(
                "{}需在 0–{} 之间",
                dimension.label, dimension.max
            )));
        }
    }
    Ok(scores)
}

pub(super) fn normalize_review_note(note: Option<String>) -> AppResult<Option<String>> {
    let note = note
        .map(|note| note.trim().to_string())
        .filter(|note| !note.is_empty());
    if note
        .as_deref()
        .is_some_and(|note| note.chars().count() > MAX_REVIEW_NOTE_CHARS)
    {
        return Err(AppError::bad_request(format!(
            "备注不能超过 {MAX_REVIEW_NOTE_CHARS} 字"
        )));
    }
    Ok(note)
}

pub(super) fn total_score(scores: ReviewScores) -> i16 {
    scores.project + scores.async_logic + scores.robustness + scores.design
}

pub(super) fn verdict(scores: ReviewScores, version: i32) -> ReviewVerdict {
    if version == 1 && scores.async_logic + scores.robustness < 30 {
        return ReviewVerdict::Reject;
    }
    match total_score(scores) {
        total if total >= 80 => ReviewVerdict::Advance,
        total if total >= 65 => ReviewVerdict::Hold,
        _ => ReviewVerdict::Reject,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recruiting::types::PublicSubmissionRequest;

    fn scores(project: i16, async_logic: i16, robustness: i16, design: i16) -> ReviewScores {
        ReviewScores {
            project,
            async_logic,
            robustness,
            design,
        }
    }

    fn request() -> PublicSubmissionRequest {
        PublicSubmissionRequest {
            test_key: AI_INTERN_TEST_KEY.into(),
            submission_id: uuid::Uuid::nil(),
            question_set_version: AI_INTERN_QUESTION_SET_VERSION,
            candidate: CandidateInput {
                name: " 张三 ".into(),
                contact: "wechat: zs".into(),
                school_and_grade: "某大学".into(),
                major: "计算机科学".into(),
                weekly_availability: "4 天".into(),
                earliest_start: "11 月初".into(),
                portfolio_url: Some(" ".into()),
            },
            answers: SubmissionAnswers {
                project: "项目".into(),
                video_task_code: "async function generateVideo() {}".into(),
                video_task_notes: "思路".into(),
                ai_usage: "Claude Code 写初稿".into(),
                remix_plan: "方案".into(),
                workflow: "实际开发流程".into(),
                workflow_rules: String::new(),
                agent_plan: "自己的 Agent".into(),
                video_practice: "视频改进与验证".into(),
            },
            started_at: None,
            website: None,
        }
    }

    #[test]
    fn verdict_follows_total_thresholds() {
        assert_eq!(verdict(scores(16, 24, 24, 16), 1), ReviewVerdict::Advance);
        assert_eq!(verdict(scores(15, 24, 22, 16), 1), ReviewVerdict::Hold);
        assert_eq!(verdict(scores(10, 20, 20, 15), 1), ReviewVerdict::Hold);
        assert_eq!(verdict(scores(10, 20, 19, 15), 1), ReviewVerdict::Reject);
    }

    #[test]
    fn weak_video_task_rejects_regardless_of_total() {
        let high_elsewhere = scores(20, 15, 14, 20);
        assert_eq!(total_score(high_elsewhere), 69);
        assert_eq!(verdict(high_elsewhere, 1), ReviewVerdict::Reject);
        assert_eq!(verdict(scores(20, 15, 15, 20), 1), ReviewVerdict::Hold);
    }

    #[test]
    fn scores_must_stay_within_dimension_max() {
        assert!(validate_scores(scores(20, 30, 30, 20), 1).is_ok());
        assert!(validate_scores(scores(21, 0, 0, 0), 1).is_err());
        assert!(validate_scores(scores(0, 31, 0, 0), 1).is_err());
        assert!(validate_scores(scores(0, 0, -1, 0), 1).is_err());
    }

    #[test]
    fn rubric_max_matches_score_ranges() {
        let total: i16 = super::super::rubric::rubric(2)
            .unwrap()
            .dimensions
            .iter()
            .map(|dimension| dimension.max)
            .sum();
        assert_eq!(total, 100);
    }

    #[test]
    fn submission_is_trimmed_and_blank_url_dropped() {
        let valid = validate_submission(request(), Utc::now()).unwrap();
        assert_eq!(valid.candidate.name, "张三");
        assert_eq!(valid.candidate.portfolio_url, None);
    }

    #[test]
    fn submission_rejects_missing_or_oversized_fields() {
        let mut missing = request();
        missing.answers.ai_usage = "  ".into();
        assert!(validate_submission(missing, Utc::now()).is_err());

        let mut oversized = request();
        oversized.candidate.name = "名".repeat(41);
        assert!(validate_submission(oversized, Utc::now()).is_err());

        let mut upper_scheme = request();
        upper_scheme.candidate.portfolio_url = Some("HTTPS://github.com/a".into());
        assert!(validate_submission(upper_scheme, Utc::now()).is_ok());

        let mut bad_url = request();
        bad_url.candidate.portfolio_url = Some("javascript:alert(1)".into());
        assert!(validate_submission(bad_url, Utc::now()).is_err());
    }

    #[test]
    fn candidate_requires_major_but_accepts_any_contact_channel() {
        for contact in ["my_wechat", "13800138000", "candidate@example.com"] {
            let mut input = request();
            input.candidate.contact = contact.into();
            input.candidate.weekly_availability.clear();
            input.candidate.earliest_start.clear();
            assert!(validate_submission(input, Utc::now()).is_ok());
        }
        let mut missing = request();
        missing.candidate.major.clear();
        assert!(validate_submission(missing, Utc::now()).is_err());
        let mut oversized = request();
        oversized.candidate.major = "字".repeat(101);
        assert!(validate_submission(oversized, Utc::now()).is_err());
    }

    #[test]
    fn submission_rejects_unknown_test_or_stale_version() {
        let mut unknown = request();
        unknown.test_key = "other".into();
        assert!(validate_submission(unknown, Utc::now()).is_err());

        let mut stale = request();
        stale.question_set_version = 0;
        assert!(validate_submission(stale, Utc::now()).is_err());
    }

    #[test]
    fn started_at_is_kept_only_when_plausible() {
        let now = Utc::now();
        let recent = (now - Duration::minutes(50)).to_rfc3339();
        assert!(plausible_started_at(Some(&recent), now).is_some());
        let future = (now + Duration::minutes(5)).to_rfc3339();
        assert!(plausible_started_at(Some(&future), now).is_none());
        let stale = (now - Duration::days(8)).to_rfc3339();
        assert!(plausible_started_at(Some(&stale), now).is_none());
        assert!(plausible_started_at(Some("not-a-date"), now).is_none());
    }

    #[test]
    fn honeypot_detects_filled_field() {
        let mut bot = request();
        bot.website = Some("http://spam".into());
        assert!(is_honeypot_filled(&bot));
        assert!(!is_honeypot_filled(&request()));
    }
    #[test]
    fn v2_scores_are_versioned_and_no_longer_use_video_veto() {
        assert!(validate_scores(scores(25, 25, 25, 25), 2).is_ok());
        assert!(validate_scores(scores(25, 25, 25, 25), 1).is_err());
        assert!(validate_scores(scores(20, 30, 30, 20), 1).is_ok());
        assert!(validate_scores(scores(20, 30, 30, 20), 2).is_err());
        assert!(validate_scores(scores(0, 0, 0, 0), 4).is_err());
        assert_eq!(verdict(scores(25, 10, 10, 25), 2), ReviewVerdict::Hold);
        assert_eq!(verdict(scores(20, 10, 10, 25), 1), ReviewVerdict::Reject);
    }

    #[test]
    fn current_requires_real_new_answers_and_discards_legacy_fields() {
        let mut missing = request();
        missing.answers.workflow.clear();
        assert!(validate_submission(missing, Utc::now()).is_err());
        let mut missing = request();
        missing.answers.agent_plan.clear();
        missing.answers.project.clear();
        assert!(validate_submission(missing, Utc::now()).is_ok());
        let mut stale = request();
        stale.question_set_version = 1;
        assert!(validate_submission(stale, Utc::now()).is_err());
        let valid = validate_submission(request(), Utc::now()).unwrap();
        assert!(valid.answers.video_task_code.is_empty());
        assert!(valid.answers.workflow_rules.is_empty());
        assert!(valid.answers.project.is_empty());
        assert!(valid.answers.agent_plan.is_empty());
        let mut oversized = request();
        oversized.answers.workflow_rules = "规".repeat(10001);
        assert!(validate_submission(oversized, Utc::now()).is_err());
    }

    #[test]
    fn v3_requires_video_practice_and_preserves_versioned_bounds() {
        assert!(validate_scores(scores(20, 30, 35, 15), 3).is_ok());
        assert!(validate_scores(scores(25, 25, 25, 25), 3).is_err());
        assert!(validate_scores(scores(20, 30, 36, 15), 3).is_err());
        let mut missing = request();
        missing.answers.video_practice.clear();
        assert!(validate_submission(missing, Utc::now()).is_err());
        let mut oversized = request();
        oversized.answers.video_practice = "字".repeat(8001);
        assert!(validate_submission(oversized, Utc::now()).is_err());
        let mut stale = request();
        stale.question_set_version = 2;
        assert!(validate_submission(stale, Utc::now()).is_err());
    }

    #[test]
    fn legacy_answers_remain_readable() {
        let old = serde_json::json!({"project":"项目", "videoTaskCode":"code", "videoTaskNotes":"notes", "remixPlan":"video", "aiUsage":"AI"});
        let answers: SubmissionAnswers = serde_json::from_value(old).unwrap();
        assert_eq!(answers.video_task_code, "code");
        assert!(answers.workflow.is_empty());
        assert!(
            super::super::rubric::rubric(1)
                .unwrap()
                .thresholds
                .video_task_min
                > 0
        );
        assert_eq!(
            super::super::rubric::rubric(2)
                .unwrap()
                .thresholds
                .video_task_min,
            0
        );
    }
}
