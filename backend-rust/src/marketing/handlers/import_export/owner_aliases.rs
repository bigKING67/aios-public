use std::{collections::HashSet, sync::Arc};

use crate::{error::AppResult, marketing::types::CreatorLibraryPayload, state::AppState};

use super::super::filter_options::query_cached_filter_options;

pub(super) async fn count_new_owner_aliases(
    state: &Arc<AppState>,
    rows: &[CreatorLibraryPayload],
) -> AppResult<usize> {
    if rows
        .iter()
        .all(|row| row.owner_name.as_deref().unwrap_or("").trim().is_empty())
    {
        return Ok(0);
    }

    let filter_options = query_cached_filter_options(state).await?;
    let existing_aliases = filter_options
        .bd_users
        .iter()
        .flat_map(|user| {
            std::iter::once(user.display_name.as_str())
                .chain(std::iter::once(user.username.as_str()))
                .chain(user.aliases.iter().map(String::as_str))
        })
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>();
    let new_aliases = rows
        .iter()
        .filter_map(|row| row.owner_name.as_deref())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty() && !existing_aliases.contains(value))
        .collect::<HashSet<_>>();

    Ok(new_aliases.len())
}
