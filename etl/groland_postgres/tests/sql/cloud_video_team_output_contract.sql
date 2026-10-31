-- Only run in a disposable fixture with sql/bql/backend/010 + 012 applied.
-- Checks the constraints the team-output sync relies on: a label mapping always names its source,
-- amounts are never negative, a day's rows need their video, and sync days only take known kinds
-- and statuses. No retained test data.
BEGIN;
DO $$
DECLARE
    rejected BOOLEAN;
BEGIN
    INSERT INTO cloud_video.finished_videos (video_id, name, uploaded_at)
    VALUES (900000001, 'contract fixture', '2026-10-27 18:00:00+08');
    INSERT INTO cloud_video.finished_spend_daily (video_id, stat_date, spend, list_spend, relation_count)
    VALUES (900000001, '2026-10-27', 10.5, 10.5, 0);

    rejected := FALSE;
    BEGIN
        INSERT INTO cloud_video.director_labels (label_id, name, account_key) VALUES (900000002, '编导', 'acc');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'label mapping without a source accepted'; END IF;
    INSERT INTO cloud_video.director_labels (label_id, name, account_key, mapping_source)
    VALUES (900000002, '编导', 'acc', 'manual');

    rejected := FALSE;
    BEGIN
        UPDATE cloud_video.finished_spend_daily SET pay_order_amount = -1 WHERE video_id = 900000001;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'negative pay order amount accepted'; END IF;

    rejected := FALSE;
    BEGIN
        UPDATE cloud_video.finished_spend_daily SET other_platform_spend = -1 WHERE video_id = 900000001;
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'negative other-platform spend accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO cloud_video.finished_spend_daily (video_id, stat_date, spend, list_spend, relation_count)
        VALUES (900000099, '2026-10-27', 1, 1, 0);
    EXCEPTION WHEN foreign_key_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'spend row without its video accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO cloud_video.team_sync_days (kind, stat_date, status) VALUES ('gmv', '2026-10-27', 'complete');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown sync kind accepted'; END IF;

    rejected := FALSE;
    BEGIN
        INSERT INTO cloud_video.team_sync_days (kind, stat_date, status) VALUES ('spend', '2026-10-27', 'done');
    EXCEPTION WHEN check_violation THEN rejected := TRUE;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'unknown sync status accepted'; END IF;
END $$;
ROLLBACK;
