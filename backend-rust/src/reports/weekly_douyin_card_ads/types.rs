use chrono::NaiveDate;

pub(super) struct CardAdsSummary {
    pub(super) as_of_date: Option<NaiveDate>,
    pub(super) observed_days: Option<i32>,
    pub(super) total_curr_gmv: f64,
    pub(super) total_prev_gmv: f64,
}

pub(super) struct ProductAttributionItems {
    pub(super) diagnosis_product_id: String,
    pub(super) diagnosis_product_name: String,
    pub(super) product_items: Vec<serde_json::Value>,
}
