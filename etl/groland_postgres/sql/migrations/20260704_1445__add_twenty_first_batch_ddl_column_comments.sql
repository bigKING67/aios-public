COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.week_period IS
  '周时间段，格式为 YYYY/M/D～YYYY/M/D。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.platform IS
  '业务平台，固定为 taobao。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.product_id IS
  '淘宝商品 ID。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.traffic_channel IS
  '流量渠道，取值为搜索、推荐、关键词推广、人群推广、场景推广或其他。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.product_name IS
  '淘宝商品名称。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.as_of_date IS
  '同期口径截止日期。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.observed_days IS
  '同期对比已观察天数，取值 1 到 7。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_impression_count IS
  '上周同期窗口曝光量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_click_count IS
  '上周同期窗口点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_cart_count IS
  '上周同期窗口加购量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_pay_buyer_count IS
  '上周同期窗口支付人数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_pay_amount IS
  '上周同期窗口支付金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.gmv_delta IS
  '渠道 GMV 增量，等于本周同期支付金额减上周同期支付金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_cost IS
  '本周同期窗口投放消耗金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_cost IS
  '上周同期窗口投放消耗金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.cost_delta IS
  '渠道消耗增量，等于本周同期消耗减上周同期消耗。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_ctr IS
  '本周同期点击率，等于点击量除以曝光量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_ctr IS
  '上周同期点击率，等于点击量除以曝光量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_click_to_cart_rate IS
  '本周同期点击加购率，等于加购量除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_click_to_cart_rate IS
  '上周同期点击加购率，等于加购量除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_cart_to_pay_rate IS
  '本周同期加购支付率，等于支付人数除以加购量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_cart_to_pay_rate IS
  '上周同期加购支付率，等于支付人数除以加购量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_avg_order_value IS
  '本周同期客单价，等于支付金额除以支付人数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_avg_order_value IS
  '上周同期客单价，等于支付金额除以支付人数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_roi IS
  '本周同期 ROI，等于支付金额除以投放消耗金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_roi IS
  '上周同期 ROI，等于支付金额除以投放消耗金额。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_avg_click_cost IS
  '本周同期平均点击花费，等于投放消耗金额除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_avg_click_cost IS
  '上周同期平均点击花费，等于投放消耗金额除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_cpm IS
  '本周同期千次曝光成本，等于投放消耗金额乘以 1000 后除以曝光量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_cpm IS
  '上周同期千次曝光成本，等于投放消耗金额乘以 1000 后除以曝光量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_click_conversion_rate IS
  '本周同期点击支付转化率，等于支付人数除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_click_conversion_rate IS
  '上周同期点击支付转化率，等于支付人数除以点击量。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_wangwang_consult_count IS
  '本周同期窗口旺旺咨询数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_wangwang_consult_count IS
  '上周同期窗口旺旺咨询数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_member_join_count IS
  '本周同期窗口会员入会数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_member_join_count IS
  '上周同期窗口会员入会数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_new_buyer_count IS
  '本周同期窗口新客支付人数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_new_buyer_count IS
  '上周同期窗口新客支付人数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_coupon_claim_count IS
  '本周同期窗口优惠券领取数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_coupon_claim_count IS
  '上周同期窗口优惠券领取数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.curr_total_favorite_cart_count IS
  '本周同期窗口收藏加购总数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.prev_total_favorite_cart_count IS
  '上周同期窗口收藏加购总数。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.created_at IS
  '淘宝单品流量渠道周指标记录创建时间。';
COMMENT ON COLUMN ads.report_taobao_one_goods_traffic_channel_metric_week.updated_at IS
  '淘宝单品流量渠道周指标记录最近更新时间，由更新时间触发器维护。';
