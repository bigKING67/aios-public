pub(in crate::marketing) const CREATOR_LIBRARY_READ_PERMISSIONS: [&str; 3] = [
    "marketing:creator_library:read",
    "marketing:creator_library:write",
    "marketing:creator_library:manage",
];
pub(in crate::marketing) const CREATOR_LIBRARY_WRITE_PERMISSIONS: [&str; 2] = [
    "marketing:creator_library:write",
    "marketing:creator_library:manage",
];
pub(in crate::marketing) const CREATOR_LIBRARY_MANAGE_PERMISSION: &str =
    "marketing:creator_library:manage";
pub(in crate::marketing) const BD_ROLE_CODE: &str = "bd";
pub(in crate::marketing) const BD_MANAGER_ROLE_CODE: &str = "bd_manager";
pub(in crate::marketing) const DEFAULT_PAGE: i64 = 1;
pub(in crate::marketing) const DEFAULT_PAGE_SIZE: i64 = 20;
pub(in crate::marketing) const MAX_PAGE_SIZE: i64 = 100;
pub(in crate::marketing) const MAX_EXPORT_ROWS: i64 = 10_000;
pub(in crate::marketing) const MAX_IMPORT_ROWS: usize = 1_000;
pub(in crate::marketing) const TEXT_MAX_LEN: usize = 500;
pub(in crate::marketing) const NOTE_MAX_LEN: usize = 2_000;
pub(in crate::marketing) const TEMPLATE_SHEET_NAME: &str = "达人表";
pub(in crate::marketing) const TEMPLATE_HELP_SHEET_NAME: &str = "填写说明";
pub(in crate::marketing) const CREATOR_LIBRARY_TEMPLATE_HEADERS: [&str; 9] = [
    "达人ID",
    "达人昵称",
    "平台",
    "粉丝数",
    "主播标签",
    "达人等级",
    "近90天带货GMV",
    "合作状态",
    "归属BD",
];
pub(in crate::marketing) const CSV_TEMPLATE: &str =
    "达人ID,达人昵称,平台,粉丝数,主播标签,达人等级,近90天带货GMV,合作状态,归属BD\n";
pub(in crate::marketing) const CSV_EXPORT_HEADER: &str = "达人ID,达人昵称,平台,粉丝数,主播标签,达人等级,近90天带货GMV,合作状态,归属BD,最近跟进,跟进历史,合作描述\n";
pub(in crate::marketing) const NOT_COOPERABLE_STATUS_VALUE: &str = "❌不合作";
pub(in crate::marketing) const DEFAULT_BD_PASSWORD_ENV: &str = "INITIAL_BD_PASSWORD";
