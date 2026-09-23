BEGIN;

CREATE TABLE IF NOT EXISTS agent_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  security_boundary TEXT NOT NULL DEFAULT 'team'
    CHECK (security_boundary IN ('team', 'department', 'client')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_account_members (
  account_id TEXT NOT NULL REFERENCES agent_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('member', 'reviewer', 'manager', 'owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_projects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES agent_accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, slug),
  UNIQUE (account_id, id)
);

CREATE TABLE IF NOT EXISTS agent_workspace_bindings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_fingerprint TEXT NOT NULL CHECK (workspace_fingerprint ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL DEFAULT 'bound'
    CHECK (state IN ('bound', 'revoked')),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (account_id, project_id) REFERENCES agent_projects(account_id, id) ON DELETE RESTRICT,
  UNIQUE (account_id, user_id, workspace_fingerprint)
);

CREATE TABLE IF NOT EXISTS agent_device_authorizations (
  id TEXT PRIMARY KEY,
  device_secret_hash TEXT NOT NULL UNIQUE CHECK (length(device_secret_hash) = 64),
  user_code_hash TEXT NOT NULL UNIQUE CHECK (length(user_code_hash) = 64),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'approved', 'denied', 'consumed', 'expired')),
  approved_user_id TEXT,
  approved_username TEXT,
  approved_roles JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(approved_roles) = 'array'),
  approved_permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(approved_permissions) = 'array'),
  approved_account_id TEXT REFERENCES agent_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK ((state IN ('approved', 'consumed')) = (approved_user_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS agent_experience_candidates (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_user_id_hash TEXT NOT NULL CHECK (length(source_user_id_hash) = 64),
  source_session_id_hash TEXT NOT NULL CHECK (length(source_session_id_hash) = 64),
  workspace_fingerprint TEXT NOT NULL CHECK (workspace_fingerprint ~ '^[a-f0-9]{64}$'),
  candidate_kind TEXT NOT NULL
    CHECK (candidate_kind IN ('project-memory', 'experience', 'case', 'sop-candidate')),
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  strategy TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'partial', 'failed', 'rolled-back')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('project', 'team', 'company')),
  applicable_when JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(applicable_when) = 'array'),
  not_applicable_when JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(not_applicable_when) = 'array'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0),
  redaction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (redaction_status IN ('pending', 'passed', 'failed')),
  duplicate_of TEXT REFERENCES agent_experience_candidates(id) ON DELETE SET NULL,
  conflict_notes TEXT,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'validated', 'approved', 'publishing', 'shared', 'rejected', 'failed', 'revoked')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  FOREIGN KEY (account_id, project_id) REFERENCES agent_projects(account_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS agent_shared_assets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES agent_experience_candidates(id) ON DELETE RESTRICT,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('project-memory', 'experience', 'case', 'sop-candidate')),
  title TEXT NOT NULL,
  locator TEXT NOT NULL,
  external_revision TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('active', 'deprecated', 'revoked')),
  published_by TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  FOREIGN KEY (account_id, project_id) REFERENCES agent_projects(account_id, id) ON DELETE RESTRICT,
  CHECK ((lifecycle = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS agent_operations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES agent_accounts(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  target_id TEXT,
  state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (state IN ('accepted', 'running', 'completed', 'failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (account_id, actor_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS agent_audit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES agent_accounts(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  correlation_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'completed', 'failed', 'denied')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_projects_account_status
  ON agent_projects (account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_bindings_user_workspace
  ON agent_workspace_bindings (user_id, workspace_fingerprint, state);
CREATE INDEX IF NOT EXISTS idx_agent_device_authorizations_expiry
  ON agent_device_authorizations (state, expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_candidates_review_queue
  ON agent_experience_candidates (account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_candidates_project
  ON agent_experience_candidates (account_id, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_shared_assets_retrieval
  ON agent_shared_assets (account_id, project_id, lifecycle, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_account_time
  ON agent_audit_events (account_id, created_at DESC);

INSERT INTO auth_permissions (key)
SELECT permission_key
FROM (VALUES
  ('agent:read'),
  ('agent:project:manage'),
  ('agent:candidate:submit'),
  ('agent:candidate:review'),
  ('agent:asset:publish'),
  ('agent:asset:revoke'),
  ('agent:runtime:manage')
) AS values_to_insert(permission_key)
WHERE to_regclass('public.auth_permissions') IS NOT NULL
ON CONFLICT (key) DO NOTHING;

COMMIT;
