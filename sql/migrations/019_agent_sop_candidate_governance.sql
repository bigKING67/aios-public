BEGIN;

ALTER TABLE agent_experience_candidates
  ADD COLUMN IF NOT EXISTS method JSONB,
  ADD COLUMN IF NOT EXISTS sop_stable_key TEXT,
  ADD COLUMN IF NOT EXISTS sop_semantic_version INTEGER,
  ADD COLUMN IF NOT EXISTS sop_owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS sop_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sop_supersedes_candidate_id TEXT
    REFERENCES agent_experience_candidates(id) ON DELETE RESTRICT;

DO $$
BEGIN
  ALTER TABLE agent_experience_candidates
    ADD CONSTRAINT agent_candidate_method_object
      CHECK (method IS NULL OR jsonb_typeof(method) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE agent_experience_candidates
    ADD CONSTRAINT agent_sop_candidate_metadata
      CHECK (
        candidate_kind <> 'sop-candidate'
        OR (
          method IS NOT NULL
          AND sop_stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          AND sop_semantic_version > 0
          AND sop_owner_user_id IS NOT NULL
          AND (sop_expires_at IS NULL OR sop_expires_at > created_at)
        )
      ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sop_candidate_version
  ON agent_experience_candidates (
    account_id,
    project_id,
    sop_stable_key,
    sop_semantic_version
  )
  WHERE candidate_kind = 'sop-candidate';

CREATE TABLE IF NOT EXISTS agent_candidate_sources (
  parent_candidate_id TEXT NOT NULL
    REFERENCES agent_experience_candidates(id) ON DELETE RESTRICT,
  source_candidate_id TEXT NOT NULL
    REFERENCES agent_experience_candidates(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_candidate_id, source_candidate_id),
  CHECK (parent_candidate_id <> source_candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_candidate_sources_source
  ON agent_candidate_sources (source_candidate_id, parent_candidate_id);

CREATE OR REPLACE FUNCTION prevent_agent_candidate_source_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent candidate source links are immutable';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'agent_candidate_sources_immutable'
      AND tgrelid = 'agent_candidate_sources'::regclass
  ) THEN
    CREATE TRIGGER agent_candidate_sources_immutable
      BEFORE UPDATE OR DELETE ON agent_candidate_sources
      FOR EACH ROW EXECUTE FUNCTION prevent_agent_candidate_source_mutation();
  END IF;
END $$;

COMMIT;
