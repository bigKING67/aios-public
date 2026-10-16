-- Isolated fixture only. Roll back all synthetic candidates.
BEGIN;
DO $$
DECLARE v UUID := '00000000-0000-4000-8000-000000000037';
BEGIN
    INSERT INTO ads.recruiting_test_submissions
        (submission_id, test_key, question_set_version, candidate_name, contact,
         school_and_grade, weekly_availability, earliest_start, answers, client_ip_hash,
         score_project, score_async, score_robustness, score_design, reviewed_at)
    VALUES (v, 'ai-intern', 2, 'fixture', 'fixture', 'fixture', '4', 'now', '{}', 'fixture', 25, 25, 25, 25, NOW());
    BEGIN
        UPDATE ads.recruiting_test_submissions SET score_async = 26 WHERE submission_id = v;
        RAISE EXCEPTION 'V2 accepted out-of-range score';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE ads.recruiting_test_submissions SET question_set_version = 1 WHERE submission_id = v;
        RAISE EXCEPTION 'V1 accepted V2 score limits';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE ads.recruiting_test_submissions SET question_set_version = 1, score_project = 20,
        score_async = 30, score_robustness = 30, score_design = 20 WHERE submission_id = v;
END $$;
ROLLBACK;
