use sqlx::{Postgres, QueryBuilder};

use super::super::super::anchor_tags::expand_anchor_tag_filter_values;

pub(super) fn push_anchor_tags_filter(builder: &mut QueryBuilder<Postgres>, values: &[String]) {
    builder.push(" AND (");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            builder.push(" OR ");
        }
        let expanded_values = expand_anchor_tag_filter_values(value);
        builder.push("(");
        builder.push("tags && ");
        builder.push_bind(expanded_values.clone());
        builder.push("::TEXT[]");
        let pattern = format!("%{}%", value);
        builder.push(" OR anchor_desc ILIKE ");
        builder.push_bind(pattern);
        for expanded_value in expanded_values {
            if expanded_value == *value {
                continue;
            }
            builder.push(" OR anchor_desc ILIKE ");
            builder.push_bind(format!("%{}%", expanded_value));
        }
        builder.push(")");
    }
    builder.push(")");
}
