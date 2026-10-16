-- 招聘在线测试提交（AI 应用开发实习生）。Additive only; apply through the
-- ledger, never on API startup.
--
-- Candidates submit anonymously from /join/ai-intern; only admins read and
-- review. The client IP is stored as a salted hash, never in clear text.
-- Scores are either all NULL (not reviewed) or all present.
CREATE TABLE ads.recruiting_test_submissions (
    submission_id UUID PRIMARY KEY,
    test_key TEXT NOT NULL,
    question_set_version INTEGER NOT NULL CHECK (question_set_version > 0),
    candidate_name TEXT NOT NULL,
    contact TEXT NOT NULL,
    school_and_grade TEXT NOT NULL,
    weekly_availability TEXT NOT NULL,
    earliest_start TEXT NOT NULL,
    portfolio_url TEXT,
    answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ip_hash TEXT NOT NULL,
    score_project SMALLINT CHECK (score_project BETWEEN 0 AND 20),
    score_async SMALLINT CHECK (score_async BETWEEN 0 AND 30),
    score_robustness SMALLINT CHECK (score_robustness BETWEEN 0 AND 30),
    score_design SMALLINT CHECK (score_design BETWEEN 0 AND 20),
    review_note TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    CHECK (
        (score_project IS NULL AND score_async IS NULL AND score_robustness IS NULL
            AND score_design IS NULL AND reviewed_at IS NULL)
        OR (score_project IS NOT NULL AND score_async IS NOT NULL
            AND score_robustness IS NOT NULL AND score_design IS NOT NULL
            AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX recruiting_test_submissions_submitted_idx
    ON ads.recruiting_test_submissions (test_key, submitted_at DESC);
