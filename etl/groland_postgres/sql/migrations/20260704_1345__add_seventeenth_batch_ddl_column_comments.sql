COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.week_period IS
  '周时间段，格式为 YYYY/M/D～YYYY/M/D。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.as_of_date IS
  '同期口径截止日期。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.observed_days IS
  '同期对比已观察天数，取值 1 到 7。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.product_id IS
  '抖音商品 ID。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.product_title IS
  '抖音商品标题。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.product_url IS
  '抖音商品详情页 URL。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_exposure_user_count IS
  '本周同期窗口商品卡曝光用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_exposure_user_count IS
  '上周同期窗口商品卡曝光用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_click_user_count IS
  '本周同期窗口商品卡点击用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_click_user_count IS
  '上周同期窗口商品卡点击用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_buyer_count IS
  '本周同期窗口商品卡成交买家数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_buyer_count IS
  '上周同期窗口商品卡成交买家数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_cart_user_count IS
  '本周同期窗口商品卡加购用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_cart_user_count IS
  '上周同期窗口商品卡加购用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_favorite_user_count IS
  '本周同期窗口商品卡收藏用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_favorite_user_count IS
  '上周同期窗口商品卡收藏用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_bounce_user_count IS
  '本周同期窗口商品卡跳失用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_bounce_user_count IS
  '上周同期窗口商品卡跳失用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_order_count IS
  '本周同期窗口商品卡成交订单数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_order_count IS
  '上周同期窗口商品卡成交订单数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_user_pay_amount IS
  '本周同期窗口商品卡用户支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_user_pay_amount IS
  '上周同期窗口商品卡用户支付金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.card_user_pay_amount_delta IS
  '商品卡用户支付金额环比差额，等于本周同期金额减上周同期金额。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_click_rate IS
  '本周同期商品卡点击率，等于点击用户数除以曝光用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_click_rate IS
  '上周同期商品卡点击率，等于点击用户数除以曝光用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.curr_card_click_to_pay_rate IS
  '本周同期商品卡点击成交率，等于成交买家数除以点击用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.prev_card_click_to_pay_rate IS
  '上周同期商品卡点击成交率，等于成交买家数除以点击用户数。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.created_at IS
  '商品卡周指标记录创建时间。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_card_metrics_week.updated_at IS
  '商品卡周指标记录最近更新时间，由更新时间触发器维护。';

COMMENT ON COLUMN ads.report_douyin_trade_sale_channel_metrics_week.created_at IS
  '渠道周 GMV 指标记录创建时间。';
COMMENT ON COLUMN ads.report_douyin_trade_sale_channel_metrics_week.updated_at IS
  '渠道周 GMV 指标记录最近更新时间，由更新时间触发器维护。';
