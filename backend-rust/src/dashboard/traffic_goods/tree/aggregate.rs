use super::super::model::DashboardTrafficGoodsMetricRow;

pub(super) fn aggregate_traffic_goods_rows(
    rows: &[DashboardTrafficGoodsMetricRow],
    product_id: &str,
    product_name: &str,
    source_level: i32,
    source_name: &str,
    parent_source_name: &str,
) -> DashboardTrafficGoodsMetricRow {
    let mut aggregated = DashboardTrafficGoodsMetricRow {
        product_id: product_id.to_string(),
        product_name: product_name.to_string(),
        source_level,
        source_name: source_name.to_string(),
        parent_source_name: parent_source_name.to_string(),
        curr_visitor_count: 0.0,
        prev_visitor_count: 0.0,
        curr_page_view: 0.0,
        prev_page_view: 0.0,
        curr_product_favorite_user_count: 0.0,
        prev_product_favorite_user_count: 0.0,
        curr_cart_user_count: 0.0,
        prev_cart_user_count: 0.0,
        curr_order_buyer_count: 0.0,
        prev_order_buyer_count: 0.0,
        curr_pay_buyer_count: 0.0,
        prev_pay_buyer_count: 0.0,
        curr_pay_quantity: 0.0,
        prev_pay_quantity: 0.0,
        curr_pay_amount: 0.0,
        prev_pay_amount: 0.0,
        curr_pay_conversion_rate: 0.0,
        prev_pay_conversion_rate: 0.0,
        curr_avg_order_value: 0.0,
        prev_avg_order_value: 0.0,
    };

    for row in rows {
        aggregated.curr_visitor_count += row.curr_visitor_count;
        aggregated.prev_visitor_count += row.prev_visitor_count;
        aggregated.curr_page_view += row.curr_page_view;
        aggregated.prev_page_view += row.prev_page_view;
        aggregated.curr_product_favorite_user_count += row.curr_product_favorite_user_count;
        aggregated.prev_product_favorite_user_count += row.prev_product_favorite_user_count;
        aggregated.curr_cart_user_count += row.curr_cart_user_count;
        aggregated.prev_cart_user_count += row.prev_cart_user_count;
        aggregated.curr_order_buyer_count += row.curr_order_buyer_count;
        aggregated.prev_order_buyer_count += row.prev_order_buyer_count;
        aggregated.curr_pay_buyer_count += row.curr_pay_buyer_count;
        aggregated.prev_pay_buyer_count += row.prev_pay_buyer_count;
        aggregated.curr_pay_quantity += row.curr_pay_quantity;
        aggregated.prev_pay_quantity += row.prev_pay_quantity;
        aggregated.curr_pay_amount += row.curr_pay_amount;
        aggregated.prev_pay_amount += row.prev_pay_amount;
    }

    aggregated.curr_pay_conversion_rate = ratio_or_zero(
        aggregated.curr_pay_buyer_count,
        aggregated.curr_visitor_count,
    );
    aggregated.prev_pay_conversion_rate = ratio_or_zero(
        aggregated.prev_pay_buyer_count,
        aggregated.prev_visitor_count,
    );
    aggregated.curr_avg_order_value =
        ratio_or_zero(aggregated.curr_pay_amount, aggregated.curr_pay_buyer_count);
    aggregated.prev_avg_order_value =
        ratio_or_zero(aggregated.prev_pay_amount, aggregated.prev_pay_buyer_count);

    aggregated
}

fn ratio_or_zero(numerator: f64, denominator: f64) -> f64 {
    if denominator.abs() > f64::EPSILON {
        numerator / denominator
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(
        curr_visitor_count: f64,
        curr_pay_buyer_count: f64,
        curr_pay_conversion_rate: f64,
        prev_visitor_count: f64,
        prev_pay_buyer_count: f64,
        prev_pay_conversion_rate: f64,
    ) -> DashboardTrafficGoodsMetricRow {
        DashboardTrafficGoodsMetricRow {
            product_id: "P1".to_string(),
            product_name: "Product One".to_string(),
            source_level: 3,
            source_name: "child-source".to_string(),
            parent_source_name: "parent-source".to_string(),
            curr_visitor_count,
            prev_visitor_count,
            curr_page_view: 0.0,
            prev_page_view: 0.0,
            curr_product_favorite_user_count: 0.0,
            prev_product_favorite_user_count: 0.0,
            curr_cart_user_count: 0.0,
            prev_cart_user_count: 0.0,
            curr_order_buyer_count: 0.0,
            prev_order_buyer_count: 0.0,
            curr_pay_buyer_count,
            prev_pay_buyer_count,
            curr_pay_quantity: 0.0,
            prev_pay_quantity: 0.0,
            curr_pay_amount: 0.0,
            prev_pay_amount: 0.0,
            curr_pay_conversion_rate,
            prev_pay_conversion_rate,
            curr_avg_order_value: 0.0,
            prev_avg_order_value: 0.0,
        }
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-12,
            "actual {actual} expected {expected}"
        );
    }

    #[test]
    fn aggregate_recomputes_pay_conversion_rate_from_summed_counts() {
        let aggregated = aggregate_traffic_goods_rows(
            &[
                row(1000.0, 10.0, 0.10, 100.0, 1.0, 0.50),
                row(10.0, 9.0, 0.90, 100.0, 3.0, 0.10),
            ],
            "P1",
            "Product One",
            2,
            "parent-source",
            "All",
        );

        assert_close(aggregated.curr_pay_conversion_rate, 19.0 / 1010.0);
        assert_close(aggregated.prev_pay_conversion_rate, 4.0 / 200.0);
    }

    #[test]
    fn aggregate_returns_zero_pay_conversion_rate_when_visitors_are_zero() {
        let aggregated = aggregate_traffic_goods_rows(
            &[row(0.0, 5.0, 0.50, 0.0, 4.0, 0.25)],
            "P1",
            "Product One",
            2,
            "parent-source",
            "All",
        );

        assert_eq!(aggregated.curr_pay_conversion_rate, 0.0);
        assert_eq!(aggregated.prev_pay_conversion_rate, 0.0);
    }

    #[test]
    fn aggregate_recomputes_avg_order_value_from_summed_counts() {
        let mut high_volume = row(1000.0, 10.0, 0.10, 100.0, 1.0, 0.50);
        high_volume.curr_pay_amount = 1000.0;
        high_volume.prev_pay_amount = 100.0;
        high_volume.curr_avg_order_value = 1.0;
        high_volume.prev_avg_order_value = 1.0;

        let mut low_volume = row(10.0, 9.0, 0.90, 100.0, 3.0, 0.10);
        low_volume.curr_pay_amount = 900.0;
        low_volume.prev_pay_amount = 200.0;
        low_volume.curr_avg_order_value = 999.0;
        low_volume.prev_avg_order_value = 999.0;

        let aggregated = aggregate_traffic_goods_rows(
            &[high_volume, low_volume],
            "P1",
            "Product One",
            2,
            "parent-source",
            "All",
        );

        assert_close(aggregated.curr_avg_order_value, 1900.0 / 19.0);
        assert_close(aggregated.prev_avg_order_value, 300.0 / 4.0);
    }
}
