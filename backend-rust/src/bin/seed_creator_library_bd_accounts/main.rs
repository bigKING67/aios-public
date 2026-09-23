use anyhow::anyhow;
use bcrypt::{hash, DEFAULT_COST};
use sqlx::postgres::PgPoolOptions;

use self::{
    accounts::{parse_account_map, resolve_account},
    constants::{BD_ACCOUNT_MAP_ENV, BD_PASSWORD_ENV},
    database_url::normalize_database_url,
    env_loader::{load_env_relaxed, required_env},
    identities::upsert_bd_identity,
    owners::fetch_owner_aliases,
    schema::ensure_schema,
    users::{ensure_user_role, upsert_auth_user},
};

mod accounts;
mod constants;
mod database_url;
mod env_loader;
mod identities;
mod owners;
mod rbac;
mod schema;
mod users;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    load_env_relaxed(".env").ok();

    let database_url =
        normalize_database_url(required_env("DATABASE_URL", "missing DATABASE_URL")?);
    let password = required_env(
        BD_PASSWORD_ENV,
        "missing INITIAL_BD_PASSWORD; pass it via env, do not hardcode it",
    )?;
    let account_map = parse_account_map()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url.as_str())
        .await?;

    ensure_schema(&pool).await?;
    let aliases = fetch_owner_aliases(&pool).await?;

    let mut resolved_aliases = Vec::new();
    let mut skipped = Vec::new();
    for alias in aliases {
        match resolve_account(alias.as_str(), &account_map) {
            Some(account) => resolved_aliases.push((alias, account)),
            None => skipped.push(alias),
        }
    }
    if !skipped.is_empty() {
        return Err(anyhow!(
            "missing username mapping for non-ascii BD aliases: {}. Provide {}='{{\"姓名\":\"username\"}}'",
            skipped.join(", "),
            BD_ACCOUNT_MAP_ENV
        ));
    }

    let password_hash = hash(password.as_str(), DEFAULT_COST)?;
    let mut created = 0usize;
    let mut linked = 0usize;

    for (alias, account) in resolved_aliases {
        let display_name = account.display_name.unwrap_or_else(|| alias.clone());
        let user_id = upsert_auth_user(
            &pool,
            account.username.as_str(),
            display_name.as_str(),
            &password_hash,
        )
        .await?;
        if user_id.created {
            created += 1;
        }
        ensure_user_role(&pool, user_id.id.as_str(), "bd").await?;
        upsert_bd_identity(
            &pool,
            user_id.id.as_str(),
            account.username.as_str(),
            display_name.as_str(),
            alias.as_str(),
        )
        .await?;
        linked += 1;
    }

    for username in ["darmadan", "yuyue"] {
        let display_name = if username == "yuyue" {
            "于悦"
        } else {
            username
        };
        let user = upsert_auth_user(&pool, username, display_name, &password_hash).await?;
        if user.created {
            created += 1;
        }
        ensure_user_role(&pool, user.id.as_str(), "bd").await?;
        upsert_bd_identity(
            &pool,
            user.id.as_str(),
            username,
            display_name,
            display_name,
        )
        .await?;
        linked += 1;
    }

    println!(
        "creator library BD seed complete: created_users={created}, linked_identities={linked}"
    );

    Ok(())
}
