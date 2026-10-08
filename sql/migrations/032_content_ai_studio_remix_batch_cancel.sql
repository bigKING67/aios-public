-- AI 创作中心：框架混剪批次可由发起人取消。Forward-only; apply through the
-- ledger, never on API startup. Only widens the stored batch summary status:
-- a batch whose Runs are all terminal and include a cancelled Run is
-- 'cancelled' (succeeded outputs stay registered and counted). Runs, jobs,
-- outputs and lineage keep their existing semantics.
ALTER TABLE ads.content_remix_batches
    DROP CONSTRAINT content_remix_batches_status_check,
    ADD CONSTRAINT content_remix_batches_status_check
        CHECK (status IN ('running', 'succeeded', 'partially_failed', 'failed', 'cancelled'));
