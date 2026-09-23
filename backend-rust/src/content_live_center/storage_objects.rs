use reqwest::{Client, StatusCode};
use tracing::warn;

use crate::{
    config::Settings,
    error::{AppError, AppResult},
};

use super::uploads;

pub(super) async fn delete_object(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
) -> AppResult<()> {
    let url = uploads::build_delete_object_url(settings, object_key)?;
    let response = http_client.delete(url).send().await.map_err(|error| {
        warn!(?error, object_key, "delete live-center TOS object failed");
        AppError::bad_request("录屏对象删除失败，请稍后重试")
    })?;
    let status = response.status();
    if status.is_success() || status == StatusCode::NOT_FOUND {
        return Ok(());
    }

    let detail = response.text().await.unwrap_or_default();
    warn!(
        status = %status,
        object_key,
        detail = %detail.chars().take(240).collect::<String>(),
        "live-center TOS object delete returned non-success status"
    );
    Err(AppError::bad_request(format!(
        "录屏对象删除失败（HTTP {status}）"
    )))
}
