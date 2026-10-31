-- Candidate intake is independent of the enterprise business module profile.
-- Final table contract of legacy migrations 036–039; no historical data is copied.
-- Apply through migrations:bql after explicit production authorization.
CREATE TABLE ads.recruiting_test_submissions (
    submission_id UUID PRIMARY KEY,
    test_key TEXT NOT NULL,
    question_set_version INTEGER NOT NULL CHECK (question_set_version > 0),
    candidate_name TEXT NOT NULL,
    contact TEXT NOT NULL,
    school_and_grade TEXT NOT NULL,
    major TEXT NOT NULL DEFAULT '',
    weekly_availability TEXT NOT NULL,
    earliest_start TEXT NOT NULL,
    portfolio_url TEXT,
    answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ip_hash TEXT NOT NULL,
    score_project SMALLINT,
    score_async SMALLINT,
    score_robustness SMALLINT,
    score_design SMALLINT,
    review_note TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    CHECK (
        (score_project IS NULL AND score_async IS NULL AND score_robustness IS NULL
            AND score_design IS NULL AND reviewed_at IS NULL)
        OR (score_project IS NOT NULL AND score_async IS NOT NULL
            AND score_robustness IS NOT NULL AND score_design IS NOT NULL
            AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT recruiting_scores_by_question_version CHECK (
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
    )
);

CREATE INDEX recruiting_test_submissions_submitted_idx
    ON ads.recruiting_test_submissions (test_key, submitted_at DESC);
