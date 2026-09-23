const DB_CONNECTION_MESSAGE: &str =
    "数据库连接失败：当前服务无法连接 PostgreSQL，请检查 PGHOST/PGPORT/PGDATABASE 配置。";
const DB_NETWORK_MESSAGE: &str =
    "数据库网络不可达：当前服务进程无法访问目标数据库地址，请检查网络策略/防火墙或运行环境权限。";
const DB_AUTH_MESSAGE: &str = "数据库认证失败：请检查 PGUSER/PGPASSWORD 或 DATABASE_URL 配置。";

pub(super) struct MissingRelation {
    pub(super) name: &'static str,
    pub(super) message: &'static str,
}

pub(super) struct MissingColumn {
    pub(super) name: &'static str,
    pub(super) message: &'static str,
}

pub(super) struct ErrorMessageSpec {
    pub(super) permission_message: &'static str,
    pub(super) psql_message: &'static str,
    pub(super) fallback_message: &'static str,
    pub(super) missing_database_message: Option<&'static str>,
    pub(super) missing_relations: &'static [MissingRelation],
    pub(super) missing_columns: &'static [MissingColumn],
}

pub(super) fn normalize_error_message(raw_error: &str, spec: &ErrorMessageSpec) -> String {
    let raw = raw_error.to_lowercase();

    if raw.contains("connection refused") || raw.contains("could not connect to server") {
        return DB_CONNECTION_MESSAGE.to_string();
    }

    if raw.contains("operation not permitted")
        || raw.contains("network is unreachable")
        || raw.contains("no route to host")
        || raw.contains("connection timed out")
    {
        return DB_NETWORK_MESSAGE.to_string();
    }

    if raw.contains("password authentication failed") {
        return DB_AUTH_MESSAGE.to_string();
    }

    if raw.contains("does not exist") && raw.contains("database") {
        if let Some(message) = spec.missing_database_message {
            return message.to_string();
        }
    }

    if raw.contains("permission denied") {
        return spec.permission_message.to_string();
    }

    for relation in spec.missing_relations {
        if raw.contains("relation") && raw.contains(relation.name) && raw.contains("does not exist")
        {
            return relation.message.to_string();
        }
    }

    for column in spec.missing_columns {
        if raw.contains("column") && raw.contains(column.name) && raw.contains("does not exist") {
            return column.message.to_string();
        }
    }

    if raw.contains("command failed: psql") {
        return spec.psql_message.to_string();
    }

    spec.fallback_message.to_string()
}
