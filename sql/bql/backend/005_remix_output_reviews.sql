-- 成片人工审核：AI 合成完的成片由人确认后才算可用。
-- 一行 = 一条成片（一个 Run）的当前结论；改判覆盖，撤销删除，历史只在 studio_audit 日志。
-- 结论只对记下的成片资产生效：Run 换了成片资产或资产被删，读侧视为没有结论。
-- 见 .trellis/tasks/10-26-output-review/design.md（D1）。sql/migrations/046 是同一张表。

CREATE TABLE ads.content_remix_output_reviews (
    run_id UUID PRIMARY KEY REFERENCES ads.content_remix_batch_runs(run_id),
    output_asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    decision TEXT NOT NULL,
    reasons TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    reviewer_user_id TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT content_remix_output_reviews_decision_check CHECK (decision IN ('approved', 'rejected')),
    -- 驳回至少一个原因，通过不带原因。
    CONSTRAINT content_remix_output_reviews_reasons_check CHECK ((decision = 'rejected') = (CARDINALITY(reasons) > 0)),
    CONSTRAINT content_remix_output_reviews_reason_keys_check CHECK (
        reasons <@ ARRAY['duplicate_picture', 'voice_break', 'wrong_product', 'pacing', 'other']::TEXT[]
    ),
    CONSTRAINT content_remix_output_reviews_note_check CHECK (note IS NULL OR CHAR_LENGTH(note) BETWEEN 1 AND 500)
);
