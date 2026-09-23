use super::super::types::AuditStorage;

#[derive(Debug, Clone, Copy)]
pub(super) struct AuditStorageTables {
    pub(super) logs: &'static str,
    pub(super) users: &'static str,
}

pub(super) fn audit_storage_tables(storage: AuditStorage) -> AuditStorageTables {
    match storage {
        AuditStorage::Legacy => AuditStorageTables {
            logs: "audit_logs",
            users: "users",
        },
        AuditStorage::Ods => AuditStorageTables {
            logs: "ods_aios_audit_logs",
            users: "ods_aios_users",
        },
    }
}
