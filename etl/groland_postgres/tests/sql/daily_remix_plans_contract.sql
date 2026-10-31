BEGIN;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.auth_users
        WHERE id='6ccf6f96-07f3-4bec-91a4-79ec7cc58bad'::UUID
          AND username='daily-remix-system' AND NOT is_active AND password_hash IS NULL)
    THEN RAISE EXCEPTION 'daily service identity must be inactive and passwordless'; END IF;
    IF EXISTS (SELECT 1 FROM public.auth_user_roles WHERE user_id='6ccf6f96-07f3-4bec-91a4-79ec7cc58bad'::UUID)
    THEN RAISE EXCEPTION 'daily service identity must not receive human account roles'; END IF;
    INSERT INTO ads.content_daily_remix_plans(plan_date) VALUES ('2020-01-01');
    BEGIN
        INSERT INTO ads.content_daily_remix_plans(plan_date) VALUES ('2020-01-01');
        RAISE EXCEPTION 'duplicate day unexpectedly accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        UPDATE ads.content_daily_remix_plans SET estimated_cost_micros=-1 WHERE plan_date='2020-01-01';
        RAISE EXCEPTION 'negative cost unexpectedly accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
