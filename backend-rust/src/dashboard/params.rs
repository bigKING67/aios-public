use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(super) struct OverviewQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) include_platform_share: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
    pub(super) platform: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveGoodsQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) scope: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct OverviewDetailsQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) platform: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct CreatorLiveOverviewQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct CreatorLiveDetailsQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) cooperation_status: Option<String>,
    pub(super) keyword: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct CreatorShortVideoOverviewQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct CreatorShortVideoDetailsQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) cooperation_status: Option<String>,
    pub(super) keyword: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct GoodsQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) top_n: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct TrafficQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
    pub(super) platform: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct GoodsCardTrafficQueryParams {
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
    pub(super) prev_start_date: Option<String>,
    pub(super) prev_end_date: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) product_id: Option<String>,
    pub(super) shop_id: Option<String>,
}
