-- Contract for sql/migrations/036_recruiting_test_submissions.sql: scores are
-- all-or-nothing, bounded per dimension, and answers must be a JSON object.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN;
BEGIN
    INSERT INTO ads.recruiting_test_submissions (
        submission_id, test_key, question_set_version, candidate_name, contact,
        school_and_grade, weekly_availability, earliest_start, answers, client_ip_hash
    ) VALUES (
        '00000000-0000-0000-0000-0000000000a1', 'ai-intern', 1, '契约', 'c',
        's', 'w', 'e', '{}'::JSONB, 'h'
    );

    rejected := FALSE;
    BEGIN
        UPDATE ads.recruiting_test_submissions
        SET score_project = 10
        WHERE submission_id = '00000000-0000-0000-0000-0000000000a1';
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'partial scores must be rejected'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE ads.recruiting_test_submissions
        SET score_project = 21, score_async = 0, score_robustness = 0,
            score_design = 0, reviewed_at = NOW()
        WHERE submission_id = '00000000-0000-0000-0000-0000000000a1';
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'out-of-range score must be rejected'; END IF;

    UPDATE ads.recruiting_test_submissions
    SET score_project = 20, score_async = 30, score_robustness = 30,
        score_design = 20, reviewed_at = NOW()
    WHERE submission_id = '00000000-0000-0000-0000-0000000000a1';

    rejected := FALSE;
    BEGIN
        INSERT INTO ads.recruiting_test_submissions (
            submission_id, test_key, question_set_version, candidate_name, contact,
            school_and_grade, weekly_availability, earliest_start, answers, client_ip_hash
        ) VALUES (
            '00000000-0000-0000-0000-0000000000a2', 'ai-intern', 1, '契约', 'c',
            's', 'w', 'e', '[]'::JSONB, 'h'
        );
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'non-object answers must be rejected'; END IF;
END $$;
ROLLBACK;
