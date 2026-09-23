-- Additive. Apply through the migration ledger, never at API startup.
CREATE TABLE ads.content_production_shot_catalogs (
    catalog_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, asset_id, content_hash)
);
CREATE INDEX content_production_shot_catalogs_owner_idx
    ON ads.content_production_shot_catalogs (owner_user_id, created_at DESC);
