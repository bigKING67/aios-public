use super::super::super::model::DashboardTrafficMetricRow;
use super::*;

fn row(
    source_level: i32,
    source_name: &str,
    parent_source_name: &str,
    curr_visitor_count: f64,
) -> DashboardTrafficMetricRow {
    DashboardTrafficMetricRow {
        source_level,
        source_name: source_name.to_string(),
        parent_source_name: parent_source_name.to_string(),
        curr_visitor_count,
        prev_visitor_count: 0.0,
        curr_new_visitor_count: 0.0,
        prev_new_visitor_count: 0.0,
        curr_avg_stay_duration: 0.0,
        prev_avg_stay_duration: 0.0,
        curr_view_3s_user_count: 0.0,
        prev_view_3s_user_count: 0.0,
        curr_product_click_user_count: 0.0,
        prev_product_click_user_count: 0.0,
        curr_pay_buyer_count: 0.0,
        prev_pay_buyer_count: 0.0,
        curr_pay_amount: 0.0,
        prev_pay_amount: 0.0,
        curr_follow_shop_user_count: 0.0,
        prev_follow_shop_user_count: 0.0,
        curr_product_favorite_user_count: 0.0,
        prev_product_favorite_user_count: 0.0,
        curr_cart_user_count: 0.0,
        prev_cart_user_count: 0.0,
        curr_cart_count: 0.0,
        prev_cart_count: 0.0,
        curr_pay_conversion_rate: 0.0,
        prev_pay_conversion_rate: 0.0,
        curr_uv_value: 0.0,
        prev_uv_value: 0.0,
        curr_avg_order_value: 0.0,
        prev_avg_order_value: 0.0,
    }
}

#[test]
fn ambiguous_level3_parent_is_kept_under_unknown_source() {
    let tree = build_traffic_source_tree(&[
        row(1, "内容", "All", 10.0),
        row(1, "搜索", "All", 20.0),
        row(2, "其他", "内容", 3.0),
        row(2, "其他", "搜索", 4.0),
        row(3, "详情页推荐", "其他", 7.0),
    ]);

    let unknown_source = tree
        .iter()
        .find(|node| node["sourceName"] == "未知来源")
        .expect("ambiguous level3 rows should be retained");
    let unknown_children = unknown_source["children"].as_array().unwrap();
    assert_eq!(unknown_children.len(), 1);
    assert_eq!(unknown_children[0]["sourceName"], "未匹配二级来源");
    assert_eq!(
        unknown_children[0]["children"][0]["sourceName"],
        "详情页推荐"
    );

    let known_children = tree
        .iter()
        .filter(|node| node["sourceName"] != "未知来源")
        .flat_map(|node| node["children"].as_array().unwrap().iter())
        .flat_map(|node| node["children"].as_array().unwrap().iter())
        .count();
    assert_eq!(known_children, 0);
}
