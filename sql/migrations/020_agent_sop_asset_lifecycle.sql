BEGIN;

ALTER TABLE agent_shared_assets
  DROP CONSTRAINT IF EXISTS agent_shared_assets_asset_type_check;

ALTER TABLE agent_shared_assets
  ADD CONSTRAINT agent_shared_assets_asset_type_check
    CHECK (asset_type IN ('project-memory', 'experience', 'case', 'sop-candidate', 'sop'))
    NOT VALID;

ALTER TABLE agent_shared_assets
  ADD COLUMN IF NOT EXISTS sop_stable_key TEXT,
  ADD COLUMN IF NOT EXISTS sop_semantic_version INTEGER,
  ADD COLUMN IF NOT EXISTS sop_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE agent_shared_assets
    ADD CONSTRAINT agent_shared_sop_metadata
      CHECK (
        asset_type <> 'sop'
        OR (
          sop_stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          AND sop_semantic_version > 0
          AND (sop_expires_at IS NULL OR sop_expires_at > published_at)
        )
      ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_shared_sop_active_version
  ON agent_shared_assets (account_id, project_id, sop_stable_key)
  WHERE asset_type = 'sop' AND lifecycle = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_shared_sop_retrieval
  ON agent_shared_assets (
    account_id,
    project_id,
    sop_stable_key,
    lifecycle,
    sop_semantic_version DESC
  )
  WHERE asset_type = 'sop';

COMMIT;
