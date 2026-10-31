-- Default-off daily dispatch; apply through migrations:bql, never at startup.
-- Inactive service identity has no password or human login/roles. The dedicated
-- service endpoint supplies its narrowly scoped content permission internally.
INSERT INTO public.auth_users (id, username, display_name, password_hash, is_active, auth_provider)
VALUES ('6ccf6f96-07f3-4bec-91a4-79ec7cc58bad', 'daily-remix-system', '每日自动混剪', NULL, FALSE, 'service');

CREATE TABLE ads.content_daily_remix_plans (
    plan_date DATE PRIMARY KEY,
    snapshot JSONB CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
    structure_results JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(structure_results) = 'array'),
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    dispatch_complete BOOLEAN NOT NULL DEFAULT FALSE,
    stop_reason TEXT,
    budget_micros BIGINT CHECK (budget_micros IS NULL OR budget_micros >= 0),
    estimated_cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ads.content_daily_remix_batches (
    plan_date DATE NOT NULL REFERENCES ads.content_daily_remix_plans(plan_date),
    batch_id UUID PRIMARY KEY REFERENCES ads.content_remix_batches(batch_id),
    structure_index INTEGER NOT NULL CHECK (structure_index BETWEEN 0 AND 9),
    estimated_cost_micros BIGINT NOT NULL CHECK (estimated_cost_micros > 0)
);
CREATE INDEX content_daily_remix_batches_date_idx ON ads.content_daily_remix_batches(plan_date);
