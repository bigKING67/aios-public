use chrono::Utc;
use tracing::warn;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

pub(crate) async fn check_generate_rate_limit(
    state: &AppState,
    user: &CurrentUser,
) -> AppResult<()> {
    let bucket = Utc::now().format("%Y%m%d%H%M").to_string();
    let user_key = if user.user_id.is_empty() {
        "anonymous"
    } else {
        user.user_id.as_str()
    };

    let key = format!("rl:weekly:summary:generate:{user_key}:{bucket}");

    let mut connection = state.dragonfly_connection.clone();

    let count: i64 = match dragonfly_client::cmd("INCR")
        .arg(key.as_str())
        .query_async(&mut connection)
        .await
    {
        Ok(value) => value,
        Err(error) => {
            warn!(?error, "dragonfly INCR failed");
            return Ok(());
        }
    };

    if count == 1 {
        let expire_result = dragonfly_client::cmd("EXPIRE")
            .arg(key.as_str())
            .arg(60)
            .query_async::<()>(&mut connection)
            .await;
        if let Err(error) = expire_result {
            warn!(?error, "dragonfly EXPIRE failed");
        }
    }

    if count > 6 {
        return Err(AppError::TooManyRequests);
    }

    Ok(())
}
