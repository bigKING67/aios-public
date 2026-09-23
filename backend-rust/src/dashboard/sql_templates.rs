pub(super) fn escape_sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub(super) fn apply_sql_template(template: &str, replacements: &[(&str, String)]) -> String {
    replacements
        .iter()
        .fold(template.to_string(), |acc, (needle, value)| {
            acc.replace(needle, value)
        })
}
