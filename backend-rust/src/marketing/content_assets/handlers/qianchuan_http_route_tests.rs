use std::{env, net::SocketAddr, sync::Arc};

use chrono::Utc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::{
    config::{SampleInventoryAccessMode, Settings},
    cors::build_cors_layer,
    routes::build_app,
    state::AppState,
};

const MAIN_ASSET_ID: &str = "11111111-1111-1111-1111-111111111111";
const FIXTURE_USER_ID: i64 = 90_000_001;
const FIXTURE_ROLE_ID: i64 = 90_000_101;
const FIXTURE_PERMISSION_ID: i64 = 90_000_201;
const FIXTURE_SECRET: &str = "qianchuan-fixture-http-secret";

#[derive(Debug, Serialize)]
struct TestClaims {
    sub: String,
    typ: String,
    exp: usize,
    iat: usize,
    jti: String,
    username: Option<String>,
    roles: Vec<String>,
    permissions: Vec<String>,
}

async fn fixture_pool() -> Option<(PgPool, String)> {
    let Ok(database_url) = env::var("AIOS_QC_FIXTURE_DATABASE_URL") else {
        eprintln!(
            "skipping qianchuan HTTP route fixture test: AIOS_QC_FIXTURE_DATABASE_URL is not set"
        );
        return None;
    };
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .expect("connect to AIOS_QC_FIXTURE_DATABASE_URL");
    Some((pool, database_url))
}

