-- ============================================================================
-- Migration: Dashboard Access Control List (ACL) for Permission Management
-- Purpose: Manage dashboard ownership and sharing permissions
-- ============================================================================

-- Create dashboard_sharing table to track who can access which dashboard
CREATE TABLE IF NOT EXISTS dashboard_sharing (
    id BIGSERIAL PRIMARY KEY,
    dashboard_id VARCHAR(64) NOT NULL,
    shared_with_user_id BIGINT NOT NULL,
    permission_level VARCHAR(32) NOT NULL DEFAULT 'view',
    shared_by_user_id BIGINT NOT NULL,
    shared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    UNIQUE(dashboard_id, shared_with_user_id),
    CONSTRAINT check_permission_level CHECK (permission_level IN ('view', 'edit', 'manage')),
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_dashboard_sharing_dashboard_id ON dashboard_sharing(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_sharing_shared_with_user_id ON dashboard_sharing(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_sharing_permission_level ON dashboard_sharing(permission_level);

-- Add owner_id column to dashboards if it doesn't exist (ensuring proper ownership)
-- Note: This may already exist in the dashboards table
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS owner_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_dashboards_owner_id ON dashboards(owner_id);

COMMENT ON TABLE dashboard_sharing IS 'Dashboard access control: manages sharing and permission levels for dashboard access';
COMMENT ON COLUMN dashboard_sharing.dashboard_id IS 'Dashboard identifier';
COMMENT ON COLUMN dashboard_sharing.shared_with_user_id IS 'User ID who has been granted access';
COMMENT ON COLUMN dashboard_sharing.permission_level IS 'Permission level: view (read-only), edit (can modify), manage (can share)';
COMMENT ON COLUMN dashboard_sharing.shared_by_user_id IS 'User ID who granted the access';
COMMENT ON COLUMN dashboard_sharing.expires_at IS 'Optional expiration time for time-limited access';
