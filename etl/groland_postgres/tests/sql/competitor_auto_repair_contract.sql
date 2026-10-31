BEGIN;
INSERT INTO competitor.videos (aweme_id, share_url)
VALUES ('7999999999999999991', 'https://www.douyin.com/video/7999999999999999991');
INSERT INTO competitor.analyses (aweme_id, status, error_code, requested_by)
VALUES ('7999999999999999991', 'failed', 'fixture', 'compass-auto-repair');
DO $$
BEGIN
    BEGIN
        INSERT INTO competitor.analyses (aweme_id, status, error_code, requested_by)
        VALUES ('7999999999999999991', 'failed', 'fixture', 'compass-auto-repair');
        RAISE EXCEPTION 'terminal automatic repair must still consume the budget';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;
INSERT INTO competitor.analyses (aweme_id, status, error_code, requested_by)
VALUES ('7999999999999999991', 'failed', 'fixture', 'manual-user');
ROLLBACK;
