-- Keep V1 scoring intact; V2 uses four 25-point dimensions (25/50/25).
-- No existing answers or scores are rewritten.
ALTER TABLE ads.recruiting_test_submissions
    DROP CONSTRAINT recruiting_test_submissions_score_project_check,
    DROP CONSTRAINT recruiting_test_submissions_score_async_check,
    DROP CONSTRAINT recruiting_test_submissions_score_robustness_check,
    DROP CONSTRAINT recruiting_test_submissions_score_design_check,
    ADD CONSTRAINT recruiting_scores_by_question_version CHECK (
        (question_set_version = 1
            AND (score_project IS NULL OR score_project BETWEEN 0 AND 20)
            AND (score_async IS NULL OR score_async BETWEEN 0 AND 30)
            AND (score_robustness IS NULL OR score_robustness BETWEEN 0 AND 30)
            AND (score_design IS NULL OR score_design BETWEEN 0 AND 20))
        OR (question_set_version = 2
            AND (score_project IS NULL OR score_project BETWEEN 0 AND 25)
            AND (score_async IS NULL OR score_async BETWEEN 0 AND 25)
            AND (score_robustness IS NULL OR score_robustness BETWEEN 0 AND 25)
            AND (score_design IS NULL OR score_design BETWEEN 0 AND 25))
    );
