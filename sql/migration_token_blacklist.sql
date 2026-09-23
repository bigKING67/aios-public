-- ============================================================================
-- Migration: Token Blacklist Table for Token Revocation
-- Purpose: Store revoked tokens to prevent their use after logout or manual revocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
    id BIGSERIAL PRIMARY KEY,
    jti VARCHAR(255) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    token_type VARCHAR(32) NOT NULL,
    revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT check_token_type CHECK (token_type IN ('access', 'refresh'))
);

-- Index for efficient JTI lookup
CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti);
-- Index for cleanup queries (remove expired entries)
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
-- Index for user-specific lookups
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);

COMMENT ON TABLE token_blacklist IS 'Token revocation table: stores revoked JWTs to prevent their use after logout or explicit revocation';
COMMENT ON COLUMN token_blacklist.jti IS 'JWT ID (unique token identifier from JWT jti claim)';
COMMENT ON COLUMN token_blacklist.user_id IS 'User ID who revoked the token';
COMMENT ON COLUMN token_blacklist.token_type IS 'Token type: access or refresh';
COMMENT ON COLUMN token_blacklist.revoked_at IS 'Timestamp when the token was revoked';
COMMENT ON COLUMN token_blacklist.expires_at IS 'Original token expiration time (for cleanup scheduling)';
