mod conflict;
mod create;
mod delete;
mod update;

pub(in crate::marketing) use create::create_follow_log;
pub(in crate::marketing) use delete::delete_follow_log_by_id;
pub(in crate::marketing) use update::update_follow_log_by_id;