pub(crate) async fn seed_route_fixture_schema_and_auth(pool: &PgPool) {
    for statement in [
        r#"
            ALTER TABLE ads.marketing_content_assets
              ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'video',
              ADD COLUMN IF NOT EXISTS asset_status TEXT DEFAULT 'ready',
              ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'ready',
              ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active',
              ADD COLUMN IF NOT EXISTS external_only BOOLEAN DEFAULT FALSE,
              ADD COLUMN IF NOT EXISTS bucket TEXT DEFAULT '',
              ADD COLUMN IF NOT EXISTS raw_object_key TEXT,
              ADD COLUMN IF NOT EXISTS preview_object_key TEXT,
              ADD COLUMN IF NOT EXISTS cover_object_key TEXT,
              ADD COLUMN IF NOT EXISTS transcript_object_key TEXT,
              ADD COLUMN IF NOT EXISTS raw_sha256 TEXT,
              ADD COLUMN IF NOT EXISTS file_ext TEXT,
              ADD COLUMN IF NOT EXISTS mime_type TEXT,
              ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC,
              ADD COLUMN IF NOT EXISTS width INT,
              ADD COLUMN IF NOT EXISTS height INT,
              ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
              ADD COLUMN IF NOT EXISTS preview_size_bytes BIGINT,
              ADD COLUMN IF NOT EXISTS platform TEXT,
              ADD COLUMN IF NOT EXISTS platform_names TEXT[] DEFAULT '{}',
              ADD COLUMN IF NOT EXISTS product_name TEXT,
              ADD COLUMN IF NOT EXISTS product_names TEXT[] DEFAULT '{}',
              ADD COLUMN IF NOT EXISTS sku_names TEXT[] DEFAULT '{}',
              ADD COLUMN IF NOT EXISTS creator_name TEXT,
              ADD COLUMN IF NOT EXISTS video_type TEXT,
              ADD COLUMN IF NOT EXISTS content_scene TEXT,
              ADD COLUMN IF NOT EXISTS content_scene_group TEXT,
              ADD COLUMN IF NOT EXISTS content_scene_subtype TEXT,
              ADD COLUMN IF NOT EXISTS owner_name TEXT,
              ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
              ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT,
              ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
              ADD COLUMN IF NOT EXISTS ai_suggested_title TEXT,
              ADD COLUMN IF NOT EXISTS ai_suggested_tags TEXT[] DEFAULT '{}',
              ADD COLUMN IF NOT EXISTS ai_metadata_generated_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS title_source TEXT DEFAULT 'manual',
              ADD COLUMN IF NOT EXISTS tags_source TEXT DEFAULT 'manual',
              ADD COLUMN IF NOT EXISTS notes TEXT,
              ADD COLUMN IF NOT EXISTS authorization_status TEXT DEFAULT 'unknown',
              ADD COLUMN IF NOT EXISTS commercial_use_allowed BOOLEAN,
              ADD COLUMN IF NOT EXISTS repurpose_allowed BOOLEAN,
              ADD COLUMN IF NOT EXISTS authorization_starts_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS authorization_notes TEXT,
              ADD COLUMN IF NOT EXISTS ai_summary TEXT,
              ADD COLUMN IF NOT EXISTS ai_score NUMERIC,
              ADD COLUMN IF NOT EXISTS ai_analysis_source TEXT,
              ADD COLUMN IF NOT EXISTS ai_analysis_model TEXT,
              ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS transcript_source TEXT,
              ADD COLUMN IF NOT EXISTS transcript_model TEXT,
              ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS script_excerpt TEXT,
              ADD COLUMN IF NOT EXISTS roi NUMERIC,
              ADD COLUMN IF NOT EXISTS ctr NUMERIC,
              ADD COLUMN IF NOT EXISTS cvr NUMERIC,
              ADD COLUMN IF NOT EXISTS spend NUMERIC,
              ADD COLUMN IF NOT EXISTS gmv NUMERIC,
              ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual',
              ADD COLUMN IF NOT EXISTS source_platform TEXT,
              ADD COLUMN IF NOT EXISTS source_url TEXT,
              ADD COLUMN IF NOT EXISTS source_sheet_id TEXT,
              ADD COLUMN IF NOT EXISTS source_sheet_name TEXT,
              ADD COLUMN IF NOT EXISTS source_row_index INT,
              ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ
            "#,
        r#"
            ALTER TABLE ads.marketing_content_asset_objects
              ADD COLUMN IF NOT EXISTS object_role TEXT DEFAULT 'raw',
              ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'fixture',
              ADD COLUMN IF NOT EXISTS bucket TEXT DEFAULT 'fixture',
              ADD COLUMN IF NOT EXISTS object_key TEXT DEFAULT '',
              ADD COLUMN IF NOT EXISTS content_type TEXT,
              ADD COLUMN IF NOT EXISTS file_ext TEXT,
              ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
              ADD COLUMN IF NOT EXISTS sha256 TEXT,
              ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
              ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB
            "#,
        r#"
            ALTER TABLE ads.marketing_content_platform_videos
              ADD COLUMN IF NOT EXISTS account_id TEXT,
              ADD COLUMN IF NOT EXISTS account_name TEXT,
              ADD COLUMN IF NOT EXISTS advertiser_id TEXT,
              ADD COLUMN IF NOT EXISTS external_item_id TEXT,
              ADD COLUMN IF NOT EXISTS external_note_id TEXT,
              ADD COLUMN IF NOT EXISTS external_url TEXT,
              ADD COLUMN IF NOT EXISTS publish_title TEXT,
              ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'published',
              ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fixture'
            "#,
        r#"
            ALTER TABLE ads.marketing_content_ad_materials
              ADD COLUMN IF NOT EXISTS account_id TEXT,
              ADD COLUMN IF NOT EXISTS account_name TEXT,
              ADD COLUMN IF NOT EXISTS advertiser_id TEXT,
              ADD COLUMN IF NOT EXISTS external_video_id TEXT,
              ADD COLUMN IF NOT EXISTS material_name TEXT,
              ADD COLUMN IF NOT EXISTS material_title TEXT,
              ADD COLUMN IF NOT EXISTS material_status TEXT DEFAULT 'active',
              ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fixture'
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_transcripts (
              transcript_id UUID PRIMARY KEY,
              asset_id UUID NOT NULL,
              source_object_key TEXT,
              transcript_object_key TEXT,
              provider TEXT,
              model TEXT,
              language TEXT,
              status TEXT DEFAULT 'active',
              transcript_text TEXT,
              script_text TEXT,
              srt_text TEXT,
              segments JSONB DEFAULT '[]'::JSONB,
              duration_seconds NUMERIC,
              word_count INT,
              confidence NUMERIC,
              metadata JSONB DEFAULT '{}'::JSONB,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_sources (
              source_id BIGSERIAL PRIMARY KEY,
              asset_id UUID NOT NULL,
              source_kind TEXT,
              source_url TEXT,
              source_title TEXT,
              feishu_file_token TEXT,
              feishu_sheet_id TEXT,
              feishu_sheet_name TEXT,
              feishu_row_index INT,
              external_platform TEXT,
              external_status TEXT DEFAULT 'active',
              metadata JSONB DEFAULT '{}'::JSONB,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_events (
              event_id BIGSERIAL PRIMARY KEY,
              asset_id UUID NOT NULL,
              event_type TEXT,
              actor TEXT,
              message TEXT,
              payload JSONB DEFAULT '{}'::JSONB,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS ads.douyin_shortvideo_detail (
              detail_grain TEXT,
              account_type TEXT,
              asset_ids UUID[] DEFAULT '{}',
              video_id TEXT,
              qianchuan_material_ids TEXT[] DEFAULT '{}',
              qianchuan_material_key TEXT,
              author_nickname TEXT,
              author_douyin_id TEXT
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS public.auth_users (
              id BIGINT PRIMARY KEY,
              username TEXT NOT NULL,
              email TEXT,
              display_name TEXT,
              password_hash TEXT NOT NULL DEFAULT '',
              is_active BOOLEAN NOT NULL DEFAULT TRUE,
              last_login_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS public.auth_roles (
              id BIGINT PRIMARY KEY,
              name TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS public.auth_permissions (
              id BIGINT PRIMARY KEY,
              key TEXT NOT NULL,
              description TEXT,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS public.auth_user_roles (
              user_id BIGINT NOT NULL,
              role_id BIGINT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (user_id, role_id)
            )
            "#,
        r#"
            CREATE TABLE IF NOT EXISTS public.auth_role_permissions (
              role_id BIGINT NOT NULL,
              permission_id BIGINT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (role_id, permission_id)
            )
            "#,
    ] {
        sqlx::query(statement)
            .execute(pool)
            .await
            .expect("bootstrap route fixture schema");
    }

    sqlx::query(
            r#"
            INSERT INTO public.auth_users (id, username, email, display_name, password_hash, is_active)
            VALUES ($1, 'qianchuan_http_fixture', 'qianchuan-http-fixture@example.invalid', 'Qianchuan HTTP Fixture', 'fixture', TRUE)
            ON CONFLICT (id) DO UPDATE
            SET username = EXCLUDED.username,
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                is_active = TRUE
            "#,
        )
        .bind(FIXTURE_USER_ID)
        .execute(pool)
        .await
        .expect("seed fixture auth user");

    sqlx::query(
        r#"
            INSERT INTO public.auth_roles (id, name)
            VALUES ($1, 'content_ops')
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name
            "#,
    )
    .bind(FIXTURE_ROLE_ID)
    .execute(pool)
    .await
    .expect("seed fixture auth role");

    sqlx::query(
            r#"
            INSERT INTO public.auth_permissions (id, key, description)
            VALUES ($1, 'marketing:content_assets:read', 'Read content assets in qianchuan fixture tests')
            ON CONFLICT (id) DO UPDATE
            SET key = EXCLUDED.key,
                description = EXCLUDED.description
            "#,
        )
        .bind(FIXTURE_PERMISSION_ID)
        .execute(pool)
        .await
        .expect("seed fixture auth permission");

    sqlx::query(
        r#"
            INSERT INTO public.auth_user_roles (user_id, role_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
    )
    .bind(FIXTURE_USER_ID)
    .bind(FIXTURE_ROLE_ID)
    .execute(pool)
    .await
    .expect("seed fixture user-role mapping");

    sqlx::query(
        r#"
            INSERT INTO public.auth_role_permissions (role_id, permission_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
    )
    .bind(FIXTURE_ROLE_ID)
    .bind(FIXTURE_PERMISSION_ID)
    .execute(pool)
    .await
    .expect("seed fixture role-permission mapping");
}

pub(crate) fn fixture_settings(database_url: String) -> Settings {
    Settings {
        host: "127.0.0.1".to_string(),
        port: 0,
        database_url,
        db_max_connections: 4,
        db_min_connections: 0,
        db_acquire_timeout_seconds: 5,
        db_test_before_acquire: true,
        dashboard_api_cache_ttl_ms: 0,
        secret_key: FIXTURE_SECRET.to_string(),
        access_token_expire_minutes: 15,
        refresh_token_expire_days: 30,
        dragonfly_url: "redis://127.0.0.1:6379".to_string(),
        cors_origins: vec!["http://127.0.0.1:5173".to_string()],
        sample_inventory_access_mode: SampleInventoryAccessMode::Authenticated,
        weekly_report_cache_ttl_seconds: 0,
        weekly_period_cache_ttl_seconds: 0,
        monthly_report_cache_ttl_seconds: 0,
        monthly_period_cache_ttl_seconds: 0,
        report_build_concurrency: 1,
        report_warmup_weekly_period_limit: 0,
        report_warmup_monthly_period_limit: 0,
        report_warmup_parallelism: 1,
        report_warmup_interval_seconds: 3600,
        llm_default_provider: "fixture".to_string(),
        llm_default_model: "fixture".to_string(),
        llm_timeout_seconds: 1,
        llm_reasoner_timeout_seconds: 1,
        llm_reasoner_max_tokens: 1,
        llm_temperature: 0.0,
        llm_max_tokens: 1,
        kimi_base_url: String::new(),
        kimi_api_key: String::new(),
        kimi_model: String::new(),
        deepseek_base_url: String::new(),
        deepseek_api_key: String::new(),
        deepseek_model: String::new(),
        content_production_enabled: false,
        content_production_planning_enabled: false,
        content_production_shot_extraction_enabled: false,
        content_production_semantics_enabled: false,
        content_asset_delivery_provider: "volc_cdn".to_string(),
        content_asset_cdn_base_url: "https://cdn.fixture.invalid".to_string(),
        content_asset_signed_url_ttl_seconds: 300,
        douyin_live_recording_upload_signed_url_ttl_seconds: 28_800,
        tos_access_key_id: String::new(),
        tos_secret_access_key: String::new(),
        tos_endpoint: String::new(),
        tos_region: String::new(),
        tos_bucket: "fixture".to_string(),
    }
}

async fn spawn_fixture_server(pool: PgPool, database_url: String) -> (SocketAddr, JoinHandle<()>) {
    let settings = Arc::new(fixture_settings(database_url));
    let dragonfly_client = dragonfly_client::Client::open(settings.dragonfly_url.as_str())
        .expect("open dragonfly fixture client");
    let dragonfly_connection = dragonfly_client
        .get_multiplexed_tokio_connection()
        .await
        .expect("connect to local dragonfly fixture");
    let state = Arc::new(AppState {
        pool,
        creator_library_filter_cache: Default::default(),
        dragonfly_connection,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        http_client: reqwest::Client::builder()
            .build()
            .expect("build fixture reqwest client"),
        settings: Arc::clone(&settings),
    });
    let cors = build_cors_layer(&settings).expect("build fixture CORS layer");
    let app = build_app(state, cors);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture HTTP listener");
    let address = listener
        .local_addr()
        .expect("read fixture listener address");
    let handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("serve qianchuan fixture HTTP route");
    });
    (address, handle)
}

pub(crate) fn access_token() -> String {
    let now = Utc::now();
    let claims = TestClaims {
        sub: FIXTURE_USER_ID.to_string(),
        typ: "access".to_string(),
        exp: (now + chrono::Duration::minutes(15)).timestamp() as usize,
        iat: now.timestamp() as usize,
        jti: Uuid::new_v4().to_string(),
        username: Some("qianchuan_http_fixture".to_string()),
        roles: vec!["content_ops".to_string()],
        permissions: vec!["marketing:content_assets:read".to_string()],
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(FIXTURE_SECRET.as_bytes()),
    )
    .expect("encode fixture access token")
}

fn find_material<'a>(materials: &'a [Value], material_id: &str) -> &'a Value {
    materials
        .iter()
        .find(|material| {
            material
                .get("materialId")
                .and_then(Value::as_str)
                .is_some_and(|value| value == material_id)
        })
        .unwrap_or_else(|| panic!("material {material_id} should be present"))
}

#[tokio::test]
async fn qianchuan_http_route_returns_populated_detail_and_daily_fixture_when_configured() {
    let Some((pool, database_url)) = fixture_pool().await else {
        return;
    };
    seed_route_fixture_schema_and_auth(&pool).await;
    let (address, server) = spawn_fixture_server(pool, database_url).await;
    let client = reqwest::Client::builder()
        .build()
        .expect("build fixture HTTP test client");

    let detail_url = format!("http://{address}/v1/marketing/content-assets/assets/{MAIN_ASSET_ID}");
    let unauthorized = client
        .get(&detail_url)
        .send()
        .await
        .expect("send unauthenticated detail request");
    assert_eq!(unauthorized.status(), reqwest::StatusCode::UNAUTHORIZED);

    let token = access_token();
    let detail_response = client
        .get(&detail_url)
        .bearer_auth(&token)
        .send()
        .await
        .expect("send authenticated detail request");
    assert_eq!(detail_response.status(), reqwest::StatusCode::OK);
    let detail = detail_response
        .json::<Value>()
        .await
        .expect("parse detail JSON");
    assert_eq!(
        detail.pointer("/asset/canEdit").and_then(Value::as_bool),
        Some(true)
    );

    let snapshot = detail
        .get("performanceSnapshot")
        .expect("detail route should serialize performanceSnapshot");
    assert_eq!(
        snapshot.get("deliveryMode").and_then(Value::as_str),
        Some("qianchuan_all_domain")
    );
    assert_eq!(
        snapshot
            .pointer("/totals/materialCount")
            .and_then(Value::as_i64),
        Some(2)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/productMaterialCount")
            .and_then(Value::as_i64),
        Some(1)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/liveMaterialCount")
            .and_then(Value::as_i64),
        Some(1)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/totalImpressions")
            .and_then(Value::as_i64),
        Some(30_000)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/totalClicks")
            .and_then(Value::as_i64),
        Some(2_000)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/totalOrders")
            .and_then(Value::as_i64),
        Some(70)
    );
    assert_eq!(
        snapshot
            .pointer("/totals/totalCost")
            .and_then(Value::as_f64),
        Some(2_000.0)
    );
    assert_eq!(
        snapshot.pointer("/totals/totalGmv").and_then(Value::as_f64),
        Some(6_800.0)
    );
    assert_eq!(
        snapshot.pointer("/totals/payRoi").and_then(Value::as_f64),
        Some(3.4)
    );

    let materials = snapshot
        .get("materials")
        .and_then(Value::as_array)
        .expect("snapshot materials should be an array");
    let product = find_material(materials, "MAT-PRODUCT-001");
    assert_eq!(
        product.get("objective").and_then(Value::as_str),
        Some("product_all_domain_shortvideo")
    );
    assert_eq!(
        product.get("sourceTable").and_then(Value::as_str),
        Some("ods.douyin_qianchuan_shortvideo_raw")
    );

    let live = find_material(materials, "MAT-LIVE-001");
    assert_eq!(
        live.get("objective").and_then(Value::as_str),
        Some("live_all_domain_shortvideo")
    );
    assert_eq!(
        live.get("sourceTable").and_then(Value::as_str),
        Some("ods.douyin_qianchuan_live_video_raw")
    );
    assert_eq!(
        live.pointer("/latestMetrics/boostPolicy")
            .and_then(Value::as_str),
        Some("boost metrics are explanatory only; do not add to overall metrics")
    );
    assert_eq!(
        live.pointer("/liveAcceptance/attributionLevel")
            .and_then(Value::as_str),
        Some("account_date_environment")
    );
    assert_eq!(
        live.pointer("/liveAcceptance/douyinAccountDisplayId")
            .and_then(Value::as_str),
        Some("dy_live_001")
    );

    let ad_material_ids = detail
        .get("adMaterials")
        .and_then(Value::as_array)
        .expect("detail route should serialize adMaterials")
        .iter()
        .filter_map(|item| item.get("externalMaterialId").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert!(ad_material_ids.contains(&"MAT-PRODUCT-001"));
    assert!(ad_material_ids.contains(&"MAT-LIVE-001"));

    let daily_url = format!(
            "http://{address}/v1/marketing/content-assets/assets/{MAIN_ASSET_ID}/performance/daily?materialId=MAT-LIVE-001&objective=live_all_domain_shortvideo&startDate=2026-06-18&endDate=2026-06-18"
        );
    let daily_response = client
        .get(daily_url)
        .bearer_auth(token)
        .send()
        .await
        .expect("send authenticated daily request");
    assert_eq!(daily_response.status(), reqwest::StatusCode::OK);
    let daily = daily_response
        .json::<Value>()
        .await
        .expect("parse daily JSON");
    assert_eq!(
        daily.get("deliveryMode").and_then(Value::as_str),
        Some("qianchuan_all_domain")
    );
    assert_eq!(
        daily.pointer("/filters/materialId").and_then(Value::as_str),
        Some("MAT-LIVE-001")
    );
    assert_eq!(
        daily.pointer("/filters/objective").and_then(Value::as_str),
        Some("live_all_domain_shortvideo")
    );
    let rows = daily
        .get("rows")
        .and_then(Value::as_array)
        .expect("daily route should serialize rows");
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(
        row.get("materialId").and_then(Value::as_str),
        Some("MAT-LIVE-001")
    );
    assert_eq!(
        row.get("objective").and_then(Value::as_str),
        Some("live_all_domain_shortvideo")
    );
    assert_eq!(
        row.get("sourceTable").and_then(Value::as_str),
        Some("ods.douyin_qianchuan_live_video_raw")
    );
    assert_eq!(row.get("boostCost").and_then(Value::as_f64), Some(180.0));
    assert_eq!(
        row.get("overallCost").and_then(Value::as_f64),
        Some(1_200.0)
    );

    server.abort();
}
