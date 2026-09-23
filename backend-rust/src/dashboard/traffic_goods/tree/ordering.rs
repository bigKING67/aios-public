use super::super::model::DashboardTrafficGoodsMetricRow;

pub(super) fn sort_traffic_goods_rows(rows: &mut [DashboardTrafficGoodsMetricRow]) {
    rows.sort_by(|left, right| {
        if left.source_level != right.source_level {
            return left.source_level.cmp(&right.source_level);
        }
        let parent_cmp = left.parent_source_name.cmp(&right.parent_source_name);
        if parent_cmp != std::cmp::Ordering::Equal {
            return parent_cmp;
        }
        left.source_name.cmp(&right.source_name)
    });
}
