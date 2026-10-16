use chrono::Utc;
use tracing::warn;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    rate_limit::increment_window,
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

    let count = match increment_window(state, &key, 60).await {
        Ok(value) => value,
        Err(error) => {
            warn!(?error, "dragonfly INCR failed");
            return Ok(());
        }
    };

    if count > 6 {
        return Err(AppError::TooManyRequests);
    }

    Ok(())
}
