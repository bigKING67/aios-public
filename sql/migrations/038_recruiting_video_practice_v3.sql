-- Preserve V1/V2 scores; V3 allocates 20/30/35/15 to the four questions.
ALTER TABLE ads.recruiting_test_submissions
    DROP CONSTRAINT recruiting_scores_by_question_version,
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
        OR (question_set_version = 3
            AND (score_project IS NULL OR score_project BETWEEN 0 AND 20)
            AND (score_async IS NULL OR score_async BETWEEN 0 AND 30)
            AND (score_robustness IS NULL OR score_robustness BETWEEN 0 AND 35)
            AND (score_design IS NULL OR score_design BETWEEN 0 AND 15))
    );
