use std::collections::{HashMap, HashSet};

use super::super::super::model::DashboardTrafficMetricRow;

pub(super) struct SourceLevelRows {
    pub(super) level1_rows: Vec<DashboardTrafficMetricRow>,
    pub(super) level2_rows: Vec<DashboardTrafficMetricRow>,
    pub(super) level3_rows: Vec<DashboardTrafficMetricRow>,
}

pub(super) struct Level2Groups {
    pub(super) level2_by_parent: HashMap<String, Vec<DashboardTrafficMetricRow>>,
    pub(super) orphan_level2_rows: Vec<DashboardTrafficMetricRow>,
}

pub(super) struct Level3Groups {
    pub(super) level3_by_parent: HashMap<String, Vec<DashboardTrafficMetricRow>>,
    pub(super) orphan_level3_rows: Vec<DashboardTrafficMetricRow>,
}

pub(super) fn split_source_levels(rows: &[DashboardTrafficMetricRow]) -> SourceLevelRows {
    let mut level1_rows = Vec::<DashboardTrafficMetricRow>::new();
    let mut level2_rows = Vec::<DashboardTrafficMetricRow>::new();
    let mut level3_rows = Vec::<DashboardTrafficMetricRow>::new();

    for row in rows {
        match row.source_level {
            1 => level1_rows.push(row.clone()),
            2 => level2_rows.push(row.clone()),
            level if level >= 3 => level3_rows.push(row.clone()),
            _ => {}
        }
    }

    SourceLevelRows {
        level1_rows,
        level2_rows,
        level3_rows,
    }
}

pub(super) fn collect_level1_name_set(
    level1_rows: &[DashboardTrafficMetricRow],
) -> HashSet<String> {
    level1_rows
        .iter()
        .map(|row| row.source_name.clone())
        .collect()
}

pub(super) fn group_level2_by_parent(
    level2_rows: Vec<DashboardTrafficMetricRow>,
    level1_name_set: &HashSet<String>,
) -> Level2Groups {
    let mut level2_by_parent = HashMap::<String, Vec<DashboardTrafficMetricRow>>::new();
    let mut orphan_level2_rows = Vec::<DashboardTrafficMetricRow>::new();

    for row in level2_rows {
        if level1_name_set.contains(row.parent_source_name.as_str()) {
            level2_by_parent
                .entry(row.parent_source_name.clone())
                .or_default()
                .push(row);
        } else {
            orphan_level2_rows.push(row);
        }
    }

    Level2Groups {
        level2_by_parent,
        orphan_level2_rows,
    }
}

pub(super) fn collect_resolvable_level2_parent_names(
    level2_by_parent: &HashMap<String, Vec<DashboardTrafficMetricRow>>,
    orphan_level2_rows: &[DashboardTrafficMetricRow],
) -> HashSet<String> {
    let mut parent_name_counts = HashMap::<String, usize>::new();
    for rows in level2_by_parent.values() {
        for row in rows {
            *parent_name_counts
                .entry(row.source_name.clone())
                .or_default() += 1;
        }
    }
    for row in orphan_level2_rows {
        *parent_name_counts
            .entry(row.source_name.clone())
            .or_default() += 1;
    }

    parent_name_counts
        .into_iter()
        .filter_map(|(source_name, count)| (count == 1).then_some(source_name))
        .collect()
}

pub(super) fn group_level3_by_parent(
    level3_rows: Vec<DashboardTrafficMetricRow>,
    resolvable_level2_parent_names: &HashSet<String>,
) -> Level3Groups {
    let mut level3_by_parent = HashMap::<String, Vec<DashboardTrafficMetricRow>>::new();
    let mut orphan_level3_rows = Vec::<DashboardTrafficMetricRow>::new();

    for row in level3_rows {
        if resolvable_level2_parent_names.contains(row.parent_source_name.as_str()) {
            level3_by_parent
                .entry(row.parent_source_name.clone())
                .or_default()
                .push(row);
        } else {
            orphan_level3_rows.push(row);
        }
    }

    Level3Groups {
        level3_by_parent,
        orphan_level3_rows,
    }
}
